const { getNavBarInfo, condToClass } = require('../../utils/util')

Page({
  data: {
    navTop: 0,
    navHeight: 0,
    favorites: [],
    page: 1,
    pageSize: 10,
    hasMore: false,
    loading: false,
    loadingMore: false
  },

  onLoad() {
    this.setData(getNavBarInfo())
  },

  onShow() {
    // 每次进入都刷新：详情页里可能刚取消/新增了收藏
    this.setData({ page: 1, hasMore: true })
    this.loadFavorites(true)
  },

  loadFavorites(override = false) {
    if (this.data.loading || (override ? false : !this.data.hasMore)) return

    if (override) this.setData({ loading: true })
    else this.setData({ loadingMore: true })

    wx.cloud.callFunction({
      name: 'favorite',
      data: {
        action: 'list',
        page: this.data.page,
        pageSize: this.data.pageSize
      },
      success: res => {
        if (res.result && res.result.success) {
          const list = res.result.data || []
          list.forEach(book => {
            book.condClass = condToClass(book.condition, 'cond-other')
            // 已售出/已下架的收藏项给出醒目提示
            book.offShelf = book.status !== 'on_sale'
          })
          this.setData({
            favorites: override ? list : this.data.favorites.concat(list),
            hasMore: !!res.result.hasMore,
            page: this.data.page + 1
          })
        } else {
          wx.showToast({ title: (res.result && res.result.msg) || '加载收藏失败', icon: 'none' })
        }
      },
      fail: () => {
        wx.showToast({ title: '网络开小差了', icon: 'none' })
      },
      complete: () => {
        this.setData({ loading: false, loadingMore: false })
        wx.stopPullDownRefresh()
      }
    })
  },

  // 跳转书籍详情
  onBookTap(e) {
    const bookId = e.currentTarget.dataset.id
    if (bookId) {
      wx.navigateTo({ url: `/pages/detail/detail?id=${bookId}` })
    }
  },

  // 取消收藏（从列表中移除）
  onRemoveFav(e) {
    const bookId = e.currentTarget.dataset.id
    const index = e.currentTarget.dataset.index
    if (!bookId) return

    wx.showModal({
      title: '取消收藏',
      content: '确定将这本书移出收藏吗？',
      confirmColor: '#ef4444',
      success: res => {
        if (!res.confirm) return
        wx.cloud.callFunction({
          name: 'favorite',
          data: { action: 'toggle', bookId },
          success: r => {
            if (r.result && r.result.success && !r.result.favorite) {
              this.data.favorites.splice(index, 1)
              this.setData({ favorites: this.data.favorites })
              wx.showToast({ title: '已取消收藏', icon: 'success' })
            } else {
              wx.showToast({ title: (r.result && r.result.msg) || '操作失败', icon: 'none' })
            }
          },
          fail: () => wx.showToast({ title: '网络异常，请稍后再试', icon: 'none' })
        })
      }
    })
  },

  onReachBottom() {
    this.loadFavorites()
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true })
    this.loadFavorites(true)
  },

  onBackTap() {
    wx.navigateBack({ delta: 1 })
  }
})
