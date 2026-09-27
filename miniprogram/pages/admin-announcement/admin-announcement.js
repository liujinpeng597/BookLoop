const app = getApp()
const { getNavBarInfo } = require('../../utils/util')

Page({
  data: {
    navTop: 0,
    navHeight: 0,
    content: '',
    submitting: false,
    announcements: [],
    loading: true
  },

  onLoad() {
    this.setData(getNavBarInfo())
    this.loadAnnouncements()
  },

  loadAnnouncements() {
    wx.cloud.callFunction({
      name: 'publishAnnouncement',
      data: { action: 'list' },
      success: res => {
        if (res.result && res.result.success) {
          const list = (res.result.data || []).map(item => {
            const d = item.createTime ? new Date(item.createTime) : new Date()
            const pad = n => String(n).padStart(2, '0')
            item.timeStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
            return item
          })
          this.setData({ announcements: list, loading: false })
        } else {
          this.setData({ loading: false })
        }
      },
      fail: () => this.setData({ loading: false }),
      complete: () => wx.stopPullDownRefresh()
    })
  },

  onInput(e) {
    this.setData({ content: e.detail.value })
  },

  onSubmit() {
    const content = this.data.content.trim()
    if (!content) return wx.showToast({ title: '请输入公告内容', icon: 'none' })
    if (this.data.submitting) return

    this.setData({ submitting: true })
    wx.showLoading({ title: '发布中...', mask: true })

    wx.cloud.callFunction({
      name: 'publishAnnouncement',
      data: { content },
      success: res => {
        wx.hideLoading()
        if (res.result && res.result.success) {
          wx.showToast({ title: '公告已发布', icon: 'success' })
          this.setData({ content: '', submitting: false })
          this.loadAnnouncements()
        } else {
          wx.showToast({ title: (res.result && res.result.msg) || '发布失败', icon: 'none' })
          this.setData({ submitting: false })
        }
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '发布失败', icon: 'none' })
        this.setData({ submitting: false })
      }
    })
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除公告',
      content: '确定删除此条公告？',
      success: res => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'publishAnnouncement',
            data: { action: 'delete', id },
            success: () => {
              wx.showToast({ title: '已删除', icon: 'success' })
              this.loadAnnouncements()
            },
            fail: () => wx.showToast({ title: '删除失败', icon: 'none' })
          })
        }
      }
    })
  },

  onBackTap() {
    wx.navigateBack()
  },

  onPullDownRefresh() {
    this.loadAnnouncements()
  }
})
