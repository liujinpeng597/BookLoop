const app = getApp()
const { getNavBarInfo } = require('../../utils/util')
const { STATUS_MAP } = require('../../utils/constants')

Page({
  data: {
    navTop: 0,
    navHeight: 0,
    order: null,
    loading: true,
    // 买家可自助取消：待交接且未支付
    canCancel: false,
    statusMap: STATUS_MAP
  },

  onLoad(options) {
    const orderId = options.id
    this.setData(getNavBarInfo())
    if (orderId) {
      this.orderId = orderId
      // 等登录完成拿到 openid，再判断当前用户是否为订单买家（取消按钮权限）
      // 登录失败也允许查看（服务端仍会做权限校验，取消按钮不可用）
      Promise.resolve(app.loginPromise).then(() => {
        this.loadOrder(orderId)
      }).catch(() => {
        this.loadOrder(orderId)
      })
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
          // 支付状态文案：paid 是买家自报，adminConfirmedPaid 才是卖家确认收款
          let payStatusText = '未支付'
          if (order.paid) {
            payStatusText = order.adminConfirmedPaid ? '已支付' : '已转账 · 待卖家核实'
          }
          const canCancel = order.status === 'pending' && !order.paid
            && order.buyerOpenId === app.globalData.openid

          this.setData({
            order: { ...order, totalAmount, payStatusText },
            canCancel,
            loading: false
          })
        } else {
          this.setData({ loading: false })
          wx.showToast({ title: (res.result && res.result.msg) || '加载失败', icon: 'none' })
          setTimeout(() => wx.navigateBack(), 1000)
        }
      },
      fail: () => {
        this.setData({ loading: false })
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

  // 买家自助取消订单（仅待交接且未支付）：服务端会释放库存并发系统通知
  onCancelOrder() {
    const { order, canCancel } = this.data
    if (!canCancel || !order || !order._id) return

    wx.showModal({
      title: '取消订单',
      content: '确定取消该订单吗？取消后所选书籍将重新上架，其他同学可购买。',
      confirmColor: '#ef4444',
      success: res => {
        if (!res.confirm) return
        wx.showLoading({ title: '取消中...', mask: true })
        wx.cloud.callFunction({
          name: 'updateOrderStatus',
          data: { orderId: order._id, status: 'cancelled' },
          success: r => {
            wx.hideLoading()
            if (r.result && r.result.success) {
              wx.showToast({ title: '订单已取消', icon: 'success' })
            } else {
              wx.showToast({ title: (r.result && r.result.msg) || '取消失败', icon: 'none' })
            }
            // 无论成败都刷新（状态可能已被管理员变更）
            this.loadOrder(this.orderId)
          },
          fail: () => {
            wx.hideLoading()
            wx.showToast({ title: '网络异常，请稍后再试', icon: 'none' })
          }
        })
      }
    })
  },

  onBackTap() {
    wx.navigateBack()
  }
})
