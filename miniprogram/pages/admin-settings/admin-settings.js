const { getNavBarInfo } = require('../../utils/util')
const SETTINGS_KEY = 'paymentQrcode'

Page({
  data: {
    navTop: 0,
    navHeight: 0,
    loading: false,
    saving: false,
    qrcodeUrl: '',
    qrcodeFileId: '',
    hasQrcode: false
  },

  onLoad() {
    this.setData(getNavBarInfo())
  },

  onShow() {
    this.loadCurrentQrcode()
  },

  // 通过云函数加载当前收款码（云函数已自动转换 cloud:// 为 HTTPS）
  loadCurrentQrcode() {
    this.setData({ loading: true })
    wx.cloud.callFunction({
      name: 'getSettings',
      data: { key: SETTINGS_KEY },
      success: res => {
        if (res.result && res.result.success && res.result.data) {
          const doc = res.result.data
          // value 已是 HTTPS 链接，原始 cloud:// ID 需要另存一份用于保存判断
          this.setData({
            qrcodeUrl: doc.value,
            hasQrcode: true
          })
        } else if (res.result && !res.result.success) {
          wx.showToast({ title: res.result.msg || '收款码配置读取失败', icon: 'none' })
        }
        this.setData({ loading: false })
      },
      fail: err => {
        console.error('加载收款码失败:', err)
        this.setData({ loading: false })
      }
    })
  },

  onUploadQrcode() {
    // wx.chooseImage 已废弃，统一使用 wx.chooseMedia
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: res => {
        const tempPath = res.tempFiles[0].tempFilePath
        wx.showLoading({ title: '上传中...' })
        const cloudPath = `qrcode/payment_${Date.now()}.jpg`

        wx.cloud.uploadFile({
          cloudPath,
          filePath: tempPath,
          success: uploadRes => {
            wx.hideLoading()
            this.setData({
              qrcodeUrl: tempPath,
              qrcodeFileId: uploadRes.fileID,
              hasQrcode: true
            })
            wx.showToast({ title: '二维码已选择，请点击保存', icon: 'none' })
          },
          fail: () => {
            wx.hideLoading()
            wx.showToast({ title: '上传失败，请重试', icon: 'none' })
          }
        })
      }
    })
  },

  onSave() {
    const { qrcodeFileId, saving } = this.data
    if (saving || !qrcodeFileId) return

    this.setData({ saving: true })

    // 通过云函数保存（云函数端会用 createCollection 自动建集合）
    wx.cloud.callFunction({
      name: 'saveSetting',
      data: { key: SETTINGS_KEY, value: qrcodeFileId },
      success: res => {
        this.setData({ saving: false })
        if (res.result && res.result.success) {
          wx.showToast({ title: '收款码保存成功', icon: 'success' })
        } else {
          const msg = (res.result && res.result.msg) || '保存失败，请重试'
          wx.showToast({ title: msg, icon: 'none' })
        }
      },
      fail: err => {
        console.error('保存失败:', err)
        this.setData({ saving: false })
        wx.showToast({ title: '网络异常，请重试', icon: 'none' })
      }
    })
  },

  onBackTap() {
    wx.navigateBack()
  }
})
