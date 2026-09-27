const app = getApp()
const { getNavBarInfo } = require('../../utils/util')

Page({
  data: {
    conversations: [],
    navTop: 0,
    navHeight: 0
  },

  onLoad() {
    this.setData(getNavBarInfo())
  },

  onShow() {
    // 进入消息页即视为已读：更新本地已读水位，清除 tabBar 角标
    app.markChatsRead()
    Promise.resolve(app.loginPromise).then(() => {
      this.loadConversations()
    })
  },

  loadConversations() {
    const isAdmin = app.globalData.isAdmin

    wx.cloud.callFunction({
      name: 'getChatConversations',
      success: res => {
        const rawList = (res.result && res.result.data) || []
        const nicknames = (res.result && res.result.nicknames) || {}

        const hideMap = wx.getStorageSync('hidden_chats') || {}
        let list = []

        rawList.forEach(item => {
          const rawDate = item.lastTime ? new Date(item.lastTime) : new Date()
          const msgTimeMs = rawDate.getTime()
          const timeStr = `${rawDate.getHours().toString().padStart(2, '0')}:${rawDate.getMinutes().toString().padStart(2, '0')}`

          const mType = item.msgType || 'chat'
          const hideKey = `${item._id}_${mType}`

          if (hideMap[hideKey] && msgTimeMs <= hideMap[hideKey]) {
            return
          }

          let username = ''
          let icon = '💬'

          switch(mType) {
            case 'chat':
              username = !isAdmin ? '官方客服' : (nicknames[item._id] || '同学_' + item._id.slice(-4))
              icon = '🎧'
              break
            case 'order': username = '订单状态更新'; icon = '📦'; break
            case 'shipping': username = '配送物流通知'; icon = '🛵'; break
            case 'arrival': username = '到货自提提醒'; icon = '🚩'; break
            case 'notice': username = '理工布克公告'; icon = '✨'; break
          }

          list.push({
            id: item._id,
            username: username,
            lastMsg: item.lastMsg || '[新通知]',
            lastDetail: item.lastDetail || item.lastMsg || '',
            time: timeStr,
            msgType: mType,
            icon: icon,
            bookTitle: item.bookTitle || '',
            orderStatus: item.orderStatus || '',
            x: 0,
            currentX: 0
          })
        })

        if (!isAdmin) {
          const hasChat = list.find(item => item.msgType === 'chat')
          if (!hasChat) {
            const myOpenId = app.globalData.openid
            list.unshift({
              id: myOpenId || 'pending',
              username: '官方客服',
              lastMsg: '点击此处与客服沟通...',
              time: '',
              msgType: 'chat',
              icon: '🎧',
              x: 0,
              currentX: 0
            })
          }
        }

        this.setData({ conversations: list })
      },
      fail: err => console.error('获取消息队列失败:', err),
      complete: () => wx.stopPullDownRefresh()
    })
  },

  onItemTap(e) {
    const { id, type } = e.currentTarget.dataset

    if (type === 'chat') {
      wx.navigateTo({
        url: `/pages/chat/chat?chatId=${id}`,
        fail: () => wx.showToast({ title: '聊天室页面尚未开放', icon: 'none' })
      })
    } else {
      const target = this.data.conversations.find(msg => msg.id === id && msg.msgType === type)
      if (target) {
        wx.showModal({
          title: target.username,
          content: target.lastDetail || target.lastMsg,
          showCancel: false,
          confirmText: '我知道了'
        })
      }
    }
  },

  // 注意：这里故意绕过 setData 直接改 currentX——滑动跟手需要高频写入，
  // setData 开销会造成掉帧。该字段仅作手势状态缓存，不参与渲染。
  onSlideChange(e) {
    const index = e.currentTarget.dataset.index
    this.data.conversations[index].currentX = e.detail.x
  },

  onSlideEnd(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.conversations[index]

    if (item.currentX < -30) {
      item.x = -70
    } else {
      item.x = 0
    }

    this.setData({
      [`conversations[${index}].x`]: item.x
    })
  },

  onDeleteMsg(e) {
    const { id, type, index } = e.currentTarget.dataset

    const isChat = type === 'chat'
    wx.showModal({
      title: isChat ? '删除会话' : '删除通知',
      content: isChat ? '仅从你的列表移除。对方发来新消息时会自动恢复。' : '确定要清除这条通知记录吗？',
      success: (res) => {
        if (res.confirm) {
          const hideMap = wx.getStorageSync('hidden_chats') || {}
          hideMap[`${id}_${type}`] = new Date().getTime()
          wx.setStorageSync('hidden_chats', hideMap)

          this.data.conversations.splice(index, 1)
          this.setData({ conversations: this.data.conversations })
          wx.showToast({ title: '已清除', icon: 'success' })
        } else {
          this.setData({ [`conversations[${index}].x`]: 0 })
        }
      }
    })
  },

  onPullDownRefresh() {
    Promise.resolve(app.loginPromise).then(() => {
      this.loadConversations()
    })
  }
})
