const app = getApp()
const { condToClass, getNavBarInfo } = require('../../utils/util')

Page({
  data: {
    navTop: 0,
    navHeight: 0,

    books: [],
    categories: ['全部', '教材', '考研', '文学', '生活', '其他'],
    currentCategory: '全部',
    searchKey: '',

    page: 1,
    pageSize: 10,
    hasMore: true,
    loading: false,
    announcement: null
  },

  onLoad() {
    this.setData(getNavBarInfo())
  },

  onShow() {
    this.setData({ page: 1, hasMore: true })
    this.loadBooks(true)
    this.loadAnnouncement()
  },

  loadAnnouncement() {
    wx.cloud.callFunction({
      name: 'publishAnnouncement',
      data: { action: 'get' },
      success: res => {
        if (res.result && res.result.success) {
          this.setData({ announcement: res.result.data || null })
        }
      },
      fail: () => {}
    })
  },

  // 🌟 核心：加载书籍列表
  loadBooks(override = false) {
    if (this.data.loading || !this.data.hasMore) return
    
    this.setData({ loading: true })

    wx.cloud.callFunction({
      name: 'getBooks',
      data: {
        category: this.data.currentCategory,
        keyword: this.data.searchKey,
        page: this.data.page,
        pageSize: this.data.pageSize
      },
      success: res => {
        if (res.result && res.result.success) {
          const newBooks = res.result.data || []
          
          newBooks.forEach(book => {
            book.condClass = condToClass(book.condition, 'cond-bachenxin')
          })

          this.setData({
            books: override ? newBooks : this.data.books.concat(newBooks),
            hasMore: newBooks.length === this.data.pageSize,
            page: this.data.page + 1,
            loading: false
          })
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
      this.setData({ page: 1, hasMore: true })
      this.loadBooks(true)
    }, 300)
  },

  // 用户点击搜索按钮，或者键盘右下角的搜索键
  onSearch() {
    if (this._searchTimer) clearTimeout(this._searchTimer)
    this.setData({ page: 1, hasMore: true })
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