const { getNavBarInfo } = require('../../utils/util')

Page({
  data: {
    navTop: 0,
    navHeight: 0,
    loading: false,
    orders: [],
    statusFilter: 'all',
    statusMap: {
      pending: '待交接',
      shipped: '配送中',
      completed: '已完成',
      cancelled: '已取消'
    },
    statusList: [
      { label: '全部', value: 'all' },
      { label: '待交接', value: 'pending' },
      { label: '已发货', value: 'shipped' },
      { label: '已完成', value: 'completed' }
    ]
  },

  onLoad() {
    this.setData(getNavBarInfo())
  },

  onShow() { 
    this.loadAdminOrders() 
  },

  // 获取后台全量订单
  loadAdminOrders() {
    this.setData({ loading: true })
    
    wx.cloud.callFunction({
      name: 'getOrders',
      data: { isAdmin: true },
      success: res => { 
        // 缓存全量数据到 this 上，方便后续前端做状态筛选
        this.allOrders = res.result.data || []
        this.filterOrders() 
        this.setData({ loading: false }) 
      },
      fail: () => {
        wx.showToast({ title: '加载失败', icon: 'none' })
        this.setData({ loading: false })
      },
      complete: () => wx.stopPullDownRefresh()
    })
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
            success: () => { 
              wx.hideLoading()
              wx.showToast({ title: '操作成功', icon: 'success' })
              // 状态更新后重新拉取最新列表
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

  //删除按钮
  onDeleteOrder(e) {
    const orderId = e.currentTarget.dataset.id || e.currentTarget.dataset.orderId;

    if (!orderId) {
      wx.showToast({ title: '前端未获取到订单ID', icon: 'none' });
      return;
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
                wx.showToast({ title: '清理成功' })
                this.loadAdminOrders()
              } else {
                wx.showToast({ title: result.result.msg || '操作失败', icon: 'none' })
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