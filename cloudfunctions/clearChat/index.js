const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const ADMIN_OPENIDS = ['oBpJc7B-M09rkIGtZNQNn2CgHDN8']

// 清除指定会话(chatId)下的所有聊天消息
exports.main = async (event) => {
  const { chatId } = event
  const { OPENID } = cloud.getWXContext()

  if (!chatId) return { success: false, msg: '参数缺失' }

  const isAdmin = ADMIN_OPENIDS.includes(OPENID)
  // 普通用户只能清除自己的聊天，管理员可清除任意会话
  if (!isAdmin && chatId !== OPENID) return { success: false, msg: '无权操作' }

  try {
    // 分批删除：单次 remove 有数量上限，循环直到删完
    let totalRemoved = 0
    for (let i = 0; i < 100; i++) {
      const delRes = await db.collection('chat_messages').where({ chatId }).remove()
      const removed = (delRes.stats && delRes.stats.removed) || 0
      totalRemoved += removed
      if (removed === 0) break
    }
    return { success: true, removed: totalRemoved }
  } catch (err) {
    console.error('clearChat error:', err)
    return { success: false, msg: '清除失败' }
  }
}
