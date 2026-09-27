const cloud = require('wx-server-sdk')
const { isAdminOpenid } = require('./cloud-common')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { statusFilter } = event
  const { OPENID } = cloud.getWXContext()

  // 管理员身份必须从服务端 OPENID 判定，不能信任前端传参
  const isAdmin = isAdminOpenid(OPENID)

  // 分页参数校验（修复无分页导致订单破百后被静默截断的问题）
  const page = Math.max(1, parseInt(event.page, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(event.pageSize, 10) || 20))

  let query = {}

  if (isAdmin) {
    query.adminDeleted = _.neq(true)

    if (statusFilter && statusFilter !== '全部') {
      query.status = statusFilter
    }
  } else {
    query.buyerOpenId = OPENID
    query.buyerDeleted = _.neq(true)
  }

  try {
    // 并行取当前页与总数，供前端翻页
    const [res, totalRes] = await Promise.all([
      db.collection('orders')
        .where(query)
        .orderBy('createTime', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get(),
      db.collection('orders').where(query).count()
    ])

    return {
      success: true,
      data: res.data,
      total: totalRes.total,
      hasMore: page * pageSize < totalRes.total
    }
  } catch (err) {
    console.error('getOrders error:', err)
    return { success: false, msg: '获取订单失败' }
  }
}
