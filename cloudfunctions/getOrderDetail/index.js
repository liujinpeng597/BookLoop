const cloud = require('wx-server-sdk')
const { isAdminOpenid, safeGetDoc } = require('./cloud-common')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { orderId } = event
  const { OPENID } = cloud.getWXContext()

  if (!orderId) return { success: false, msg: '参数缺失' }

  try {
    const order = await safeGetDoc(db, 'orders', orderId)
    if (!order) return { success: false, msg: '订单不存在' }

    // 校验：只有买家本人或管理员可查看
    if (order.buyerOpenId !== OPENID && !isAdminOpenid(OPENID)) {
      return { success: false, msg: '无权查看' }
    }

    return { success: true, data: order }
  } catch (e) {
    console.error('getOrderDetail error:', e)
    return { success: false, msg: '加载失败' }
  }
}
