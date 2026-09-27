const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { cartId } = event
  const { OPENID } = cloud.getWXContext()

  try {
    const doc = await db.collection('cart').doc(cartId).get()
    if (!doc.data || doc.data.buyerOpenId !== OPENID) {
      return { success: false, msg: '无权操作' }
    }
    await db.collection('cart').doc(cartId).remove()
    return { success: true }
  } catch (e) {
    return { success: false, msg: e.message || '移除失败' }
  }
}
