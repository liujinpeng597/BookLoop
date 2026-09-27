const app = getApp()
const { getNavBarInfo } = require('../../utils/util')

Page({
  data: {
    navTop: 0,
    navHeight: 0,
    orderId: '',
    order: null,
    loading: true,
    paying: false,
    payDone: false,
    totalAmount: '0.00',
    qrcodeUrl: '',
    qrcodeLoading: true
  },

  onLoad(options) {
    const orderId = options.id || ''
    if (!orderId) {
      wx.showToast({ title: '订单不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1000)
      return
    }

    this.setData({ orderId, ...getNavBarInfo() })

    this.loadOrder()
    this.loadQrcode()
  },

  // 云函数已自动将 cloud:// 转为 HTTPS 链接，直接使用即可
  loadQrcode() {
    wx.cloud.callFunction({
      name: 'getSettings',
      data: { key: 'paymentQrcode' },
      success: res => {
        if (res.result && res.result.success && res.result.data) {
          this.setData({
            qrcodeUrl: res.result.data.value,
            qrcodeLoading: false
          })
        } else {
          console.warn('收款码未配置')
          this.setData({ qrcodeLoading: false })
        }
      },
      fail: err => {
        console.error('获取收款码配置失败:', err)
        this.setData({ qrcodeLoading: false })
      }
    })
  },

  loadOrder() {
    wx.showLoading({ title: '加载中...' })
    wx.cloud.callFunction({
      name: 'getOrderDetail',
      data: { orderId: this.data.orderId },
      success: res => {
        wx.hideLoading()
        if (res.result && res.result.success) {
          const order = res.result.data
          const total = order.isBatch
            ? (order.totalPrice + (order.deliveryFee || 0)).toFixed(2)
            : (Number(order.price) + (order.deliveryFee || 0)).toFixed(2)

          this.setData({ order, totalAmount: total, loading: false })

          if (order.paid) {
            wx.showToast({ title: '该订单已支付', icon: 'none' })
          }
        } else {
          wx.showToast({ title: '订单加载失败', icon: 'none' })
          setTimeout(() => wx.navigateBack(), 1000)
        }
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '网络异常', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1000)
      }
    })
  },

  onPay() {
    const { paying, payDone, order } = this.data
    if (paying || payDone) return

    if (order && order.paid) {
      wx.showToast({ title: '该订单已支付', icon: 'none' })
      return
    }

    this.setData({ paying: true })

    wx.cloud.callFunction({
      name: 'payOrder',
      data: { orderId: this.data.orderId },
      success: res => {
        if (res.result && res.result.success) {
          this.setData({ paying: false, payDone: true })
        } else {
          this.setData({ paying: false })
          wx.showToast({ title: (res.result && res.result.msg) || '支付失败', icon: 'none' })
        }
      },
      fail: () => {
        this.setData({ paying: false })
        wx.showToast({ title: '支付失败，请稍后重试', icon: 'none' })
      }
    })
  },

  onViewOrder() {
    wx.redirectTo({ url: `/pages/order-detail/order-detail?id=${this.data.orderId}` })
  },

  onBackTap() {
    if (this.data.payDone) {
      wx.redirectTo({ url: `/pages/order-detail/order-detail?id=${this.data.orderId}` })
    } else {
      wx.navigateBack()
    }
  }
})
