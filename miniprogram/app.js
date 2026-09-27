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
          console.log('全局身份鉴定完毕, isAdmin:', this.globalData.isAdmin)
          resolve(res.result)
        },
        fail: err => {
          console.error('静默登录失败，请检查网络或云函数部署', err)
          reject(err)
        }
      })
    })
  }
})