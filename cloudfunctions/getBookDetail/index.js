const cloud = require('wx-server-sdk')
const { safeGetDoc } = require('./cloud-common')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { bookId, countView } = event
  if (!bookId) return { success: false, msg: '缺少参数' }

  try {
    const book = await safeGetDoc(db, 'books', bookId)
    if (!book) return { success: false, msg: '书籍不存在' }

    // 浏览计数副作用默认开启（真实详情页访问）；
    // 订单确认页、管理端编辑页等"非展示型"读取请传 countView: false，避免统计虚高
    if (countView !== false) {
      const { OPENID } = cloud.getWXContext()
      try { await db.createCollection('view_logs') } catch (e) { /* 已存在 */ }

      // 同一用户 10 分钟内重复查看不重复计数
      const dupRes = await db.collection('view_logs').where({
        bookId,
        openId: OPENID,
        viewTime: _.gte(new Date(Date.now() - 10 * 60 * 1000))
      }).count()

      if (dupRes.total === 0) {
        await db.collection('view_logs').add({
          data: { bookId, openId: OPENID, viewTime: db.serverDate() }
        })
        await db.collection('books').doc(bookId).update({
          data: { views: _.inc(1) }
        })
      }
    }

    return { success: true, data: book }
  } catch (err) {
    console.error('getBookDetail error:', err)
    return { success: false, msg: '获取详情失败' }
  }
}
