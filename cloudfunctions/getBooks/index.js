const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const ADMIN_OPENIDS = ['oBpJc7B-M09rkIGtZNQNn2CgHDN8']

exports.main = async (event) => {
  const { category, keyword, page = 1, pageSize = 20, statusFilter, bookIds } = event

  // 管理员身份必须从服务端 OPENID 判定，不能信任前端传参
  const { OPENID } = cloud.getWXContext()
  const isAdmin = ADMIN_OPENIDS.includes(OPENID)

  try {
    // 批量按 ID 查询模式（购物车结算用）
    if (bookIds && Array.isArray(bookIds) && bookIds.length > 0) {
      const res = await db.collection('books').where({
        _id: db.command.in(bookIds),
        status: 'on_sale'
      }).limit(pageSize).get()
      return { success: true, data: res.data }
    }

    let query = {}

    if (isAdmin && statusFilter) {
      query.status = statusFilter
    } else {
      query.status = 'on_sale'
    }

    if (category && category !== '全部') {
      query.category = category
    }

    if (keyword) {
      // 转义正则特殊字符，防止恶意关键字触发 ReDoS 或匹配异常
      const escaped = String(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      query.title = db.RegExp({ regexp: escaped, options: 'i' })
    }

    const res = await db.collection('books')
      .where(query)
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()

    return { success: true, data: res.data }
  } catch (err) {
    return { success: false, msg: '获取列表失败' }
  }
}