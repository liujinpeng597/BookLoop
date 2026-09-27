const app = getApp()
const { condToClass, getNavBarInfo } = require('../../utils/util')
const { DEFAULT_PICKUP_ADDRESS } = require('../../utils/constants')

Page({
  data: {
    book: null,
    loading: true,
    isAdmin: false,
    navTop: 0,
    navHeight: 0,
    deliveryType: 'pickup'
  },

  onLoad(options) {
    this.bookId = options.id

    this.setData(getNavBarInfo())

    // 等待登录鉴权完成再读取 isAdmin，避免竞态
    Promise.resolve(app.loginPromise).then(() => {
      this.setData({ isAdmin: app.globalData.isAdmin })
    })
    this.loadDetail()
  },

  // 获取书籍详细信息
  loadDetail() {
    wx.cloud.callFunction({
      name: 'getBookDetail',
      data: { bookId: this.bookId },
      success: res => {
        const book = res.result.data
        if (book) {
          // 智能计算“省XX元”的标签
          if (book.originalPrice && book.originalPrice > book.price) {
            book.savedAmount = parseFloat((book.originalPrice - book.price).toFixed(2))
          }

          book.condClass = condToClass(book.condition)
          book.pickupAddress = book.pickupAddress || DEFAULT_PICKUP_ADDRESS
        }
        this.setData({ book, loading: false })
      },
      fail: err => {
        console.error('getBookDetail失败', err)
        wx.showToast({ title: '加载失败', icon: 'error' })
        this.setData({ loading: false })
      }
    })
  },

  // 用户切换交易方式（自提/送货）
  onDeliveryTypeChange(e) {
    this.setData({ deliveryType: e.detail.value })
  },

  // 点击“聊一聊”找客服
  onContactTap() {
    if (!this.data.book) return
    Promise.resolve(app.loginPromise).then(() => {
      const chatId = app.globalData.openid
      if (!chatId) {
        wx.showToast({ title: '登录中，请稍后再试', icon: 'none' })
        return
      }
      wx.navigateTo({
        url: `/pages/chat/chat?chatId=${chatId}`,
        fail: () => {
          wx.switchTab({
            url: '/pages/chat-list/chat-list'
          })
        }
      })
    })
  },

  // 🌟 核心：普通用户点击"加购"，只传 bookId，其余字段由服务端回读（防伪造展示数据）
  onAddCart() {
    const book = this.data.book
    if (!book || book.status !== 'on_sale') return

    Promise.resolve(app.loginPromise).then(() => {
      wx.showLoading({ title: '加入中...' })
      wx.cloud.callFunction({
        name: 'addToCart',
        data: { bookId: book._id },
        success: res => {
          wx.hideLoading()
          if (res.result && res.result.success) {
            wx.showToast({ title: '已加入购物车', icon: 'success' })
          } else {
            wx.showToast({ title: (res.result && res.result.msg) || '加入失败', icon: 'none' })
          }
        },
        fail: e => {
          wx.hideLoading()
          const errMsg = e.errMsg || e.message || JSON.stringify(e)
          console.error('addToCart失败:', errMsg)
          wx.showToast({ title: errMsg.substring(0, 20), icon: 'none' })
        }
      })
    })
  },

  onBuyTap() {
    if (!this.data.book || this.data.book.status !== 'on_sale') {
      return wx.showToast({ title: '手慢了，该书已售出', icon: 'none' })
    }
    // 把当前选中的 dt (deliveryType) 传给确认订单页
    wx.navigateTo({
      url: `/pages/order/order?id=${this.data.book._id}&dt=${this.data.deliveryType}`
    })
  },

  // 管理员点击“编辑书籍”
  onEditTap() { 
    wx.navigateTo({ url: `/pages/admin-book-edit/admin-book-edit?id=${this.bookId}` }) 
  },
  
  // 顶部导航返回按钮
  onBackTap() { 
    wx.navigateBack({ delta: 1 }) 
  },

  // 管理员点击“下架书籍”
  onDeleteTap() {
    wx.showModal({
      title: '确认下架',
      content: '下架后，普通用户将无法在首页看到此书',
      confirmColor: '#ef4444',
      success: res => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' })
          wx.cloud.callFunction({
            name: 'deleteBook',
            data: { bookId: this.bookId },
            success: res => {
              wx.hideLoading()
              // 必须校验业务结果：云函数返回 success:false 时（状态已变/无权限）不能提示成功
              if (res.result && res.result.success) {
                wx.showToast({ title: '已成功下架' })
                setTimeout(() => wx.navigateBack(), 1500)
              } else {
                wx.showToast({ title: (res.result && res.result.msg) || '下架失败', icon: 'none' })
              }
            },
            fail: () => {
              wx.hideLoading()
              wx.showToast({ title: '下架失败', icon: 'none' })
            }
          })
        }
      }
    })
  }
})