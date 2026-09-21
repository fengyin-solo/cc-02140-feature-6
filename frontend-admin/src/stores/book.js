import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { books as initialBooks } from '@/data/mockData'
import { useBorrowStore } from '@/stores/borrow'
import { useCategoryStore } from '@/stores/category'

// 导入本地封面图片
import hlmCover from '@/views/img/hlm.webp'
import jsCover from '@/views/img/js.webp'
import sgyyCover from '@/views/img/sgyy.webp'
import vueCover from '@/views/img/vue.jpeg'
import sjCover from '@/views/img/sj.webp'
import jjxCover from '@/views/img/jjx.webp'
import xlxCover from '@/views/img/xlx.webp'
import sxCover from '@/views/img/sx.webp'

const STORAGE_KEY = 'library_books'
const BATCH_STATE_KEY = 'library_book_batch_state'

function createDefaultBatchState() {
  return {
    pendingIds: [],
    results: [],
    lastPayload: null
  }
}

function loadBatchState() {
  const stored = localStorage.getItem(BATCH_STATE_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored)
      return {
        ...createDefaultBatchState(),
        ...parsed
      }
    } catch (e) {
      console.error('Failed to parse stored batch state:', e)
    }
  }
  return createDefaultBatchState()
}

// 默认书籍封面图片（使用本地图片）
const DEFAULT_COVERS = [
  hlmCover,
  jsCover,
  sgyyCover,
  vueCover,
  sjCover,
  jjxCover,
  xlxCover,
  sxCover
]

// 获取默认封面
function getDefaultCover(index) {
  return DEFAULT_COVERS[index % DEFAULT_COVERS.length]
}

// 检查并修复书籍封面
function fixBookCovers(books) {
  return books.map((book, index) => {
    // 如果封面是 SVG data URI、placeholder 或外部链接，则使用本地封面
    if (!book.cover || book.cover.includes('data:image/svg') || book.cover.includes('placeholder.com') || book.cover.startsWith('http')) {
      return {
        ...book,
        cover: getDefaultCover(index)
      }
    }
    return book
  })
}

export const useBookStore = defineStore('book', () => {
  // 从 localStorage 读取或使用初始数据
  const loadBooks = () => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsedBooks = JSON.parse(stored)
        // 修复旧数据中的图片链接
        return fixBookCovers(parsedBooks)
      } catch (e) {
        console.error('Failed to parse stored books:', e)
      }
    }
    return [...initialBooks]
  }

  const books = ref(loadBooks())
  const loading = ref(false)
  const batchState = ref(loadBatchState())
  const batchSubmitting = ref(false)

  // 监听变化并保存到 localStorage
  watch(books, (newBooks) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newBooks))
  }, { deep: true })

  watch(batchState, (newState) => {
    localStorage.setItem(BATCH_STATE_KEY, JSON.stringify(newState))
  }, { deep: true })

  const totalBooks = computed(() => books.value.length)
  const totalAvailable = computed(() =>
    books.value.reduce((sum, book) => sum + book.available, 0)
  )

  function getBookById(id) {
    return books.value.find(book => book.id === id)
  }

  function addBook(book) {
    const newId = books.value.length > 0
      ? Math.max(...books.value.map(b => b.id)) + 1
      : 1
    books.value.push({ ...book, id: newId })
    return newId
  }

  function updateBook(id, data) {
    const index = books.value.findIndex(book => book.id === id)
    if (index !== -1) {
      books.value[index] = { ...books.value[index], ...data }
      return true
    }
    return false
  }

  function clearBatchResults() {
    batchState.value = createDefaultBatchState()
  }

  async function batchUpdateBooks(ids, payload) {
    if (batchSubmitting.value) {
      return {
        duplicate: true,
        results: batchState.value.results,
        pendingIds: batchState.value.pendingIds
      }
    }

    const uniqueIds = [...new Set(ids || [])]
    if (uniqueIds.length === 0) {
      return {
        empty: true,
        results: [],
        pendingIds: batchState.value.pendingIds
      }
    }

    batchSubmitting.value = true

    try {
      // 模拟接口提交，避免重复点击产生并发请求
      await new Promise(resolve => setTimeout(resolve, 500))

      const borrowStore = useBorrowStore()
      const categoryStore = useCategoryStore()

      const categoryId = Number(payload?.categoryId)
      const total = Number(payload?.total)
      const location = String(payload?.location ?? '').trim()
      const category = categoryStore.getCategoryById(categoryId)

      const inventoryInvalid = !Number.isSafeInteger(total) || total < 0
      const categoryInvalid = !category
      const locationInvalid = !location

      const results = uniqueIds.map(id => {
        const book = getBookById(id)
        const baseResult = {
          id,
          isbn: book?.isbn || '',
          title: book?.title || `ID：${id}`,
          before: book ? {
            categoryId: book.categoryId,
            categoryName: book.categoryName,
            total: book.total,
            available: book.available,
            location: book.location
          } : null
        }

        if (!book) {
          return {
            ...baseResult,
            status: 'failed',
            reason: '图书不存在或已被删除，请刷新列表后重试'
          }
        }

        const errors = []
        if (categoryInvalid) errors.push('分类不存在或已被删除')
        if (inventoryInvalid) errors.push('库存总数必须是不小于 0 的整数')
        if (locationInvalid) errors.push('存放位置不能为空')
        if (errors.length > 0) {
          return {
            ...baseResult,
            status: 'failed',
            reason: errors.join('；')
          }
        }

        const activeBorrowed = borrowStore.records.filter(record =>
          record.bookId === id &&
          (record.status === 'borrowed' || record.status === 'overdue')
        ).length
        const currentTotal = Number(book.total)
        const currentAvailable = Number(book.available)
        const inventoryInvalidBook =
          !Number.isSafeInteger(currentTotal) ||
          currentTotal < 0 ||
          !Number.isSafeInteger(currentAvailable) ||
          currentAvailable < 0 ||
          currentAvailable > currentTotal ||
          activeBorrowed > currentTotal

        if (inventoryInvalidBook) {
          return {
            ...baseResult,
            status: 'failed',
            reason: '当前库存数据异常（可用数、总库存或在借数不一致），请先修正单条库存'
          }
        }

        const inventoryBorrowed = Math.max(0, currentTotal - currentAvailable)
        // 借阅记录是在借依据；库存差值用于发现未同步到记录的未归还原数
        const borrowedCount = Math.max(activeBorrowed, inventoryBorrowed)

        if (total < borrowedCount) {
          return {
            ...baseResult,
            status: 'failed',
            reason: `当前有 ${borrowedCount} 册未归还，库存总数不能低于该数量`
          }
        }

        const available = total - borrowedCount
        updateBook(id, {
          categoryId,
          categoryName: category.name,
          total,
          available,
          location
        })

        return {
          ...baseResult,
          status: 'success',
          reason: `更新成功；在借 ${borrowedCount} 册，可用 ${available} 册`,
          after: {
            categoryId,
            categoryName: category.name,
            total,
            available,
            location
          }
        }
      })

      const pendingIds = results
        .filter(result => result.status === 'failed' && getBookById(result.id))
        .map(result => result.id)

      batchState.value = {
        pendingIds,
        results,
        lastPayload: {
          categoryId,
          total,
          location
        }
      }

      return {
        empty: false,
        duplicate: false,
        results,
        pendingIds
      }
    } finally {
      batchSubmitting.value = false
    }
  }

  function deleteBook(id) {
    const index = books.value.findIndex(book => book.id === id)
    if (index !== -1) {
      books.value.splice(index, 1)
      batchState.value = {
        ...batchState.value,
        pendingIds: batchState.value.pendingIds.filter(pendingId => pendingId !== id)
      }
      return true
    }
    return false
  }

  function searchBooks(keyword) {
    if (!keyword) return books.value
    const lowerKeyword = keyword.toLowerCase()
    return books.value.filter(book =>
      book.title.toLowerCase().includes(lowerKeyword) ||
      book.author.toLowerCase().includes(lowerKeyword) ||
      book.isbn.includes(keyword)
    )
  }

  function filterByCategory(categoryId) {
    if (!categoryId) return books.value
    return books.value.filter(book => book.categoryId === categoryId)
  }

  return {
    books,
    loading,
    batchState,
    batchSubmitting,
    totalBooks,
    totalAvailable,
    getBookById,
    addBook,
    updateBook,
    batchUpdateBooks,
    clearBatchResults,
    deleteBook,
    searchBooks,
    filterByCategory
  }
})
