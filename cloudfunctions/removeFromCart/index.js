const cloud = require('wx-server-sdk')
const { safeGetDoc } = require('./cloud-common')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { cartId } = event
  const { OPENID } = cloud.getWXContext()
  if (!cartId) return { success: false, msg: '参数缺失' }

  try {
    const item = await safeGetDoc(db, 'cart', cartId)
    if (!item || item.buyerOpenId !== OPENID) {
      return { success: false, msg: '无权操作' }
    }
    await db.collection('cart').doc(cartId).remove()
    return { success: true }
  } catch (e) {
    console.error('removeFromCart error:', e)
    return { success: false, msg: '移除失败' }
  }
}
