const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const ADMIN_OPENIDS = ['oBpJc7B-M09rkIGtZNQNn2CgHDN8']

exports.main = async (event) => {
  const { chatId, limit = 200, offset = 0 } = event
  const { OPENID } = cloud.getWXContext()

  if (!chatId) return { success: false, msg: '参数缺失' }

  const isAdmin = ADMIN_OPENIDS.includes(OPENID)

  // 权限校验：用户只能看自己的聊天，管理员可以看所有人的
  if (!isAdmin && chatId !== OPENID) {
    return { success: false, msg: '无权查看' }
  }

  // 限制单次拉取数量，防止恶意请求拉取海量数据
  const safeLimit = Math.min(Number(limit) || 200, 500)

  try {
    const res = await db.collection('chat_messages')
      .where({ chatId })
      .orderBy('createTime', 'asc')
      .skip(Number(offset) || 0)
      .limit(safeLimit)
      .get()

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

    return { success: true, data: res.data || [], targetNickName }
  } catch (e) {
    return { success: false, msg: '加载失败' }
  }
}
