App({
  globalData: {
    openid: null,
    isAdmin: false,
    avatarUrl: '',
    nickName: ''
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }

    wx.cloud.init({
      env: 'cloud1-8g361be61aa5b7ef',
      traceUser: true
    })

    // 从本地缓存恢复头像昵称
    const profile = wx.getStorageSync('user_profile')
    if (profile) {
      this.globalData.avatarUrl = profile.avatarUrl || ''
      this.globalData.nickName = profile.nickName || ''
    }

    this.loginPromise = this.checkLogin()
  },

  checkLogin() {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'login',
        success: res => {
          this.globalData.openid = res.result.openid
          this.globalData.isAdmin = res.result.isAdmin
          // 打印 openid 便于与管理员白名单（shared/cloud-common.js）比对排查
          console.log('全局身份鉴定完毕, openid:', res.result.openid, 'isAdmin:', this.globalData.isAdmin)
          resolve(res.result)
        },
        fail: err => {
          console.error('静默登录失败，请检查网络或云函数部署', err)
          reject(err)
        }
      })
    })
  },

  // 刷新消息 tabBar 未读角标（首页/我的页 onShow 时调用）
  refreshUnreadBadge() {
    Promise.resolve(this.loginPromise).then(() => {
      const since = wx.getStorageSync('chat_read_ts') || 0
      wx.cloud.callFunction({
        name: 'getUnreadCount',
        data: { since },
        success: res => {
          if (!(res.result && res.result.success)) return
          const count = res.result.count || 0
          if (count > 0) {
            wx.setTabBarBadge({ index: 2, text: count > 99 ? '99+' : String(count), fail: () => {} })
          } else {
            wx.removeTabBarBadge({ index: 2, fail: () => {} })
          }
        },
        // fail 回调兜底：部分基础库下带 success 的 callFunction 不返回 Promise，.catch 不会触发
        fail: () => {}
      }).catch(() => {})
    }).catch(() => {})
  },

  // 标记全部消息已读（进入消息页/离开聊天页时调用）：更新本地已读水位并清角标
  markChatsRead() {
    wx.setStorageSync('chat_read_ts', Date.now())
    wx.removeTabBarBadge({ index: 2, fail: () => {} })
  }
})