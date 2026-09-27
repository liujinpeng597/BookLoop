const app = getApp()
const { getNavBarInfo } = require('../../utils/util')
const { DELIVERY_FEE_PER_BOOK } = require('../../utils/constants')

Page({
  data: {
    navTop: 0,
    navHeight: 0,
    book: null,
    books: [],
    isCart: false,
    submitting: false,
    deliveryType: 'pickup',
    totalPrice: 0,
    deliveryFee: 0,
    finalTotal: '0.00',
    form: { name: '', phone: '', address: '' }
  },

  onLoad(options) {
    this.bookId = options.id || ''
    this.bookIds = options.ids ? options.ids.split(',') : []
    this.isCart = !!options.ids

    const dt = options.dt || 'pickup'

    this.setData({
      ...getNavBarInfo(),
      deliveryType: dt,
      isCart: this.isCart
    })

    if (this.isCart) {
      this.loadCartBooks()
    } else {
      this.loadBookDetail()
    }
  },

  computeTotal() {
    const { totalPrice, deliveryType, books, isCart } = this.data
    const bookCount = isCart ? books.length : 1
    const deliveryFee = deliveryType === 'delivery' ? bookCount * DELIVERY_FEE_PER_BOOK : 0
    const finalTotal = (totalPrice + deliveryFee).toFixed(2)
    this.setData({ deliveryFee, finalTotal })
  },

  loadBookDetail() {
    wx.showLoading({ title: '加载中...' })
    wx.cloud.callFunction({
      name: 'getBookDetail',
      // 订单确认页不是展示型访问，不统计浏览量
      data: { bookId: this.bookId, countView: false },
      success: res => {
        wx.hideLoading()
        const book = res.result.data
        this.setData({ book, totalPrice: book ? book.price : 0 })
        this.computeTotal()
      },
      fail: err => {
        wx.hideLoading()
        console.error('获取书籍详情失败', err)
        wx.showToast({ title: '加载书籍失败', icon: 'none' })
      }
    })
  },

  loadCartBooks() {
    wx.showLoading({ title: '加载商品...' })

    // 批量查询：一次请求拉取所有书籍，避免 N+1 次云函数调用
    wx.cloud.callFunction({
      name: 'getBooks',
      data: { bookIds: this.bookIds, pageSize: 50 }
    }).then(res => {
      wx.hideLoading()
      const books = (res.result && res.result.data) || []

      if (books.length === 0) {
        wx.showToast({ title: '商品信息已失效', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }

      // 保留请求顺序
      const bookMap = {}
      books.forEach(b => { bookMap[b._id] = b })
      const ordered = this.bookIds.map(id => bookMap[id]).filter(Boolean)

      const first = ordered[0]
      const totalPrice = ordered.reduce((s, b) => s + Number(b.price), 0)
      this.setData({ book: first, books: ordered, totalPrice })
      this.computeTotal()
    }).catch(() => {
      wx.hideLoading()
      wx.showToast({ title: '加载失败', icon: 'none' })
    })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: e.detail.value.trim() })
  },

  onSubmit() {
    if (this.data.submitting) return

    const { name, phone, address } = this.data.form
    const { isCart, books, deliveryType } = this.data

    if (!name) return wx.showToast({ title: '请输入联系人姓名', icon: 'none' })
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
      return wx.showToast({ title: '请输入正确的11位手机号', icon: 'none' })
    }
    // 送货方式必须填写收货地址
    if (deliveryType === 'delivery' && !address) {
      return wx.showToast({ title: '请填写收货地址', icon: 'none' })
    }
    // 防护：书籍信息未加载完成时禁止提交，避免访问 undefined 报错
    if (!isCart && !this.data.book) {
      return wx.showToast({ title: '书籍信息加载中，请稍候', icon: 'none' })
    }
    if (isCart && books.length === 0) {
      return wx.showToast({ title: '商品信息已失效', icon: 'none' })
    }

    this.setData({ submitting: true })
    wx.showLoading({ title: '正在提交订单...', mask: true })

    const targetBooks = isCart ? books : [this.data.book]

    // 购物车多书 → 合并为一个订单
    if (isCart) {
      const items = targetBooks.map(b => ({
        bookId: b._id,
        title: b.title,
        coverUrl: b.coverUrl || '',
        price: b.price
      }))
      const finalAddr = deliveryType === 'delivery' ? address : ''

      wx.cloud.callFunction({
        name: 'createBatchOrder',
        data: {
          items,
          deliveryType,
          buyerName: name,
          buyerPhone: phone,
          address: finalAddr
        },
        success: res => {
          wx.hideLoading()
          if (res.result && res.result.success) {
            wx.showToast({ title: '下单成功', icon: 'success' })
            this.setData({ form: { name: '', phone: '', address: '' } })
            const orderId = (res.result && res.result.orderId) || ''
            setTimeout(() => {
              wx.redirectTo({ url: `/pages/payment/payment?id=${orderId}` })
            }, 600)
          } else {
            wx.showToast({ title: (res.result && res.result.msg) || '下单失败', icon: 'none' })
            this.setData({ submitting: false })
          }
        },
        fail: () => {
          wx.hideLoading()
          wx.showToast({ title: '下单失败', icon: 'none' })
          this.setData({ submitting: false })
        }
      })
      return
    }

    // 单本书：只传必要字段，价格/书名/封面由服务端回读；
    // 自提订单的取货地址也由服务端从书籍记录写入
    const book = targetBooks[0]
    const finalAddr = deliveryType === 'delivery' ? address : ''
    wx.cloud.callFunction({
      name: 'createOrder',
      data: {
        bookId: book._id,
        deliveryType,
        buyerName: name,
        buyerPhone: phone,
        address: finalAddr
      },
      success: res => {
        wx.hideLoading()
        if (res.result && res.result.success) {
          wx.showToast({ title: '下单成功', icon: 'success' })
          this.setData({ form: { name: '', phone: '', address: '' } })
          const orderId = (res.result && res.result.orderId) || ''
          setTimeout(() => { wx.redirectTo({ url: `/pages/payment/payment?id=${orderId}` }) }, 600)
        } else {
          wx.showToast({ title: '下单失败', icon: 'none' })
          this.setData({ submitting: false })
        }
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '下单失败', icon: 'none' })
        this.setData({ submitting: false })
      }
    })
  },

  onBackTap() {
    wx.navigateBack({ delta: 1 })
  }
})
