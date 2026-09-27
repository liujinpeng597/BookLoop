const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const ADMIN_OPENIDS = ['oBpJc7B-M09rkIGtZNQNn2CgHDN8']

exports.main = async (event) => {
  const { chatId, content, msgType, orders } = event
  const { OPENID } = cloud.getWXContext()

  const isAdmin = ADMIN_OPENIDS.includes(OPENID)

  if (!chatId) return { success: false, msg: '参数缺失' }
  if (!isAdmin && chatId !== OPENID) return { success: false, msg: '无权操作' }

  // 订单分享消息
  if (msgType === 'order_share') {
    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return { success: false, msg: '请选择订单' }
    }
    if (orders.length > 10) return { success: false, msg: '单次最多分享10个订单' }

    // 校验所有订单都属于发送者，并用服务端数据构建分享内容（防止伪造价格/标题）
    try {
      const orderIds = orders.map(o => o.orderId).filter(Boolean)
      const orderRes = await db.collection('orders').where({
        _id: db.command.in(orderIds),
        buyerOpenId: OPENID
      }).get()

      const validOrders = orderRes.data.map(o => ({
        orderId: o._id,
        orderNo: o.orderNo || '',
        bookTitle: o.isBatch
          ? `多书订单(${o.items ? o.items.length : 0}本)`
          : (o.bookTitle || '未知书籍'),
        price: o.isBatch ? (o.totalPrice || 0) : (o.price || 0),
        status: o.status || 'pending',
        isBatch: !!o.isBatch
      }))

      if (validOrders.length === 0) return { success: false, msg: '无有效订单' }

      await db.collection('chat_messages').add({
        data: {
          chatId,
          fromOpenId: OPENID,
          content: content || '分享了订单',
          type: 'order_share',
          orders: validOrders,
          createTime: db.serverDate()
        }
      })
      return { success: true }
    } catch (e) {
      return { success: false, msg: '发送失败' }
    }
  }

  // 普通文本消息
  if (!content) return { success: false, msg: '参数缺失' }
  if (typeof content !== 'string') return { success: false, msg: '消息格式错误' }

  const trimmed = content.trim()
  if (!trimmed) return { success: false, msg: '消息不能为空' }
  if (trimmed.length > 500) return { success: false, msg: '消息过长，请精简到500字以内' }

  try {
    await db.collection('chat_messages').add({
      data: {
        chatId,
        fromOpenId: OPENID,
        content: trimmed,
        type: 'chat',
        createTime: db.serverDate()
      }
    })
    return { success: true }
  } catch (e) {
    return { success: false, msg: '发送失败' }
  }
}
