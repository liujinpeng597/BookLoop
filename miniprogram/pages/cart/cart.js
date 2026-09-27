const app = getApp()
const { getNavBarInfo } = require('../../utils/util')

Page({
  data: {
    navTop: 0,
    navHeight: 0,
    isAdmin: false,
    items: [],
    loading: false,
    allChecked: true,
    totalPrice: '0.00',
    selectedCount: 0,
    deliveryType: 'pickup'
  },

  onLoad() {
    this.setData(getNavBarInfo())
  },

  onShow() {
    Promise.resolve(app.loginPromise).then(() => {
      const isAdmin = app.globalData.isAdmin
      this.setData({ isAdmin })
      if (!isAdmin) {
        this.loadCart()
      }
    })
  },

  loadCart() {
    this.setData({ loading: true })
    wx.cloud.callFunction({
      name: 'getCart',
      success: res => {
        const items = (res.result && res.result.data || []).map(item => ({
          ...item,
          checked: true
        }))
        this.setData({ items, loading: false, allChecked: true })
        this.updateSummary()
      },
      fail: err => {
        console.error('加载购物车失败:', err)
        this.setData({ loading: false })
      },
      complete: () => wx.stopPullDownRefresh()
    })
  },

  // 更新底部合计与结算数量
  updateSummary() {
    const selected = this.data.items.filter(i => i.checked)
    const total = selected.reduce((sum, i) => sum + Number(i.price), 0)
    const count = selected.length
    this.setData({ totalPrice: total.toFixed(2), selectedCount: count })
  },

  // 勾选/取消单个
  onCheckItem(e) {
    const index = e.currentTarget.dataset.index
    const key = `items[${index}].checked`
    this.setData({ [key]: !this.data.items[index].checked })
    const allChecked = this.data.items.every(i => i.checked)
    this.setData({ allChecked })
    this.updateSummary()
  },

  // 全选/取消全选
  onCheckAll() {
    const allChecked = !this.data.allChecked
    const items = this.data.items.map(i => ({ ...i, checked: allChecked }))
    this.setData({ items, allChecked })
    this.updateSummary()
  },

  // 删除单个商品
  onDeleteItem(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.items[index]

    wx.showModal({
      title: '移除商品',
      content: `确定从购物车移除《${item.title}》？`,
      success: res => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'removeFromCart',
            data: { cartId: item._id },
            success: () => {
              const items = this.data.items.filter((_, i) => i !== index)
              const allChecked = items.length ? items.every(i => i.checked) : true
              this.setData({ items, allChecked })
              this.updateSummary()
              wx.showToast({ title: '已移除', icon: 'success' })
            },
            fail: () => wx.showToast({ title: '操作失败', icon: 'none' })
          })
        }
      }
    })
  },

  onDeliveryTypeChange(e) {
    this.setData({ deliveryType: e.detail.value })
  },

  // 去结算 → 跳转订单页
  onCheckout() {
    const selected = this.data.items.filter(i => i.checked)
    if (selected.length === 0) {
      return wx.showToast({ title: '请选择要购买的商品', icon: 'none' })
    }

    const ids = selected.map(i => i.bookId).join(',')
    wx.navigateTo({
      url: `/pages/order/order?ids=${ids}&dt=${this.data.deliveryType}&from=cart`
    })
  },

  onBackTap() {
    wx.navigateBack()
  },

  onPullDownRefresh() {
    if (!this.data.isAdmin) {
      this.loadCart()
    } else {
      wx.stopPullDownRefresh()
    }
  }
})
