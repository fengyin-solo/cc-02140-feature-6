<template>
  <div class="book-list">
    <h2 class="page-title animate-fade-in">图书管理</h2>

    <!-- 搜索区域 -->
    <div class="search-area animate-slide-down">
      <a-row :gutter="16" align="middle">
        <a-col :xs="24" :sm="12" :md="8" :lg="6">
          <div class="search-input-wrapper">
            <a-input
              v-model:value="searchKeyword"
              placeholder="搜索书名、作者、ISBN"
              allow-clear
              @press-enter="handleSearch"
              @input="onSearchInput"
              class="search-input"
            >
              <template #suffix>
                <SearchOutlined 
                  :class="['search-icon', { 'searching': isSearching }]" 
                  @click="handleSearch" 
                />
              </template>
            </a-input>
          </div>
        </a-col>
        <a-col :xs="24" :sm="12" :md="8" :lg="6">
          <a-select
            v-model:value="selectedCategory"
            placeholder="选择分类"
            allow-clear
            style="width: 100%"
            @change="handleCategoryChange"
            class="category-select"
          >
            <a-select-option
              v-for="cat in categoryStore.categories"
              :key="cat.id"
              :value="cat.id"
            >
              {{ cat.name }}
            </a-select-option>
          </a-select>
        </a-col>
        <a-col :xs="24" :sm="24" :md="8" :lg="12" style="text-align: right;">
          <a-space>
            <a-button
              :disabled="selectedRowKeys.length === 0"
              class="batch-btn"
              @click="showBatchModal"
            >
              <UnorderedListOutlined /> 批量维护
              <a-badge
                v-if="selectedRowKeys.length > 0"
                :count="selectedRowKeys.length"
                :number-style="{ backgroundColor: '#1890ff' }"
                style="margin-left: 4px"
              />
            </a-button>
            <a-button type="primary" @click="showAddModal" class="add-btn">
              <PlusOutlined /> 新增图书
            </a-button>
          </a-space>
        </a-col>
      </a-row>

      <!-- 多选操作条 -->
      <transition name="fade-slide">
        <div v-if="selectedRowKeys.length > 0" class="batch-tip">
          <span class="selected-count">
            已选择 <strong>{{ selectedRowKeys.length }}</strong> 本图书
          </span>
          <a-space>
            <a-button type="primary" size="small" @click="showBatchModal">
              <UnorderedListOutlined /> 批量维护分类 / 库存 / 存放位置
            </a-button>
            <a-button type="link" size="small" class="clear-btn" @click="clearSelection">
              取消选择
            </a-button>
          </a-space>
        </div>
      </transition>

      <!-- 搜索结果提示 -->
      <transition name="fade-slide">
        <div v-if="searchKeyword || selectedCategory" class="search-result-tip">
          <span class="result-count">
            找到 <strong>{{ filteredBooks.length }}</strong> 条结果
          </span>
          <a-button type="link" size="small" @click="clearFilters" class="clear-btn">
            清除筛选
          </a-button>
        </div>
      </transition>
    </div>

    <!-- 图书表格 -->
    <div :class="['table-container', 'animate-fade-in', { 'table-loading': tableAnimating }]">
      <!-- 加载动画遮罩 -->
      <transition name="fade">
        <div v-if="tableAnimating" class="table-loading-overlay">
          <div class="loading-spinner">
            <div class="spinner-ring"></div>
            <span>搜索中...</span>
          </div>
        </div>
      </transition>
      
      <a-table
        :columns="columns"
        :data-source="filteredBooks"
        :loading="loading"
        row-key="id"
        :row-selection="{ selectedRowKeys, onChange: onSelectionChange }"
        :pagination="{ pageSize: 10, showTotal: total => `共 ${total} 条` }"
        :row-class-name="getRowClassName"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'book'">
            <div class="book-cell">
              <div class="book-thumb-wrapper">
                <img :src="record.cover" :alt="record.title" class="book-thumb" />
              </div>
              <div class="book-detail">
                <div class="book-name">{{ record.title }}</div>
                <div class="book-isbn">ISBN: {{ record.isbn }}</div>
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'category'">
            <a-tag color="blue" class="category-tag">{{ record.categoryName }}</a-tag>
          </template>
          <template v-else-if="column.key === 'stock'">
            <div class="stock-cell">
              <span :class="['stock-value', { 'low-stock': record.available < 3 }]">
                {{ record.available }} / {{ record.total }}
              </span>
              <div class="stock-bar">
                <div 
                  class="stock-bar-fill" 
                  :style="{ 
                    width: `${(record.available / record.total) * 100}%`,
                    backgroundColor: record.available < 3 ? '#ff4d4f' : '#52c41a'
                  }"
                ></div>
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="2">
              <a-button type="link" size="small" class="table-action-btn detail-btn" @click="showDetailDrawer(record)">
                <EyeOutlined /> 详情
              </a-button>
              <a-button type="link" size="small" class="table-action-btn edit-btn" @click="showEditModal(record)">
                <EditOutlined /> 编辑
              </a-button>
              <a-popconfirm
                title="确定要删除这本图书吗？"
                ok-text="确定"
                cancel-text="取消"
                @confirm="handleDelete(record.id)"
              >
                <a-button type="link" size="small" danger class="table-action-btn delete-btn">
                  <DeleteOutlined /> 删除
                </a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </div>

    <!-- 新增/编辑弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      :title="isEdit ? '编辑图书' : '新增图书'"
      :confirm-loading="submitLoading"
      @ok="handleSubmit"
      @cancel="handleModalClose"
      width="640px"
    >
      <a-form
        ref="formRef"
        :model="formState"
        :rules="rules"
        :label-col="{ span: 5 }"
        :wrapper-col="{ span: 18 }"
      >
        <a-form-item label="ISBN" name="isbn">
          <a-input v-model:value="formState.isbn" placeholder="请输入ISBN" />
        </a-form-item>
        <a-form-item label="书名" name="title">
          <a-input v-model:value="formState.title" placeholder="请输入书名" />
        </a-form-item>
        <a-form-item label="作者" name="author">
          <a-input v-model:value="formState.author" placeholder="请输入作者" />
        </a-form-item>
        <a-form-item label="出版社" name="publisher">
          <a-input v-model:value="formState.publisher" placeholder="请输入出版社" />
        </a-form-item>
        <a-form-item label="分类" name="categoryId">
          <a-select v-model:value="formState.categoryId" placeholder="请选择分类">
            <a-select-option
              v-for="cat in categoryStore.categories"
              :key="cat.id"
              :value="cat.id"
            >
              {{ cat.name }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-row>
          <a-col :span="12">
            <a-form-item label="价格" name="price" :label-col="{ span: 10 }" :wrapper-col="{ span: 12 }">
              <a-input-number
                v-model:value="formState.price"
                :min="0"
                :precision="2"
                style="width: 100%"
              />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="库存" name="total" :label-col="{ span: 10 }" :wrapper-col="{ span: 12 }">
              <a-input-number
                v-model:value="formState.total"
                :min="0"
                style="width: 100%"
              />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="存放位置" name="location">
          <a-input v-model:value="formState.location" placeholder="如：A区-01-03" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 批量维护弹窗 -->
    <a-modal
      v-model:open="batchModalVisible"
      title="批量维护图书"
      width="860px"
      :mask-closable="false"
      :confirm-loading="batchSubmitting"
      :ok-text="batchFailure.length > 0 ? `重试失败项（${batchFailure.length}）` : '提交批量更新'"
      cancel-text="关闭"
      @ok="handleBatchSubmit"
      @cancel="handleBatchClose"
    >
      <a-alert
        type="info"
        show-icon
        style="margin-bottom: 16px"
        message="勾选需要统一更新的字段并填写新值，未勾选的字段保持不变；将逐条返回每本图书的处理结果。"
      />

      <!-- 统一更新字段 -->
      <a-form layout="inline" class="batch-fields">
        <a-form-item>
          <a-checkbox v-model:checked="batchForm.updateCategory">统一分类</a-checkbox>
          <a-select
            v-model:value="batchForm.categoryId"
            :disabled="!batchForm.updateCategory"
            placeholder="选择分类"
            style="width: 150px"
          >
            <a-select-option
              v-for="cat in categoryStore.categories"
              :key="cat.id"
              :value="cat.id"
            >
              {{ cat.name }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item>
          <a-checkbox v-model:checked="batchForm.updateStock">统一库存</a-checkbox>
          <a-input-number
            v-model:value="batchForm.total"
            :disabled="!batchForm.updateStock"
            :min="0"
            :precision="0"
            placeholder="总库存"
            style="width: 130px"
          />
        </a-form-item>
        <a-form-item>
          <a-checkbox v-model:checked="batchForm.updateLocation">统一位置</a-checkbox>
          <a-input
            v-model:value="batchForm.location"
            :disabled="!batchForm.updateLocation"
            placeholder="如：A区-01-03"
            style="width: 170px"
          />
        </a-form-item>
      </a-form>

      <!-- 待处理图书列表（失败项保留，成功项移除） -->
      <div class="batch-list-header">
        <span>待处理图书（{{ batchPendingBooks.length }} 本）</span>
        <span class="batch-list-hint">正在借阅的图书库存不能低于在借数量</span>
      </div>
      <a-table
        :columns="batchColumns"
        :data-source="batchPendingBooks"
        :pagination="false"
        row-key="id"
        size="small"
        :scroll="{ y: 240 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'stock'">
            <span>{{ record.available }} / {{ record.total }}</span>
            <a-tag v-if="getBorrowedCount(record.id) > 0" color="orange" style="margin-left: 6px">
              在借 {{ getBorrowedCount(record.id) }}
            </a-tag>
          </template>
        </template>
      </a-table>

      <!-- 逐条处理结果 -->
      <div v-if="batchResults.length > 0" class="batch-result">
        <div class="batch-result-summary">
          <a-tag color="success">成功 {{ batchSuccess.length }}</a-tag>
          <a-tag v-if="batchFailure.length > 0" color="error">失败 {{ batchFailure.length }}</a-tag>
          <span v-if="batchFailure.length > 0" class="batch-retry-hint">
            失败项已保留在待处理列表，调整后可直接重试
          </span>
        </div>
        <div class="batch-result-list">
          <div
            v-for="item in batchResults"
            :key="item.id"
            :class="['batch-result-item', item.success ? 'is-success' : 'is-fail']"
          >
            <span class="batch-result-icon">
              <CheckCircleFilled v-if="item.success" />
              <CloseCircleFilled v-else />
            </span>
            <span class="batch-result-title">{{ item.title || `#${item.id}` }}</span>
            <span class="batch-result-msg">
              {{ item.success ? '更新成功' : item.reason }}
            </span>
          </div>
        </div>
      </div>
    </a-modal>

    <!-- 图书详情抽屉 -->
    <a-drawer
      v-model:open="detailVisible"
      title="图书详情"
      width="420px"
      @close="detailVisible = false"
    >
      <template v-if="detailBook">
        <div class="detail-cover">
          <img :src="detailBook.cover" :alt="detailBook.title" />
        </div>
        <a-descriptions :column="1" bordered size="small" class="detail-desc">
          <a-descriptions-item label="书名">{{ detailBook.title }}</a-descriptions-item>
          <a-descriptions-item label="ISBN">{{ detailBook.isbn }}</a-descriptions-item>
          <a-descriptions-item label="作者">{{ detailBook.author }}</a-descriptions-item>
          <a-descriptions-item label="出版社">{{ detailBook.publisher }}</a-descriptions-item>
          <a-descriptions-item label="分类">{{ detailBook.categoryName }}</a-descriptions-item>
          <a-descriptions-item label="价格">￥{{ detailBook.price }}</a-descriptions-item>
          <a-descriptions-item label="库存">
            总库存 {{ detailBook.total }}，可借 {{ detailBook.available }}
            <a-tag color="orange" style="margin-left: 6px">在借 {{ getBorrowedCount(detailBook.id) }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="存放位置">{{ detailBook.location || '-' }}</a-descriptions-item>
          <a-descriptions-item label="简介">{{ detailBook.description || '-' }}</a-descriptions-item>
        </a-descriptions>
      </template>
    </a-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, nextTick, watch } from 'vue'
import { message } from 'ant-design-vue'
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, EyeOutlined, UnorderedListOutlined, CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons-vue'
import { useBookStore } from '@/stores/book'
import { useCategoryStore } from '@/stores/category'

const bookStore = useBookStore()
const categoryStore = useCategoryStore()

const loading = ref(false)
const searchKeyword = ref('')
const selectedCategory = ref(null)
const modalVisible = ref(false)
const submitLoading = ref(false)
const isEdit = ref(false)
const editingId = ref(null)
const formRef = ref(null)
const isSearching = ref(false)
const tableAnimating = ref(false)
let searchTimeout = null

// ========================================
// 多选 & 批量维护
// ========================================
const selectedRowKeys = ref([])

const batchModalVisible = ref(false)
const batchSubmitting = ref(false)
// 待处理图书 id：失败项保留，成功项移除
const batchPendingIds = ref([])
// 最近一次逐条结果（用于在弹窗中对照查看）
const batchResults = ref([])

const batchForm = reactive({
  updateCategory: false,
  categoryId: null,
  updateStock: false,
  total: null,
  updateLocation: false,
  location: ''
})

const batchColumns = [
  { title: '图书', dataIndex: 'title', key: 'title', ellipsis: true },
  { title: '分类', dataIndex: 'categoryName', key: 'category', width: 110 },
  { title: '可借/总库存', key: 'stock', width: 150 },
  { title: '存放位置', dataIndex: 'location', key: 'location', width: 120 }
]

// 列表刷新/筛选后，待处理项依然与当前图书数据对得上
const batchPendingBooks = computed(() =>
  batchPendingIds.value
    .map(id => bookStore.getBookById(id))
    .filter(Boolean)
)

const batchSuccess = computed(() => batchResults.value.filter(item => item.success))
const batchFailure = computed(() => batchResults.value.filter(item => !item.success))

function getBorrowedCount(bookId) {
  return bookStore.getBorrowedCount(bookId)
}

// 表格多选（选择变化时同步清理已不存在的选中项）
function onSelectionChange(keys) {
  selectedRowKeys.value = keys
}

function clearSelection() {
  selectedRowKeys.value = []
}

function showBatchModal() {
  // 空选择不进入批量维护
  if (selectedRowKeys.value.length === 0) {
    message.warning('请先勾选需要批量维护的图书')
    return
  }
  // 过滤掉已被删除的图书，保留有效待处理项
  batchPendingIds.value = [...new Set(selectedRowKeys.value)]
    .filter(id => bookStore.getBookById(id))
  batchResults.value = []
  Object.assign(batchForm, {
    updateCategory: false,
    categoryId: null,
    updateStock: false,
    total: null,
    updateLocation: false,
    location: ''
  })
  batchModalVisible.value = true
}

async function handleBatchSubmit() {
  // 重复提交防护
  if (batchSubmitting.value) return

  // 待处理项为空时不执行
  if (batchPendingBooks.value.length === 0) {
    message.warning('待处理列表为空，没有可更新的图书')
    return
  }

  // 至少勾选一个要更新的字段
  if (!batchForm.updateCategory && !batchForm.updateStock && !batchForm.updateLocation) {
    message.warning('请至少勾选一个需要统一更新的字段（分类 / 库存 / 存放位置）')
    return
  }
  if (batchForm.updateCategory && !batchForm.categoryId) {
    message.warning('请选择需要统一设置的分类')
    return
  }
  if (batchForm.updateStock && (batchForm.total === null || batchForm.total === undefined)) {
    message.warning('请填写需要统一设置的库存数量')
    return
  }
  if (batchForm.updateLocation && !String(batchForm.location).trim()) {
    message.warning('请填写需要统一设置的存放位置')
    return
  }

  batchSubmitting.value = true
  await new Promise(resolve => setTimeout(resolve, 400))

  const updates = {}
  if (batchForm.updateCategory) updates.categoryId = batchForm.categoryId
  if (batchForm.updateStock) updates.total = batchForm.total
  if (batchForm.updateLocation) updates.location = batchForm.location

  // 逐条校验、逐条更新，返回成功与失败原因
  const { success, failure, results } = bookStore.batchUpdateBooks(
    batchPendingIds.value,
    updates
  )
  batchResults.value = results

  // 成功项移出待处理列表，失败项保留以便调整后重试
  batchPendingIds.value = failure.map(item => item.id)

  if (failure.length === 0) {
    message.success(`批量更新完成，共成功 ${success.length} 本`)
  } else if (success.length > 0) {
    message.warning(`成功 ${success.length} 本，失败 ${failure.length} 本，失败项已保留`)
  } else {
    message.error(`全部 ${failure.length} 本均处理失败，请根据失败原因调整后重试`)
  }

  batchSubmitting.value = false
}

function handleBatchClose() {
  // 仍有保留的待处理项时，同步勾选状态，方便重新打开继续处理
  if (batchPendingIds.value.length > 0) {
    selectedRowKeys.value = [...new Set([...selectedRowKeys.value])]
      .filter(id => batchPendingIds.value.includes(id) && bookStore.getBookById(id))
  }
  batchModalVisible.value = false
}

// ========================================
// 图书详情抽屉（列表刷新、批量更新后返回查看结果一致）
// ========================================
const detailVisible = ref(false)
const detailId = ref(null)
const detailBook = computed(() =>
  detailId.value === null ? null : bookStore.getBookById(detailId.value)
)

function showDetailDrawer(record) {
  detailId.value = record.id
  detailVisible.value = true
}

const columns = [
  { title: '图书信息', key: 'book', width: 280 },
  { title: '作者', dataIndex: 'author', key: 'author', width: 120 },
  { title: '分类', key: 'category', width: 100 },
  { title: '出版社', dataIndex: 'publisher', key: 'publisher', ellipsis: true },
  { title: '价格', dataIndex: 'price', key: 'price', width: 80 },
  { title: '库存', key: 'stock', width: 80 },
  { title: '位置', dataIndex: 'location', key: 'location', width: 100 },
  { title: '操作', key: 'action', width: 210, fixed: 'right' }
]

const formState = reactive({
  isbn: '',
  title: '',
  author: '',
  publisher: '',
  categoryId: null,
  price: 0,
  total: 1,
  location: ''
})

const rules = {
  isbn: [{ required: true, message: '请输入ISBN' }],
  title: [{ required: true, message: '请输入书名' }],
  author: [{ required: true, message: '请输入作者' }],
  categoryId: [{ required: true, message: '请选择分类' }]
}

const filteredBooks = computed(() => {
  let result = bookStore.books

  if (searchKeyword.value) {
    const keyword = searchKeyword.value.toLowerCase()
    result = result.filter(book =>
      book.title.toLowerCase().includes(keyword) ||
      book.author.toLowerCase().includes(keyword) ||
      book.isbn.includes(keyword)
    )
  }

  if (selectedCategory.value) {
    result = result.filter(book => book.categoryId === selectedCategory.value)
  }

  return result
})

function handleSearch() {
  triggerSearchAnimation()
}

function handleCategoryChange() {
  triggerSearchAnimation()
}

// 搜索输入时的动画效果
function onSearchInput() {
  isSearching.value = true
  
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }
  
  searchTimeout = setTimeout(() => {
    isSearching.value = false
    triggerSearchAnimation()
  }, 300)
}

// 触发表格搜索动画和loading
function triggerSearchAnimation() {
  loading.value = true
  tableAnimating.value = true
  setTimeout(() => {
    tableAnimating.value = false
    loading.value = false
  }, 600)
}

// 清除筛选
function clearFilters() {
  searchKeyword.value = ''
  selectedCategory.value = null
  triggerSearchAnimation()
}

// 获取行样式类名
function getRowClassName(record, index) {
  return `table-row-animate row-${index}`
}

// 表格变化处理
function handleTableChange() {
  triggerSearchAnimation()
}

function resetForm() {
  Object.assign(formState, {
    isbn: '',
    title: '',
    author: '',
    publisher: '',
    categoryId: null,
    price: 0,
    total: 1,
    location: ''
  })
}

function handleModalClose() {
  nextTick(() => {
    formRef.value?.resetFields()
  })
}

function showAddModal() {
  isEdit.value = false
  editingId.value = null
  resetForm()
  modalVisible.value = true
  nextTick(() => {
    formRef.value?.clearValidate()
  })
}

function showEditModal(record) {
  isEdit.value = true
  editingId.value = record.id
  Object.assign(formState, {
    isbn: record.isbn,
    title: record.title,
    author: record.author,
    publisher: record.publisher,
    categoryId: record.categoryId,
    price: record.price,
    total: record.total,
    location: record.location
  })
  modalVisible.value = true
  nextTick(() => {
    formRef.value?.clearValidate()
  })
}

// 导入本地封面图片
import hlmCover from '@/views/img/hlm.webp'
import jsCover from '@/views/img/js.webp'
import sgyyCover from '@/views/img/sgyy.webp'
import vueCover from '@/views/img/vue.jpeg'
import sjCover from '@/views/img/sj.webp'
import jjxCover from '@/views/img/jjx.webp'
import xlxCover from '@/views/img/xlx.webp'
import sxCover from '@/views/img/sx.webp'

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

async function handleSubmit() {
  try {
    await formRef.value.validate()
    submitLoading.value = true

    const category = categoryStore.getCategoryById(formState.categoryId)

    // 使用真实书籍封面图片
    const randomCover = DEFAULT_COVERS[Math.floor(Math.random() * DEFAULT_COVERS.length)]

    const bookData = {
      ...formState,
      categoryName: category?.name || '',
      available: isEdit.value ? undefined : formState.total,
      cover: isEdit.value ? (bookStore.getBookById(editingId.value)?.cover || randomCover) : randomCover
    }

    // 编辑时不覆盖 available
    if (isEdit.value) {
      delete bookData.available
    }

    await new Promise(resolve => setTimeout(resolve, 500))

    if (isEdit.value) {
      bookStore.updateBook(editingId.value, bookData)
      message.success('图书更新成功')
    } else {
      bookStore.addBook(bookData)
      message.success('图书添加成功')
    }

    modalVisible.value = false
  } catch (error) {
    console.error('表单验证失败:', error)
  } finally {
    submitLoading.value = false
  }
}

function handleDelete(id) {
  bookStore.deleteBook(id)
  // 同步清理多选与批量待处理项，保证列表与结果对得上
  selectedRowKeys.value = selectedRowKeys.value.filter(key => key !== id)
  batchPendingIds.value = batchPendingIds.value.filter(key => key !== id)
  batchResults.value = batchResults.value.filter(item => item.id !== id)
  message.success('图书删除成功')
}
</script>

<style lang="less" scoped>
// ========================================
// 动画定义
// ========================================
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.2); }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@keyframes rowFadeIn {
  from {
    opacity: 0;
    transform: translateX(-20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes stockBarGrow {
  from { width: 0; }
}

@keyframes bounce {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

// ========================================
// 动画类
// ========================================
.animate-fade-in {
  animation: fadeIn 0.5s ease-out both;
}

.animate-slide-down {
  animation: slideDown 0.5s ease-out both;
}

.animate-slide-up {
  animation: slideUp 0.5s ease-out both;
}

// ========================================
// 过渡动画
// ========================================
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

// ========================================
// 主样式
// ========================================
.book-list {
  .page-title {
    font-size: 20px;
    font-weight: 600;
    color: #1a1a1a;
    margin-bottom: 24px;
    position: relative;
    display: inline-block;
    
    &::after {
      content: '';
      position: absolute;
      bottom: -4px;
      left: 0;
      width: 0;
      height: 3px;
      background: linear-gradient(90deg, #1890ff, #40a9ff);
      border-radius: 2px;
      animation: expandWidth 0.8s ease-out 0.3s forwards;
    }
  }
}

@keyframes expandWidth {
  to { width: 100%; }
}

.search-area {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  padding: 20px;
  margin-bottom: 16px;
  transition: all 0.3s ease;
  
  &:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  }
  
  .search-input-wrapper {
    position: relative;
    
    .search-input {
      transition: all 0.3s ease;
      
      &:focus-within {
        box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.2);
      }
    }
    
    .search-icon {
      color: rgba(0, 0, 0, 0.45);
      cursor: pointer;
      transition: all 0.3s ease;
      
      &:hover {
        color: #1890ff;
        transform: scale(1.1);
      }
      
      &.searching {
        animation: pulse 0.5s ease-in-out infinite;
        color: #1890ff;
      }
    }
  }
  
  .category-select {
    transition: all 0.3s ease;
  }

  .batch-btn {
    transition: all 0.3s ease;

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(24, 144, 255, 0.25);
    }
  }

  .batch-tip {
    margin-top: 16px;
    padding: 10px 16px;
    background: #e6f7ff;
    border: 1px solid #91d5ff;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;

    .selected-count {
      font-size: 13px;
      color: #096dd9;

      strong {
        color: #1890ff;
        font-size: 16px;
        margin: 0 4px;
      }
    }

    .clear-btn:hover {
      color: #ff4d4f;
    }
  }

  .add-btn {
    transition: all 0.3s ease;
    
    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(24, 144, 255, 0.4);
    }
    
    &:active {
      transform: translateY(0);
    }
  }
  
  .search-result-tip {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px dashed #f0f0f0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    
    .result-count {
      color: #666;
      font-size: 13px;
      
      strong {
        color: #1890ff;
        font-size: 16px;
        margin: 0 4px;
      }
    }
    
    .clear-btn {
      font-size: 13px;
      
      &:hover {
        color: #ff4d4f;
      }
    }
  }
}

.table-container {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  padding: 20px;
  position: relative;
  transition: all 0.3s ease;
  
  &:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  }
  
  &.table-loading {
    .ant-table {
      filter: blur(2px);
      pointer-events: none;
    }
  }
  
  .table-loading-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(255, 255, 255, 0.95);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    border-radius: 12px;
    
    .loading-spinner {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      
      .spinner-ring {
        width: 40px;
        height: 40px;
        border: 3px solid #f0f0f0;
        border-top-color: #1890ff;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      
      span {
        color: #1890ff;
        font-size: 14px;
      }
    }
  }

  // 表格行样式
  :deep(.ant-table-tbody) {
    .ant-table-row {
      &:hover td {
        background: #fafafa !important;
      }
    }
  }

  // 表格内按钮样式
  .table-action-btn {
    padding: 2px 4px;
    height: auto;
    border-radius: 4px;
    transition: all 0.2s ease;

    &.edit-btn:hover {
      color: #1890ff;
      background: #e6f7ff;
    }

    &.delete-btn:hover {
      color: #ff4d4f;
      background: #fff1f0;
    }
  }
}

.book-cell {
  display: flex;
  align-items: center;

  .book-thumb-wrapper {
    position: relative;
    margin-right: 12px;
    
    .book-thumb {
      width: 48px;
      height: 64px;
      object-fit: cover;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
  }

  .book-detail {
    .book-name {
      font-weight: 500;
      color: #1a1a1a;
      margin-bottom: 4px;
    }

    .book-isbn {
      font-size: 12px;
      color: #999;
    }
  }
}

.category-tag {
  // 保持默认样式
}

.stock-cell {
  .stock-value {
    display: block;
    margin-bottom: 4px;
    
    &.low-stock {
      color: #ff4d4f;
      font-weight: 500;
    }
  }
  
  .stock-bar {
    width: 60px;
    height: 4px;
    background: #f0f0f0;
    border-radius: 2px;
    overflow: hidden;
    
    .stock-bar-fill {
      height: 100%;
      border-radius: 2px;
    }
  }
}

.low-stock {
  color: #ff4d4f;
  font-weight: 500;
}

// ========================================
// 批量维护弹窗
// ========================================
.batch-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
  padding: 16px;
  background: #fafafa;
  border-radius: 8px;

  :deep(.ant-form-item) {
    margin-bottom: 0;
  }

  :deep(.ant-checkbox-wrapper) {
    margin-right: 8px;
  }
}

.batch-list-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  font-weight: 500;
  color: #1a1a1a;
  margin-bottom: 8px;

  .batch-list-hint {
    font-size: 12px;
    font-weight: 400;
    color: #fa8c16;
  }
}

.batch-result {
  margin-top: 16px;
  border-top: 1px dashed #f0f0f0;
  padding-top: 12px;

  .batch-result-summary {
    margin-bottom: 8px;

    .batch-retry-hint {
      margin-left: 8px;
      font-size: 12px;
      color: #ff4d4f;
    }
  }

  .batch-result-list {
    max-height: 200px;
    overflow-y: auto;
  }

  .batch-result-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    font-size: 13px;
    margin-bottom: 4px;

    &.is-success {
      background: #f6ffed;
    }

    &.is-fail {
      background: #fff2f0;
    }

    .batch-result-icon {
      font-size: 15px;
    }

    &.is-success .batch-result-icon {
      color: #52c41a;
    }

    &.is-fail .batch-result-icon {
      color: #ff4d4f;
    }

    .batch-result-title {
      font-weight: 500;
      color: #1a1a1a;
      white-space: nowrap;
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .batch-result-msg {
      color: #666;
    }

    &.is-fail .batch-result-msg {
      color: #ff4d4f;
    }
  }
}

// ========================================
// 详情抽屉
// ========================================
.detail-cover {
  text-align: center;
  margin-bottom: 20px;

  img {
    width: 120px;
    height: 160px;
    object-fit: cover;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
}

.detail-desc {
  :deep(.ant-descriptions-item-label) {
    width: 80px;
  }
}

.table-action-btn.detail-btn:hover {
  color: #722ed1;
  background: #f9f0ff;
}
</style>
