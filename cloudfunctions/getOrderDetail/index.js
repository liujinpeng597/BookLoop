const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { orderId } = event
  const { OPENID } = cloud.getWXContext()

  try {
    const res = await db.collection('orders').doc(orderId).get()
    const order = res.data

    if (!order) return { success: false, msg: '订单不存在' }

    // 校验：只有买家本人或管理员可查看
    const ADMIN_OPENIDS = ['oBpJc7B-M09rkIGtZNQNn2CgHDN8']
    if (order.buyerOpenId !== OPENID && !ADMIN_OPENIDS.includes(OPENID)) {
      return { success: false, msg: '无权查看' }
    }

    return { success: true, data: order }
  } catch (e) {
    return { success: false, msg: e.message || '加载失败' }
  }
}
