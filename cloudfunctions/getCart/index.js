const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    const res = await db.collection('cart')
      .where({ buyerOpenId: openid })
      .orderBy('createTime', 'desc')
      .get()
    return { success: true, data: res.data || [] }
  } catch (e) {
    return { success: true, data: [] }
  }
}
