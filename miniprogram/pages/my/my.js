const app = getApp()
const { getNavBarInfo } = require('../../utils/util')

Page({
  data: {
    navTop: 0,
    navHeight: 0,
    isAdmin: false,
    avatarUrl: '',
    nickName: '',
    loading: false,
    orders: [],
    statusMap: {
      pending: '待交接',
      shipped: '配送中',
      completed: '交易完成',
      cancelled: '已取消'
    }
  },

  onLoad() {
    this.setData(getNavBarInfo())
  },

  onShow() {
    Promise.resolve(app.loginPromise).then(() => {
      const isAdmin = app.globalData.isAdmin
      this.setData({
        isAdmin,
        avatarUrl: app.globalData.avatarUrl,
        nickName: app.globalData.nickName
      })
      if (!isAdmin) {
        this.loadMyOrders()
      }
    })
  },

  // 用户选择微信头像
  onChooseAvatar(e) {
    const tempPath = e.detail.avatarUrl
    if (!tempPath) {
      wx.showToast({ title: '未获取到头像，请重试', icon: 'none' })
      return
    }

    wx.showLoading({ title: '同步中...' })

    // 安全提取扩展名：先去掉查询参数，避免 cloudPath 混入 ? = 等非法字符
    const cleanPath = String(tempPath).split('?')[0]
    const extMatch = cleanPath.match(/\.([a-zA-Z0-9]{2,5})$/)
    const ext = extMatch ? extMatch[1] : 'jpg'
    const openid = app.globalData.openid || 'unknown'
    const cloudPath = `user-avatars/${openid}_${Date.now()}.${ext}`

    wx.cloud.uploadFile({
      cloudPath,
      filePath: tempPath,
      success: res => {
        const fileID = res.fileID || res.fileId
        this.saveProfile({ avatarUrl: fileID })
        wx.hideLoading()
        wx.showToast({ title: '头像更新成功', icon: 'success' })
      },
      fail: err => {
        wx.hideLoading()
        // 打印真实错误，便于定位上传失败的具体原因
        console.error('头像上传失败:', err)
        const msg = (err && (err.errMsg || err.message)) || ''
        wx.showModal({
          title: '头像上传失败',
          content: msg ? `原因：${msg}` : '请检查云开发是否开通云存储',
          showCancel: false
        })
      }
    })
  },

  // 用户输入微信昵称
  onNicknameInput(e) {
    this.setData({ nickName: e.detail.value })
  },

  // 昵称输入框失焦时保存
  onNicknameSave(e) {
    const nickName = (e.detail.value || '').trim()
    if (nickName) {
      this.saveProfile({ nickName })
    }
  },

  // 保存头像/昵称到本地缓存和全局数据
  saveProfile(data) {
    const profile = wx.getStorageSync('user_profile') || {}
    if (data.avatarUrl !== undefined) profile.avatarUrl = data.avatarUrl
    if (data.nickName !== undefined) profile.nickName = data.nickName
    wx.setStorageSync('user_profile', profile)

    app.globalData.avatarUrl = profile.avatarUrl || ''
    app.globalData.nickName = profile.nickName || ''
    this.setData({ avatarUrl: app.globalData.avatarUrl, nickName: app.globalData.nickName })

    // 异步同步到服务端，让管理员能看到真实昵称
    wx.cloud.callFunction({
      name: 'saveUserProfile',
      data: {
        nickName: data.nickName,
        avatarUrl: data.avatarUrl
      }
    }).catch(() => {})
  },

  loadMyOrders() {
    this.setData({ loading: true })
    
    wx.cloud.callFunction({
      name: 'getOrders',
      data: { isAdmin: false }, 
      success: res => {
        if (res.result && res.result.success) {
          this.setData({ orders: res.result.data || [] })
        } else {
          wx.showToast({ title: '加载订单失败', icon: 'none' })
        }
        this.setData({ loading: false })
      },
      fail: err => {
        console.error('获取我的订单失败', err)
        wx.showToast({ title: '网络开小差了', icon: 'none' })
        this.setData({ loading: false })
      },
      complete: () => {
        wx.stopPullDownRefresh()
      }
    })
  },

  // 🌟 新增：用户端彻底删除已完成订单记录
  onOrderTap(e) {
    const orderId = e.currentTarget.dataset.id
    if (orderId) {
      wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${orderId}` })
    }
  },

  onDeleteOrder(e) {
    const orderId = e.currentTarget.dataset.id || e.currentTarget.dataset.orderId;

    if (!orderId) {
      wx.showToast({ title: '前端未获取到订单ID', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '提示',
      content: '确定要删除这条订单记录吗？',
      success: res => {
        if (res.confirm) {
          wx.showLoading({ title: '正在删除...' })
          wx.cloud.callFunction({
            name: 'deleteOrder',
            data: {
              orderId: orderId,
              deleteRole: 'buyer'
            },
            success: result => {
              wx.hideLoading()
              if (result.result && result.result.success) {
                wx.showToast({ title: '删除成功', icon: 'success' })
                this.loadMyOrders()
              } else {
                wx.showToast({ title: result.result.msg || '删除失败', icon: 'none' })
              }
            },
            fail: () => {
              wx.hideLoading()
              wx.showToast({ title: '网络异常', icon: 'none' })
            }
          })
        }
      }
    })
  },

  onPullDownRefresh() {
    if (this.data.isAdmin) {
      wx.stopPullDownRefresh()
    } else {
      this.loadMyOrders()
    }
  },

  onAdminPublish() { 
    wx.navigateTo({ url: '/pages/admin-book-edit/admin-book-edit' }) 
  },
  
  onAdminOrders() { 
    wx.navigateTo({ url: '/pages/admin-orders/admin-orders' }) 
  },
    
  onAdminBooks() {
     wx.navigateTo({ url: '/pages/admin-books/admin-books' })
  },
  onAdminAnnouncement() {
    wx.navigateTo({ url: '/pages/admin-announcement/admin-announcement' })
  },
  onAdminSettings() {
    wx.navigateTo({ url: '/pages/admin-settings/admin-settings' })
  }
})