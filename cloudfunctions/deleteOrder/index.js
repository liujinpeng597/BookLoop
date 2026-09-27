const cloud = require('wx-server-sdk')
const { isAdminOpenid, safeGetDoc } = require('./cloud-common')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { orderId, deleteRole } = event
  const { OPENID } = cloud.getWXContext()

  if (!orderId || !deleteRole) return { success: false, msg: '参数缺失' }

  try {
    const order = await safeGetDoc(db, 'orders', orderId)
    if (!order) return { success: false, msg: '订单不存在' }

    const isAdmin = isAdminOpenid(OPENID)
    const isBuyer = order.buyerOpenId === OPENID

    // 鉴权：严格校验操作身份
    let flagField
    if (deleteRole === 'admin') {
      if (!isAdmin) return { success: false, msg: '无权作为管理员删除' }
      flagField = 'adminDeleted'
    } else if (deleteRole === 'buyer') {
      if (!isBuyer) return { success: false, msg: '无权作为买家删除' }
      // 提示：待处理订单请走"取消订单"（会释放库存），逻辑删除仅用于清理历史记录
      flagField = 'buyerDeleted'
    } else {
      return { success: false, msg: '无效的操作角色' }
    }

    // 逻辑删除：仅标记当前角色的删除状态，绝不物理删除底层记录。
    // 买家与卖家/管理员各自独立、互不影响，保证其他端仍可正常读取。
    await db.collection('orders').where({
      _id: orderId,
      [flagField]: db.command.neq(true)
    }).update({
      data: { [flagField]: true, updateTime: db.serverDate() }
    })

    // updated === 0 说明该角色已标记过（幂等），同样视为成功
    return { success: true, msg: '删除成功' }
  } catch (err) {
    console.error('deleteOrder error:', err)
    return { success: false, msg: '删除失败，请稍后重试' }
  }
}
