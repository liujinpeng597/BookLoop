const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const ADMIN_OPENIDS = ['oBpJc7B-M09rkIGtZNQNn2CgHDN8']

exports.main = async (event, context) => {
  const { statusFilter } = event
  const { OPENID } = cloud.getWXContext()

  // 管理员身份必须从服务端 OPENID 判定，不能信任前端传参
  const isAdmin = ADMIN_OPENIDS.includes(OPENID)

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
    const res = await db.collection('orders')
      .where(query)
      .orderBy('createTime', 'desc')
      .get()
      
    return { success: true, data: res.data }
  } catch (err) {
    return { success: false, msg: '获取订单失败' }
  }
}