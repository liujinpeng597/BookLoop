const { getNavBarInfo } = require('../../utils/util')

Page({
  data: {
    navTop: 0,
    navHeight: 0,
    loading: false,
    loadingMore: false,
    books: [],
    page: 1,
    hasMore: false,
    statusFilter: 'on_sale',
    tabs: [
      { label: '在售中', value: 'on_sale' },
      { label: '已下架', value: 'removed' },
      { label: '已售出', value: 'sold' }
    ]
  },

  onLoad() {
    this.setData(getNavBarInfo())
  },

  onShow() {
    this.loadAdminBooks()
  },

  // 书籍列表：服务端分页（每页 100 条以内），append=true 时加载下一页
  loadAdminBooks(append = false) {
    const page = append ? this.data.page + 1 : 1
    if (append) this.setData({ loadingMore: true })
    else this.setData({ loading: true })

    wx.cloud.callFunction({
      name: 'getBooks',
      data: {
        statusFilter: this.data.statusFilter,
        page,
        pageSize: 100
      },
      success: res => {
        if (res.result && res.result.success) {
          const books = res.result.data || []
          this.setData({
            books: append ? this.data.books.concat(books) : books,
            page,
            hasMore: !!res.result.hasMore,
            loading: false,
            loadingMore: false
          })
        } else {
          this.setData({ loading: false, loadingMore: false })
          wx.showToast({ title: (res.result && res.result.msg) || '加载失败', icon: 'none' })
        }
      },
      fail: () => {
        this.setData({ loading: false, loadingMore: false })
        wx.showToast({ title: '加载失败', icon: 'none' })
      },
      complete: () => wx.stopPullDownRefresh()
    })
  },

  // 触底加载更多
  onReachBottom() {
    if (this.data.loading || this.data.loadingMore) return
    if (this.data.hasMore) {
      this.loadAdminBooks(true)
    }
  },

  onTabChange(e) {
    const value = e.currentTarget.dataset.value
    if (this.data.statusFilter === value) return

    this.setData({ statusFilter: value })
    this.loadAdminBooks()
  },

  onEdit(e) {
    wx.navigateTo({ url: `/pages/admin-book-edit/admin-book-edit?id=${e.currentTarget.dataset.id}` })
  },

  onChangeStatus(e) {
    const { id, status, label } = e.currentTarget.dataset
    wx.showModal({
      title: '操作确认',
      content: `确定要将该书籍标记为【${label}】吗？`,
      success: res => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' })
          wx.cloud.callFunction({
            name: 'editBook',
            data: { bookId: id, status: status },
            success: r => {
              wx.hideLoading()
              // 必须校验业务结果：书籍状态已改变时 r.result.success 为 false
              if (r.result && r.result.success) {
                wx.showToast({ title: '操作成功', icon: 'success' })
              } else {
                wx.showToast({ title: (r.result && r.result.msg) || '操作失败', icon: 'none' })
              }
              this.loadAdminBooks() // 重新刷新列表
            },
            fail: () => {
              wx.hideLoading()
              wx.showToast({ title: '操作失败', icon: 'none' })
            }
          })
        }
      }
    })
  },

  onDelete(e) {
    const bookId = e.currentTarget.dataset.id
    wx.showModal({
      title: '危险操作',
      content: '确定要彻底删除该书籍吗？此操作不可恢复。',
      confirmColor: '#ef4444',
      success: res => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' })
          wx.cloud.callFunction({
            name: 'deleteBook',
            data: { bookId, permanent: true },
            success: r => {
              wx.hideLoading()
              if (r.result && r.result.success) {
                wx.showToast({ title: '已删除', icon: 'success' })
              } else {
                wx.showToast({ title: (r.result && r.result.msg) || '删除失败', icon: 'none' })
              }
              this.loadAdminBooks()
            },
            fail: () => {
              wx.hideLoading()
              wx.showToast({ title: '删除失败', icon: 'none' })
            }
          })
        }
      }
    })
  },

  onBackTap() {
    wx.navigateBack()
  },

  onPullDownRefresh() {
    this.loadAdminBooks()
  }
})
