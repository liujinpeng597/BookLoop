const cloud = require('wx-server-sdk')
const { isAdminOpenid, safeGetDoc } = require('./cloud-common')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

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

exports.main = async (event) => {
  const { orderId, status } = event
  const { OPENID } = cloud.getWXContext()

  if (!orderId || !status) return { success: false, msg: '参数缺失' }

  try {
    const order = await safeGetDoc(db, 'orders', orderId)
    if (!order) return { success: false, msg: '订单不存在' }

    const isAdmin = isAdminOpenid(OPENID)
    const isBuyer = order.buyerOpenId === OPENID

    // 买家自助取消：仅允许"待交接且未支付"的订单，取消后自动释放库存
    const buyerSelfCancel = !isAdmin && isBuyer && status === 'cancelled'
      && order.status === 'pending' && !order.paid

    // 管理员可执行全部状态转换；买家只能自助取消
    if (!isAdmin && !buyerSelfCancel) return { success: false, msg: '无权限' }

    const prevStatus = order.status

    // 状态机校验：只允许合法的状态转换
    const allowedNext = VALID_TRANSITIONS[prevStatus]
    if (!allowedNext || !allowedNext.includes(status)) {
      return { success: false, msg: `不能从「${prevStatus}」变更为「${status}」` }
    }

    const updateData = { status: status, updateTime: db.serverDate() }
    // 管理员推进到 shipped/completed 视为确认收款（paid 仅为买家自报）
    if (isAdmin && (status === 'shipped' || status === 'completed')) {
      updateData.adminConfirmedPaid = true
    }

    // 原子更新：确保当前状态未变化
    const updateRes = await db.collection('orders').where({
      _id: orderId,
      status: prevStatus
    }).update({ data: updateData })

    if (updateRes.stats.updated === 0) {
      return { success: false, msg: '订单状态已变更，请刷新后重试' }
    }

    const noticeKey = `${prevStatus}_to_${status}`
    const noticeContent = buyerSelfCancel
      ? '买家已取消订单，书籍已重新上架'
      : NOTICE_MAP[noticeKey]

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
          createTime: db.serverDate()
        }
      })
    }

    // 订单取消（管理员取消或买家自助取消）时释放书籍回在售，避免库存被永久锁死。
    // 书籍在下单时即被标记为 sold，"完成"无需再改状态（原 completed 分支为冗余操作）。
    if (status === 'cancelled') {
      const bookIds = order.isBatch && order.items
        ? order.items.map(b => b.bookId).filter(Boolean)
        : (order.bookId ? [order.bookId] : [])
      for (const id of bookIds) {
        try {
          await db.collection('books').where({
            _id: id,
            status: 'sold'
          }).update({
            data: { status: 'on_sale', updateTime: db.serverDate() }
          })
        } catch (e) { /* 单本释放失败不阻塞整体 */ }
      }
    }

    return { success: true, msg: '状态已更新' }
  } catch (err) {
    console.error('updateOrderStatus error:', err)
    return { success: false, msg: '更新失败' }
  }
}
