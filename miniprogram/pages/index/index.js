const app = getApp()
const { condToClass, getNavBarInfo } = require('../../utils/util')

const SORT_OPTIONS = [
  { key: 'newest', label: '最新' },
  { key: 'price_asc', label: '价格 ↑' },
  { key: 'price_desc', label: '价格 ↓' }
]

Page({
  data: {
    navTop: 0,
    navHeight: 0,

    books: [],
    categories: ['全部', '教材', '考研', '文学', '生活', '其他'],
    currentCategory: '全部',
    searchKey: '',
    sortOptions: SORT_OPTIONS,
    sortBy: 'newest',

    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
    announcement: null,

    // 搜索历史（本地存储，最多保留 10 条）
    searchHistory: [],
    showHistory: false
  },

  onLoad() {
    this.setData(getNavBarInfo())
  },

  onShow() {
    this.setData({ page: 1, hasMore: true })
    this.loadBooks(true)
    this.loadAnnouncement()
    // 首页可见时同步一次消息未读角标
    if (typeof app.refreshUnreadBadge === 'function') {
      app.refreshUnreadBadge()
    }
  },

  loadAnnouncement() {
    // SWR：先用缓存立即渲染，网络回来后覆盖（公告变更频率低）
    const cached = wx.getStorageSync('announcement_cache')
    if (cached) this.setData({ announcement: cached })

    wx.cloud.callFunction({
      name: 'publishAnnouncement',
      data: { action: 'get' },
      success: res => {
        if (res.result && res.result.success) {
          const data = res.result.data || null
          this.setData({ announcement: data })
          if (data) wx.setStorageSync('announcement_cache', data)
          else wx.removeStorageSync('announcement_cache')
        }
      },
      fail: () => {}
    })
  },

  // 🌟 核心：加载书籍列表
  loadBooks(override = false) {
    if (this.data.loading || !this.data.hasMore) return

    this.setData({ loading: true })

    const isFirstPage = this.data.page === 1
    const cacheKey = [this.data.currentCategory, this.data.searchKey || '', this.data.sortBy].join('|')

    // SWR：首屏先用缓存渲染，网络回来后覆盖更新
    if (override && isFirstPage) {
      const hit = (wx.getStorageSync('books_cache') || {})[cacheKey]
      if (hit && hit.list && hit.list.length) {
        this.setData({ books: hit.list })
      }
    }

    wx.cloud.callFunction({
      name: 'getBooks',
      data: {
        category: this.data.currentCategory,
        keyword: this.data.searchKey,
        sortBy: this.data.sortBy,
        page: this.data.page,
        pageSize: this.data.pageSize
      },
      success: res => {
        if (res.result && res.result.success) {
          const newBooks = res.result.data || []

          newBooks.forEach(book => {
            // 未知成色用中性灰样式，不冒充任何具体成色
            book.condClass = condToClass(book.condition, 'cond-other')
          })

          this.setData({
            books: override ? newBooks : this.data.books.concat(newBooks),
            hasMore: newBooks.length === this.data.pageSize,
            page: this.data.page + 1,
            loading: false
          })

          // 仅缓存第一页结果（已带成色样式类），供下次首屏秒开；上限 8 个筛选组合
          if (isFirstPage) {
            const cache = wx.getStorageSync('books_cache') || {}
            cache[cacheKey] = { ts: Date.now(), list: newBooks }
            const keys = Object.keys(cache)
            if (keys.length > 8) {
              keys.sort((a, b) => cache[a].ts - cache[b].ts)
                .slice(0, keys.length - 8)
                .forEach(k => delete cache[k])
            }
            wx.setStorageSync('books_cache', cache)
          }
        } else {
          this.setData({ loading: false })
          wx.showToast({ title: '拉取数据失败', icon: 'none' })
        }
      },
      fail: err => {
        console.error('获取首页列表失败', err)
        this.setData({ loading: false })
      },
      complete: () => {
        // 如果是下拉刷新进来的，这里要停掉那个转圈圈的动画
        wx.stopPullDownRefresh()
      }
    })
  },

  // 监听搜索框输入（防抖 300ms，减少无效云函数调用）
  onSearchInput(e) {
    this.setData({ searchKey: e.detail.value.trim() })
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this._searchTimer = setTimeout(() => {
      this.setData({ page: 1, hasMore: true, showHistory: false })
      this.loadBooks(true)
    }, 300)
  },

  // 用户点击搜索按钮，或者键盘右下角的搜索键
  onSearch() {
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this.setData({ page: 1, hasMore: true, showHistory: false })
    this.saveSearchHistory(this.data.searchKey)
    this.loadBooks(true)
  },

  // ---------- 搜索历史 ----------
  saveSearchHistory(key) {
    const word = String(key || '').trim()
    if (!word) return
    let list = wx.getStorageSync('search_history') || []
    list = [word].concat(list.filter(item => item !== word)).slice(0, 10)
    wx.setStorageSync('search_history', list)
    this.setData({ searchHistory: list })
  },

  onSearchFocus() {
    this.setData({
      searchHistory: wx.getStorageSync('search_history') || [],
      showHistory: this.data.searchKey === ''
    })
  },

  // blur 延迟收起，给历史词的点击留出触发窗口
  onSearchBlur() {
    setTimeout(() => {
      if (!this._historyTapping) this.setData({ showHistory: false })
      this._historyTapping = false
    }, 200)
  },

  onHistoryTap(e) {
    this._historyTapping = true
    const word = e.currentTarget.dataset.word
    this.saveSearchHistory(word)
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this.setData({ searchKey: word, showHistory: false, page: 1, hasMore: true })
    this.loadBooks(true)
  },

  onClearHistory() {
    wx.showModal({
      title: '清空搜索历史',
      content: '确定清空全部搜索历史吗？',
      confirmColor: '#ef4444',
      success: res => {
        if (res.confirm) {
          wx.removeStorageSync('search_history')
          this.setData({ searchHistory: [], showHistory: false })
        }
      }
    })
  },

  // 用户点击排序选项
  onSortTap(e) {
    const sortBy = e.currentTarget.dataset.key
    if (this.data.sortBy === sortBy) return
    this.setData({ sortBy, page: 1, hasMore: true })
    this.loadBooks(true)
  },

  // 用户点击分类标签
  onCategoryTap(e) {
    const category = e.currentTarget.dataset.category
    if (this.data.currentCategory === category) return

    this.setData({
      currentCategory: category,
      page: 1,
      hasMore: true
    })
    this.loadBooks(true)
  },

  // 跳转到详情页
  onBookTap(e) {
    const bookId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/detail/detail?id=${bookId}`
    })
  },

  // 原生下拉刷新生命周期
  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true })
    this.loadBooks(true)
  },

  // 原生触底生命周期
  onReachBottom() {
    this.loadBooks()
  },

  onUnload() {
    if (this._searchTimer) {
      clearTimeout(this._searchTimer)
      this._searchTimer = null
    }
  }
})
