const cloud = require('wx-server-sdk')
const { isAdminOpenid, safeGetDoc } = require('./cloud-common')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 校验订单是否可被当前用户查看（用于聊天订单卡片跳转前拦截）
// 返回：{ success, canView, reason }
//   canView=true  允许跳转查看详情
//   canView=false 拦截，reason 说明原因：
//     'completed' 订单已完成
//     'invalid'   订单不存在 / 已取消 / 当前用户已逻辑删除 / 无读取权限
exports.main = async (event) => {
  const { orderId } = event
  const { OPENID } = cloud.getWXContext()

  if (!orderId) return { success: false, msg: '参数缺失' }

  try {
    const order = await safeGetDoc(db, 'orders', orderId)

    // 订单物理记录已不存在 → 失效
    if (!order) {
      return { success: true, canView: false, reason: 'invalid' }
    }

    const isAdmin = isAdminOpenid(OPENID)
    const isBuyer = order.buyerOpenId === OPENID

    // 既不是买家也不是管理员 → 无读取权限
    if (!isAdmin && !isBuyer) {
      return { success: true, canView: false, reason: 'invalid' }
    }

    // 当前用户是否已对该订单执行过逻辑删除（角色维度解耦）
    const selfDeleted = isAdmin
      ? order.adminDeleted === true
      : order.buyerDeleted === true
    if (selfDeleted) {
      return { success: true, canView: false, reason: 'invalid' }
    }

    // 订单大状态已完结
    if (order.status === 'completed') {
      return { success: true, canView: false, reason: 'completed' }
    }
    if (order.status === 'cancelled') {
      return { success: true, canView: false, reason: 'invalid' }
    }

    return { success: true, canView: true, reason: 'none' }
  } catch (err) {
    console.error('checkOrderAccess error:', err)
    return { success: false, msg: '校验失败' }
  }
}
