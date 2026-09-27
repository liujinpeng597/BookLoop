const { getNavBarInfo, condToClass } = require('../../utils/util')

Page({
  data: {
    navTop: 0,
    navHeight: 0,
    navRight: 0,
    list: []
  },

  onLoad() {
    this.setData(getNavBarInfo())
  },

  onShow() {
    // 每次进入重新读取：刚浏览过的书要立刻出现在最前面
    this.loadHistory()
  },

  loadHistory() {
    const list = wx.getStorageSync('browse_history') || []
    list.forEach(item => {
      item.condClass = condToClass(item.condition, 'cond-other')
      item.timeStr = this.formatTime(item.time)
    })
    this.setData({ list })
  },

  formatTime(ts) {
    const d = new Date(ts)
    const pad = n => String(n).padStart(2, '0')
    return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
  },

  onBookTap(e) {
    const bookId = e.currentTarget.dataset.id
    if (bookId) {
      wx.navigateTo({ url: `/pages/detail/detail?id=${bookId}` })
    }
  },

  onClearAll() {
    if (this.data.list.length === 0) return
    wx.showModal({
      title: '清空浏览历史',
      content: '确定清空全部浏览记录吗？',
      confirmColor: '#ef4444',
      success: res => {
        if (res.confirm) {
          wx.removeStorageSync('browse_history')
          this.setData({ list: [] })
          wx.showToast({ title: '已清空', icon: 'success' })
        }
      }
    })
  },

  onBackTap() {
    wx.navigateBack({ delta: 1 })
  }
})
