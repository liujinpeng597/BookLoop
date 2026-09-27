const cloud = require('wx-server-sdk')
const { isAdminOpenid } = require('./cloud-common')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { chatId, limit, offset } = event
  const { OPENID } = cloud.getWXContext()

  if (!chatId) return { success: false, msg: '参数缺失' }

  const isAdmin = isAdminOpenid(OPENID)

  // 权限校验：用户只能看自己的聊天，管理员可以看所有人的
  if (!isAdmin && chatId !== OPENID) {
    return { success: false, msg: '无权查看' }
  }

  // 限制单次拉取数量并钳为合法区间（防负数/超大值触发数据库报错）
  const safeLimit = Math.max(1, Math.min(Number(limit) || 200, 500))
  const safeOffset = Math.max(0, Number(offset) || 0)

  try {
    // 按时间倒序取"最新 N 条"（offset 用于翻更早的历史），返回前再反转为正序渲染
    const res = await db.collection('chat_messages')
      .where({ chatId })
      .orderBy('createTime', 'desc')
      .skip(safeOffset)
      .limit(safeLimit)
      .get()
    const data = (res.data || []).reverse()

    // 管理员查看时，附上目标用户的昵称
    let targetNickName = ''
    if (isAdmin) {
      try {
        const userRes = await db.collection('users').where({ openid: chatId }).get()
        if (userRes.data && userRes.data.length > 0 && userRes.data[0].nickName) {
          targetNickName = userRes.data[0].nickName
        }
      } catch (e) { /* users 集合可能不存在 */ }
    }

    return { success: true, data, targetNickName }
  } catch (e) {
    console.error('getChatMessages error:', e)
    return { success: false, msg: '加载失败' }
  }
}
