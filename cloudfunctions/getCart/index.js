const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async () => {
  const openid = cloud.getWXContext().OPENID

  try {
    const res = await db.collection('cart')
      .where({ buyerOpenId: openid })
      .orderBy('createTime', 'desc')
      .get()
    return { success: true, data: res.data || [] }
  } catch (e) {
    // 集合不存在（全新环境首次访问）按空购物车处理；其余错误如实返回失败
    const msg = String((e && (e.errMsg || e.message)) || '')
    if (/not exist/i.test(msg)) {
      try { await db.createCollection('cart') } catch (_) { /* 已存在 */ }
      return { success: true, data: [] }
    }
    console.error('getCart error:', e)
    return { success: false, msg: '购物车加载失败' }
  }
}
