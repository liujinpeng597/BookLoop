const app = getApp()
const { getNavBarInfo } = require('../../utils/util')

Page({
  data: {
    navTop: 0,
    navHeight: 0,
    order: null,
    loading: true,
    statusMap: {
      pending: '待交接',
      shipped: '配送中',
      completed: '交易完成',
      cancelled: '已取消'
    },
    payStatusMap: {
      true: '已支付',
      false: '未支付'
    }
  },

  onLoad(options) {
    const orderId = options.id
    this.setData(getNavBarInfo())
    if (orderId) {
      this.loadOrder(orderId)
    } else {
      wx.showToast({ title: '订单不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1000)
    }
  },

  loadOrder(orderId) {
    wx.cloud.callFunction({
      name: 'getOrderDetail',
      data: { orderId },
      success: res => {
        if (res.result && res.result.success) {
          const order = res.result.data
          // 统一计算实付金额（含配送费），供 WXML 展示
          const totalAmount = (order.isBatch
            ? Number(order.totalPrice) + Number(order.deliveryFee || 0)
            : Number(order.price) + Number(order.deliveryFee || 0)).toFixed(2)
          this.setData({ order: { ...order, totalAmount }, loading: false })
        } else {
          wx.showToast({ title: (res.result && res.result.msg) || '加载失败', icon: 'none' })
          setTimeout(() => wx.navigateBack(), 1000)
        }
      },
      fail: () => {
        wx.showToast({ title: '加载失败', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1000)
      }
    })
  },

  onPayTap() {
    const { order } = this.data
    if (order && order._id) {
      wx.navigateTo({ url: `/pages/payment/payment?id=${order._id}` })
    }
  },

  onBackTap() {
    wx.navigateBack()
  }
})
