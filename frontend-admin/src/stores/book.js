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

  // 监听变化并保存到 localStorage
  watch(books, (newBooks) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newBooks))
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

  function deleteBook(id) {
    const index = books.value.findIndex(book => book.id === id)
    if (index !== -1) {
      books.value.splice(index, 1)
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

  // 统计某本图书当前正在借阅（含逾期）的在借数量
  function getBorrowedCount(bookId) {
    const borrowStore = useBorrowStore()
    return borrowStore.records.filter(
      record => record.bookId === bookId &&
        (record.status === 'borrowed' || record.status === 'overdue')
    ).length
  }

  /**
   * 批量维护图书的分类、库存（总库存）与存放位置
   * - 逐条校验、逐条更新，返回每条图书的成功/失败结果
   * - 校验不通过的图书（不存在、分类失效、库存异常、库存低于在借量）不会产生任何改动
   * - 库存调整时按在借量自动校正可借数量，保证库存数据与借阅数据一致
   * @param {number[]} ids 待处理图书 id 列表（自动去重）
   * @param {{ categoryId?: number|null, total?: number|null, location?: string|null }} updates
   *        仅更新非 null 的字段
   * @returns {{ success: Array, failure: Array, results: Array }}
   */
  function batchUpdateBooks(ids, updates = {}) {
    const categoryStore = useCategoryStore()
    const results = []

    // 去重，避免同一本图书被重复提交处理两次
    const uniqueIds = [...new Set(ids)]

    uniqueIds.forEach(id => {
      const index = books.value.findIndex(book => book.id === id)
      if (index === -1) {
        results.push({ id, success: false, reason: '图书不存在或已被删除' })
        return
      }

      const book = books.value[index]

      // 分类映射校验
      if (updates.categoryId !== undefined && updates.categoryId !== null) {
        const category = categoryStore.getCategoryById(updates.categoryId)
        if (!category) {
          results.push({ id, title: book.title, success: false, reason: '所选分类不存在或已被删除，请重新选择分类' })
          return
        }
      }

      // 库存异常校验：必须为不小于 0 的整数
      let newTotal = book.total
      if (updates.total !== undefined && updates.total !== null) {
        const total = Number(updates.total)
        if (!Number.isInteger(total) || total < 0) {
          results.push({ id, title: book.title, success: false, reason: '库存数量异常：必须为不小于 0 的整数' })
          return
        }
        newTotal = total
      }

      // 部分图书正在借阅时，库存不能低于在借数量，否则在借图书无法对应
      const borrowedCount = getBorrowedCount(id)
      if (newTotal < borrowedCount) {
        results.push({
          id,
          title: book.title,
          success: false,
          reason: `该图书有 ${borrowedCount} 册正在借阅，库存不能低于在借数量`
        })
        return
      }

      // 逐条应用更新（库存联动：保持在借量不变，重算可借数量）
      const patch = {}
      if (updates.categoryId !== undefined && updates.categoryId !== null) {
        patch.categoryId = updates.categoryId
        patch.categoryName = categoryStore.getCategoryById(updates.categoryId)?.name || ''
      }
      if (updates.total !== undefined && updates.total !== null) {
        patch.total = newTotal
        patch.available = newTotal - borrowedCount
      }
      if (updates.location !== undefined && updates.location !== null) {
        patch.location = String(updates.location).trim()
      }

      books.value[index] = { ...books.value[index], ...patch }
      results.push({
        id,
        title: book.title,
        success: true,
        borrowedCount,
        changes: Object.keys(patch)
      })
    })

    return {
      success: results.filter(item => item.success),
      failure: results.filter(item => !item.success),
      results
    }
  }

  return {
    books,
    loading,
    totalBooks,
    totalAvailable,
    getBookById,
    addBook,
    updateBook,
    deleteBook,
    searchBooks,
    filterByCategory,
    getBorrowedCount,
    batchUpdateBooks
  }
})
