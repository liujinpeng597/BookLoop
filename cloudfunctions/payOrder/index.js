const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { orderId } = event
  const { OPENID } = cloud.getWXContext()

  if (!orderId) return { success: false, msg: '订单ID不能为空' }

  try {
    // 先读订单做业务校验
    const orderRes = await db.collection('orders').doc(orderId).get()
    const order = orderRes.data

    if (!order) return { success: false, msg: '订单不存在' }
    if (order.buyerOpenId !== OPENID) return { success: false, msg: '无权操作此订单' }
    if (order.paid) return { success: false, msg: '订单已支付，请勿重复支付' }
    if (order.status === 'cancelled') return { success: false, msg: '订单已取消，无法支付' }

    // 原子更新：防止并发重复支付
    const updateRes = await db.collection('orders').where({
      _id: orderId,
      paid: false,
      status: db.command.neq('cancelled')
    }).update({
      data: {
        paid: true,
        paidTime: db.serverDate(),
        paymentMethod: 'qrcode',
        updateTime: db.serverDate()
      }
    })

    if (updateRes.stats.updated === 0) {
      return { success: false, msg: '支付失败，订单状态已变更' }
    }

    return { success: true, msg: '支付成功' }
  } catch (err) {
    console.error('payOrder error:', err)
    return { success: false, msg: '支付失败，请稍后重试' }
  }
}
