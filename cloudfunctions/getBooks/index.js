const cloud = require('wx-server-sdk')
const { isAdminOpenid } = require('./cloud-common')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { category, keyword, statusFilter, bookIds } = event

  // 分页参数校验：page ≥ 1，1 ≤ pageSize ≤ 100（防负数/超大值触发数据库报错）
  const page = Math.max(1, parseInt(event.page, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(event.pageSize, 10) || 20))

  // 管理员身份必须从服务端 OPENID 判定，不能信任前端传参
  const { OPENID } = cloud.getWXContext()
  const isAdmin = isAdminOpenid(OPENID)

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

    // 并行取当前页与总数，供前端判断是否还有更多
    const [res, totalRes] = await Promise.all([
      db.collection('books')
        .where(query)
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get(),
      db.collection('books').where(query).count()
    ])

    return {
      success: true,
      data: res.data,
      total: totalRes.total,
      hasMore: page * pageSize < totalRes.total
    }
  } catch (err) {
    console.error('getBooks error:', err)
    return { success: false, msg: '获取列表失败' }
  }
}
