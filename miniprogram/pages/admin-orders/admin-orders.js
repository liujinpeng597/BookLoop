const { getNavBarInfo } = require('../../utils/util')
const { STATUS_MAP } = require('../../utils/constants')

// 支付状态三态展示：买家自报(paid) ≠ 卖家确认(adminConfirmedPaid)
function withPayState(order) {
  if (!order.paid) return { ...order, payText: '待付', payClass: 'unpaid' }
  if (order.adminConfirmedPaid) return { ...order, payText: '已收款', payClass: 'paid' }
  return { ...order, payText: '自报已付·待核实', payClass: 'claim' }
}

Page({
  data: {
    navTop: 0,
    navHeight: 0,
    loading: false,
    loadingMore: false,
    orders: [],
    statusFilter: 'all',
    page: 1,
    hasMore: false,
    statusMap: STATUS_MAP,
    statusList: [
      { label: '全部', value: 'all' },
      { label: '待交接', value: 'pending' },
      { label: '已发货', value: 'shipped' },
      { label: '已完成', value: 'completed' }
    ]
  },

  onLoad() {
    this.setData(getNavBarInfo())
    // 全量数据缓存（按页累积），供前端状态筛选
    this.allOrders = []
  },

  onShow() {
    this.loadAdminOrders()
  },

  // 后台订单：服务端分页（每页 20 条），append=true 时加载下一页
  loadAdminOrders(append = false) {
    const page = append ? this.data.page + 1 : 1
    if (append) this.setData({ loadingMore: true })
    else this.setData({ loading: true })

    // 注：管理员身份由服务端根据 OPENID 判定，无需（也不应）传 isAdmin
    wx.cloud.callFunction({
      name: 'getOrders',
      data: { page, pageSize: 20 },
      success: res => {
        if (res.result && res.result.success) {
          const orders = (res.result.data || []).map(withPayState)
          this.allOrders = append ? this.allOrders.concat(orders) : orders
          this.setData({
            page,
            hasMore: !!res.result.hasMore,
            loading: false,
            loadingMore: false
          })
          this.filterOrders()
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
      this.loadAdminOrders(true)
    }
  },

  // 用户点击筛选 Tab
  onFilterChange(e) {
    this.setData({ statusFilter: e.currentTarget.dataset.value })
    this.filterOrders()
  },

  // 执行前端数据筛选
  filterOrders() {
    const filter = this.data.statusFilter
    const filteredOrders = filter === 'all' ? this.allOrders : this.allOrders.filter(o => o.status === filter)
    this.setData({ orders: filteredOrders })
  },

  // 更新订单状态（发货/完成/取消）
  onUpdateStatus(e) {
    const { orderId, newStatus, label } = e.currentTarget.dataset

    wx.showModal({
      title: '状态更新',
      content: `确认将该订单标记为【${label}】？`,
      success: res => {
        if (res.confirm) {
          wx.showLoading({ title: '更新中...' })
          wx.cloud.callFunction({
            name: 'updateOrderStatus',
            data: { orderId, status: newStatus },
            success: r => {
              wx.hideLoading()
              // 必须校验业务结果：状态机拒绝（如"已完成→已取消"）时 r.result.success 为 false
              if (r.result && r.result.success) {
                wx.showToast({ title: '操作成功', icon: 'success' })
              } else {
                wx.showToast({ title: (r.result && r.result.msg) || '操作失败', icon: 'none' })
              }
              // 无论成败都刷新（订单状态可能已被并发修改）
              this.loadAdminOrders()
            },
            fail: () => {
              wx.hideLoading()
              wx.showToast({ title: '更新失败', icon: 'none' })
            }
          })
        }
      }
    })
  },

  onOrderTap(e) {
    const orderId = e.currentTarget.dataset.id
    if (orderId) {
      wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${orderId}` })
    }
  },

  // 返回上一页
  onBackTap() {
    wx.navigateBack()
  },

  // 删除按钮（后台逻辑清理）
  onDeleteOrder(e) {
    const orderId = e.currentTarget.dataset.id || e.currentTarget.dataset.orderId

    if (!orderId) {
      wx.showToast({ title: '前端未获取到订单ID', icon: 'none' })
      return
    }

    wx.showModal({
      title: '管理提示',
      content: '确定要在后台清理此条订单吗？',
      success: res => {
        if (res.confirm) {
          wx.showLoading({ title: '正在清理...' })
          wx.cloud.callFunction({
            name: 'deleteOrder',
            data: {
              orderId: orderId,
              deleteRole: 'admin'
            },
            success: result => {
              wx.hideLoading()
              if (result.result && result.result.success) {
                wx.showToast({ title: '清理成功', icon: 'success' })
                this.loadAdminOrders()
              } else {
                wx.showToast({ title: (result.result && result.result.msg) || '操作失败', icon: 'none' })
              }
            },
            fail: () => {
              wx.hideLoading()
              wx.showToast({ title: '系统繁忙', icon: 'none' })
            }
          })
        }
      }
    })
  },

  onPullDownRefresh() {
    this.loadAdminOrders()
  }
})
