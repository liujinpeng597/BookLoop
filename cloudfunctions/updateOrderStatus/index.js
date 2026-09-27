const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const ADMIN_OPENIDS = ['oBpJc7B-M09rkIGtZNQNn2CgHDN8']

// 合法的状态转换表
const VALID_TRANSITIONS = {
  'pending': ['shipped', 'cancelled'],
  'shipped': ['completed'],
  'completed': [],
  'cancelled': []
}

const NOTICE_MAP = {
  'pending_to_shipped': '已发货，请留意物流信息',
  'pending_to_cancelled': '已取消',
  'shipped_to_completed': '已确认完成，感谢购买'
}

exports.main = async (event, context) => {
  if (!ADMIN_OPENIDS.includes(cloud.getWXContext().OPENID)) return { success: false, msg: '无权限' }

  const { orderId, status } = event
  if (!orderId || !status) return { success: false, msg: '参数缺失' }

  try {
    const orderRes = await db.collection('orders').doc(orderId).get()
    const order = orderRes.data
    if (!order) return { success: false, msg: '订单不存在' }

    const prevStatus = order.status

    // 状态机校验：只允许合法的状态转换
    const allowedNext = VALID_TRANSITIONS[prevStatus]
    if (!allowedNext || !allowedNext.includes(status)) {
      return { success: false, msg: `不能从「${prevStatus}」变更为「${status}」` }
    }

    // 原子更新：确保当前状态未变化
    const updateRes = await db.collection('orders').where({
      _id: orderId,
      status: prevStatus
    }).update({
      data: { status: status, updateTime: db.serverDate() }
    })

    if (updateRes.stats.updated === 0) {
      return { success: false, msg: '订单状态已变更，请刷新后重试' }
    }

    const noticeKey = `${prevStatus}_to_${status}`
    const noticeContent = NOTICE_MAP[noticeKey]

    if (noticeContent && order.buyerOpenId) {
      const isBatch = order.isBatch && order.items && order.items.length > 0
      const bookLabel = isBatch
        ? `多书订单(共${order.items.length}本)`
        : `《${order.bookTitle}》`
      const priceText = isBatch
        ? (order.totalPrice + (order.deliveryFee || 0)).toFixed(2)
        : (Number(order.price) + Number(order.deliveryFee || 0)).toFixed(2)
      const detailText = isBatch
        ? `订单号：${order.orderNo}\n${bookLabel}\n金额：¥${priceText}\n状态：${noticeContent}`
        : `订单号：${order.orderNo}\n书名：${order.bookTitle}\n金额：¥${priceText}\n状态：${noticeContent}`

      await db.collection('chat_messages').add({
        data: {
          chatId: `order_${orderId}`,
          fromOpenId: 'system',
          toOpenId: order.buyerOpenId,
          content: `📦 ${bookLabel} ${noticeContent}`,
          detail: detailText,
          type: 'order',
          orderId: orderId,
          orderNo: order.orderNo,
          bookTitle: bookLabel,
          orderStatus: status,
          createTime: new Date()
        }
      })
    }

    if (status === 'completed') {
      if (order.isBatch && order.items && order.items.length > 0) {
        for (const bk of order.items) {
          if (bk.bookId) {
            await db.collection('books').doc(bk.bookId).update({
              data: { status: 'sold', updateTime: db.serverDate() }
            })
          }
        }
      } else if (order.bookId) {
        await db.collection('books').doc(order.bookId).update({
          data: { status: 'sold', updateTime: db.serverDate() }
        })
      }
    }

    // 订单取消时，把书籍释放回在售状态，避免书籍被永久锁死
    if (status === 'cancelled') {
      if (order.isBatch && order.items && order.items.length > 0) {
        for (const bk of order.items) {
          if (bk.bookId) {
            await db.collection('books').where({
              _id: bk.bookId,
              status: 'sold'
            }).update({
              data: { status: 'on_sale', updateTime: db.serverDate() }
            })
          }
        }
      } else if (order.bookId) {
        await db.collection('books').where({
          _id: order.bookId,
          status: 'sold'
        }).update({
          data: { status: 'on_sale', updateTime: db.serverDate() }
        })
      }
    }

    return { success: true, msg: '状态已更新' }
  } catch (err) {
    console.error('updateOrderStatus error:', err)
    return { success: false, msg: '更新失败' }
  }
}
