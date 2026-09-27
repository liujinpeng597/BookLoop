const app = getApp()
const { getNavBarInfo } = require('../../utils/util')
const { STATUS_MAP } = require('../../utils/constants')

const EMOJI_LIST = [
  '😀','😂','🤣','😊','😍','🤔','😎','😢','😡','😱','🤗','🤩','😴','🥰','😋','🤐','🙄','😏','😌','😭',
  '👍','👎','🙏','💪','👋','🤝','✌️','👌','✋','👏','🙌','🤞','👆','👇','👈','👉','💅','🤘','🖐️','🫶',
  '❤️','💔','💕','💖','💗','💝','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💞','💓','💘','🔥','✨','💯',
  '🎉','⭐','🌈','🎵','📚','📖','🎓','✏️','📝','📌','💡','💤','🕐','⏰','📅','💬','🗯️','💭','🔔','🎊',
  '✅','❌','⚠️','❓','❗','💢','🉑','🈶','🈚','🈸','㊙️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🔞','🚫',
  '🌸','🌺','🌻','🍀','☀️','🌙','⚡','💧','🌊','🌟','🍎','🍊','🍋','🍉','🍇','🍓','🍒','🍑','🎄',
  '🚗','🚌','✈️','🚀','🏠','🏫','📍','🏪','🏥','🏦','🗺️','🧭','🛒','📦','🎁','💰','💵','💳','💎','🪙'
]

Page({
  data: {
    navTop: 0,
    navHeight: 0,
    navRight: 0,
    chatId: '',
    messages: [],
    inputText: '',
    isAdmin: false,
    targetName: '',
    scrollIntoView: '',
    keyboardHeight: 0,
    hasNewMsg: false,
    newMsgCount: 0,

    // 订单选择器
    showOrderPicker: false,
    userOrders: [],
    selectedCount: 0,

    // 表情面板
    showEmojiPanel: false,
    emojiList: EMOJI_LIST,

    statusMap: STATUS_MAP
  },

  onLoad(options) {
    this.chatId = options.chatId || ''
    this.userOpenId = ''
    // 详情页"聊一聊"带进来的书名：空会话时自动预填咨询话术
    try {
      this.pendingBookTitle = options.bookTitle ? decodeURIComponent(options.bookTitle) : ''
    } catch (e) {
      this.pendingBookTitle = ''
    }

    this.setData(getNavBarInfo())

    wx.onKeyboardHeightChange(res => {
      this.setData({ keyboardHeight: res.height })
      if (res.height > 0) {
        this.setData({ showEmojiPanel: false })
        this.scrollToBottom()
      }
    })

    Promise.resolve(app.loginPromise).then(() => {
      this.userOpenId = app.globalData.openid
      const isAdmin = app.globalData.isAdmin
      this.setData({
        isAdmin,
        targetName: isAdmin ? '加载中...' : '官方客服'
      })
      this.loadMessages()
    })
  },

  onShow() {
    if (this.userOpenId && this._needRefresh !== false) {
      this.loadMessages()
    }
    this._needRefresh = true
    this._startPolling()
  },

  onHide() {
    this._stopPolling()
    // 离开聊天页时，会话内的消息都已读，刷新本地已读水位并清角标
    app.markChatsRead()
  },

  onUnload() {
    wx.offKeyboardHeightChange()
    this._stopPolling()
    app.markChatsRead()
  },

  _startPolling() {
    this._stopPolling()
    // 每 3 秒静默拉取新消息
    this._pollTimer = setInterval(() => {
      this._pollMessages()
    }, 3000)
  },

  _stopPolling() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer)
      this._pollTimer = null
    }
  },

  _processMessages(rawMessages) {
    return rawMessages.map(msg => ({
      ...msg,
      isMine: msg.fromOpenId === this.userOpenId,
      timeStr: this.formatTime(msg.createTime)
    }))
  },

  // 静默轮询：检测新消息，在底部则自动滚到底，否则显示提醒气泡
  _pollMessages() {
    wx.cloud.callFunction({
      name: 'getChatMessages',
      data: { chatId: this.chatId },
      success: res => {
        const newMessages = this._processMessages((res.result && res.result.data) || [])
        const oldCount = this.data.messages.length
        if (newMessages.length !== oldCount) {
          const newCount = newMessages.length - oldCount
          this.setData({ messages: newMessages }, () => {
            if (newCount > 0) this._handleNewMessages(newCount)
          })
        }
        if (res.result && res.result.targetNickName && this.data.targetName !== res.result.targetNickName) {
          this.setData({ targetName: res.result.targetNickName })
        }
      }
    })
  },

  // 有新消息：判断当前是否在底部，决定自动滚动还是显示提醒
  _handleNewMessages(newCount) {
    const query = wx.createSelectorQuery()
    query.select('#msg-scroll').scrollOffset()
    query.select('#msg-scroll').boundingClientRect()
    query.exec(res => {
      const offset = res && res[0]
      const rect = res && res[1]
      const atBottom = !!(offset && rect && (offset.scrollTop + rect.height >= offset.scrollHeight - 60))
      if (atBottom) {
        this.scrollToBottom()
      } else {
        this.setData({
          hasNewMsg: true,
          newMsgCount: (this.data.newMsgCount || 0) + newCount
        })
      }
    })
  },

  loadMessages() {
    wx.cloud.callFunction({
      name: 'getChatMessages',
      data: { chatId: this.chatId },
      success: res => {
        const messages = this._processMessages((res.result && res.result.data) || [])
        if (res.result && res.result.targetNickName) {
          this.setData({ targetName: res.result.targetNickName })
        } else if (this.data.isAdmin && !(res.result && res.result.targetNickName)) {
          this.setData({ targetName: '同学_' + this.chatId.slice(-4) })
        }
        // 空会话 + 带了书名 → 预填一句咨询话术，只填一次
        if (messages.length === 0 && this.pendingBookTitle && !this._prefilled) {
          this._prefilled = true
          this.setData({ inputText: `你好，我想咨询《${this.pendingBookTitle}》这本书~` })
        }
        this._needRefresh = false
        this.setData({ messages }, () => {
          this.scrollToBottom()
        })
      },
      fail: () => {
        wx.showToast({ title: '加载消息失败', icon: 'none' })
      }
    })
  },

  scrollToBottom() {
    // 先清空锚点再定位到底部锚点，确保每次都能触发滚动
    this.setData({ hasNewMsg: false, newMsgCount: 0, scrollIntoView: '' }, () => {
      this.setData({ scrollIntoView: 'msg-bottom' })
    })
  },

  // 点击“新消息”提醒，下滑到最新消息
  onNewMsgTap() {
    this.scrollToBottom()
  },

  // 用户手动滚动到底部时，清除新消息提醒
  onMsgScrollToLower() {
    this.setData({ hasNewMsg: false, newMsgCount: 0 })
  },

  onInput(e) {
    this.setData({ inputText: e.detail.value })
  },

  onSend() {
    const content = this.data.inputText.trim()
    if (!content) return
    if (content.length > 500) {
      wx.showToast({ title: '消息过长，请精简', icon: 'none' })
      return
    }

    const now = Date.now()
    if (this._lastSendTime && now - this._lastSendTime < 1000) {
      wx.showToast({ title: '发送太频繁，请稍候', icon: 'none' })
      return
    }
    this._lastSendTime = now

    wx.cloud.callFunction({
      name: 'sendChatMessage',
      data: { chatId: this.chatId, content },
      success: res => {
        if (res.result && res.result.success) {
          this.setData({ inputText: '', showEmojiPanel: false })
          this._needRefresh = false
          this.loadMessages()
        } else {
          wx.showToast({ title: (res.result && res.result.msg) || '发送失败', icon: 'none' })
        }
      },
      fail: () => {
        wx.showToast({ title: '发送失败', icon: 'none' })
      }
    })
  },

  // 切换表情面板（打开表情时收起键盘）
  onToggleEmoji() {
    if (this.data.showEmojiPanel) {
      this.setData({ showEmojiPanel: false })
    } else {
      this.setData({ showEmojiPanel: true })
    }
  },

  // 点击表情，追加到输入框末尾
  onEmojiTap(e) {
    const emoji = e.currentTarget.dataset.emoji
    const current = this.data.inputText || ''
    this.setData({ inputText: current + emoji })
  },

  // 点击 + 按钮，打开订单选择器
  onOpenOrderPicker() {
    if (this.data.isAdmin) {
      wx.showToast({ title: '管理员无需分享订单', icon: 'none' })
      return
    }

    this.setData({ showOrderPicker: true, showEmojiPanel: false })
    wx.showLoading({ title: '加载订单...' })

    // 注：订单归属由服务端根据 OPENID 判定，无需（也不应）传 isAdmin
    wx.cloud.callFunction({
      name: 'getOrders',
      data: { page: 1, pageSize: 20 },
      success: res => {
        wx.hideLoading()
        const orders = ((res.result && res.result.data) || []).map(o => ({
          ...o,
          selected: false
        }))
        this.setData({ userOrders: orders, selectedCount: 0 })
      },
      fail: () => {
        wx.hideLoading()
        wx.showToast({ title: '加载订单失败', icon: 'none' })
      }
    })
  },

  onCloseOrderPicker() {
    this.setData({ showOrderPicker: false, userOrders: [], selectedCount: 0 })
  },

  onToggleOrder(e) {
    const index = e.currentTarget.dataset.index
    const key = `userOrders[${index}].selected`
    const current = this.data.userOrders[index].selected
    this.setData({ [key]: !current })
    const count = this.data.userOrders.filter(o => o.selected).length
    this.setData({ selectedCount: count })
  },

  onSendOrders() {
    const selected = this.data.userOrders.filter(o => o.selected)
    if (selected.length === 0) {
      wx.showToast({ title: '请至少选择一个订单', icon: 'none' })
      return
    }

    const orders = selected.map(o => ({
      orderId: o._id,
      orderNo: o.orderNo || '',
      bookTitle: o.isBatch ? `多书订单(${o.items ? o.items.length : 0}本)` : (o.bookTitle || '未知书籍'),
      price: o.isBatch ? (o.totalPrice || 0) : (o.price || 0),
      status: o.status || 'pending',
      isBatch: !!o.isBatch
    }))

    wx.cloud.callFunction({
      name: 'sendChatMessage',
      data: {
        chatId: this.chatId,
        msgType: 'order_share',
        content: `分享了${orders.length}个订单`,
        orders
      },
      success: res => {
        if (res.result && res.result.success) {
          this.setData({ showOrderPicker: false, userOrders: [], selectedCount: 0 })
          this._needRefresh = false
          this.loadMessages()
        } else {
          wx.showToast({ title: (res.result && res.result.msg) || '发送失败', icon: 'none' })
        }
      },
      fail: () => {
        wx.showToast({ title: '发送失败', icon: 'none' })
      }
    })
  },

  onOrderCardTap(e) {
    const orderId = e.currentTarget.dataset.orderId
    if (!orderId) return

    // 跳转前先校验订单实时状态与当前用户读取权限，
    // 避免订单已被删除/完结时强行跳转导致页面报错
    wx.cloud.callFunction({
      name: 'checkOrderAccess',
      data: { orderId },
      success: res => {
        const r = res.result || {}
        if (r.success && r.canView) {
          wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${orderId}` })
        } else {
          const toast = r.reason === 'completed' ? '订单已完成' : '订单已失效'
          wx.showToast({ title: toast, icon: 'none' })
        }
      },
      fail: () => {
        // 校验失败（网络/云端异常）也按失效处理，避免误跳转
        wx.showToast({ title: '订单已失效', icon: 'none' })
      }
    })
  },

  // 清除当前会话的聊天记录（服务端物理删除，双方都会失去这些记录）
  onClearChat() {
    wx.showModal({
      title: '清除聊天记录',
      content: '将同时清除你与对方（管理员/买家）双方的全部聊天记录，此操作不可恢复。',
      confirmColor: '#ef4444',
      success: res => {
        if (res.confirm) {
          wx.showLoading({ title: '清除中...' })
          wx.cloud.callFunction({
            name: 'clearChat',
            data: { chatId: this.chatId },
            success: r => {
              wx.hideLoading()
              if (r.result && r.result.success) {
                this.setData({ messages: [], hasNewMsg: false, newMsgCount: 0 })
                wx.showToast({ title: '已清除', icon: 'success' })
              } else {
                wx.showToast({ title: (r.result && r.result.msg) || '清除失败', icon: 'none' })
              }
            },
            fail: () => {
              wx.hideLoading()
              wx.showToast({ title: '清除失败', icon: 'none' })
            }
          })
        }
      }
    })
  },

  formatTime(date) {
    if (!date) return ''
    const d = new Date(date)
    const h = d.getHours().toString().padStart(2, '0')
    const m = d.getMinutes().toString().padStart(2, '0')
    return `${d.getMonth() + 1}/${d.getDate()} ${h}:${m}`
  },

  noop() {},

  onBackTap() {
    wx.navigateBack()
  }
})
