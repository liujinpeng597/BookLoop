const cloud = require('wx-server-sdk')
const { safeGetDoc } = require('./cloud-common')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { success: false, msg: '登录状态异常' }

  const action = event.action || 'check'

  try {
    // 收藏 / 取消收藏（同一接口切换，返回最新状态）
    if (action === 'toggle') {
      const { bookId } = event
      if (!bookId) return { success: false, msg: '参数错误' }

      const book = await safeGetDoc(db, 'books', bookId)
      if (!book) return { success: false, msg: '书籍不存在' }

      const exist = await db.collection('favorites')
        .where({ openid: OPENID, bookId })
        .count()

      if (exist.total > 0) {
        await db.collection('favorites').where({ openid: OPENID, bookId }).remove()
        return { success: true, favorite: false }
      }

      // 收藏上限 200，防恶意灌库
      const countRes = await db.collection('favorites').where({ openid: OPENID }).count()
      if (countRes.total >= 200) {
        return { success: false, msg: '收藏已达上限，请先清理' }
      }

      await db.collection('favorites').add({
        data: { openid: OPENID, bookId, createTime: db.serverDate() }
      })
      return { success: true, favorite: true }
    }

    // 查询某本书是否已收藏（详情页回显收藏状态）
    if (action === 'check') {
      const { bookId } = event
      if (!bookId) return { success: false, msg: '参数错误' }
      const exist = await db.collection('favorites')
        .where({ openid: OPENID, bookId })
        .count()
      return { success: true, favorite: exist.total > 0 }
    }

    // 我的收藏列表（分页 + 书籍信息服务端回读，不信任前端字段）
    if (action === 'list') {
      const page = Math.max(1, parseInt(event.page, 10) || 1)
      const pageSize = Math.min(50, Math.max(1, parseInt(event.pageSize, 10) || 10))

      const [favRes, totalRes] = await Promise.all([
        db.collection('favorites')
          .where({ openid: OPENID })
          .orderBy('createTime', 'desc')
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .get(),
        db.collection('favorites').where({ openid: OPENID }).count()
      ])

      const favs = favRes.data || []
      const bookIds = favs.map(f => f.bookId)

      let bookMap = {}
      if (bookIds.length > 0) {
        const booksRes = await db.collection('books').where({ _id: _.in(bookIds) }).get()
        ;(booksRes.data || []).forEach(b => { bookMap[b._id] = b })
      }

      // 书籍已被删除的收藏项自然失效，直接过滤
      const data = favs.map(f => bookMap[f.bookId]).filter(Boolean)

      return {
        success: true,
        data,
        total: totalRes.total,
        hasMore: page * pageSize < totalRes.total
      }
    }

    return { success: false, msg: '未知操作' }
  } catch (e) {
    console.error('favorite error:', e)
    return { success: false, msg: '操作失败' }
  }
}
