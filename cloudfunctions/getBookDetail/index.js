const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { bookId } = event
  if (!bookId) return { success: false, msg: '缺少参数' }

  try {
    const { OPENID } = cloud.getWXContext()

    // 确保 view_logs 集合存在（首次访问时自动创建），否则浏览量统计会静默失效
    try { await db.createCollection('view_logs') } catch (e) { /* 已存在 */ }

    // 先去重检查：同一用户 10 分钟内重复查看不增加浏览量
    const dupRes = await db.collection('view_logs').where({
      bookId,
      openId: OPENID,
      viewTime: _.gte(new Date(Date.now() - 10 * 60 * 1000))
    }).count()

    if (dupRes.total === 0) {
      // 记录查看日志
      await db.collection('view_logs').add({
        data: { bookId, openId: OPENID, viewTime: new Date() }
      })
      // 浏览量 +1
      await db.collection('books').doc(bookId).update({
        data: { views: _.inc(1) }
      })
    }

    const res = await db.collection('books').doc(bookId).get()
    return { success: true, data: res.data }
  } catch (err) {
    // view_logs 集合可能不存在，降级为直接查询
    try {
      const res = await db.collection('books').doc(bookId).get()
      return { success: true, data: res.data }
    } catch (e) {
      return { success: false, msg: '获取详情失败' }
    }
  }
}