const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { nickName, avatarUrl } = event
  const { OPENID } = cloud.getWXContext()

  if (!OPENID) return { success: false, msg: '未登录' }

  const data = { updateTime: db.serverDate() }
  if (nickName !== undefined) data.nickName = String(nickName).trim().substring(0, 30)
  // 限制头像地址长度，避免写入超长字符串
  if (avatarUrl !== undefined) data.avatarUrl = String(avatarUrl).substring(0, 500)

  if (!data.nickName && !data.avatarUrl) {
    return { success: false, msg: '无数据需要更新' }
  }

  try {
    // 确保集合存在
    try { await db.createCollection('users') } catch (e) { /* 已存在 */ }

    // 以 OPENID 作为文档 _id 天然防并发重复（同一用户只会有一条记录）
    try {
      await db.collection('users').add({
        data: { _id: OPENID, openid: OPENID, ...data, createTime: db.serverDate() }
      })
    } catch (e) {
      // _id 已存在（记录已建）→ 走更新
      await db.collection('users').doc(OPENID).update({ data })
    }

    return { success: true }
  } catch (e) {
    console.error('saveUserProfile error:', e)
    return { success: false, msg: '保存失败' }
  }
}
