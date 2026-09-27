const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const ADMIN_OPENIDS = ['oBpJc7B-M09rkIGtZNQNn2CgHDN8']

exports.main = async (event) => {
  const { content, action } = event

  // get / list 不需要管理员权限，所有人都能看公告
  if (action === 'get' || action === 'list') {
    try {
      const res = await db.collection('announcements')
        .orderBy('createTime', 'desc')
        .limit(action === 'get' ? 1 : 10)
        .get()
      if (action === 'get') {
        return { success: true, data: (res.data && res.data[0]) || null }
      }
      return { success: true, data: res.data || [] }
    } catch (e) {
      return { success: true, data: action === 'get' ? null : [] }
    }
  }

  if (!ADMIN_OPENIDS.includes(cloud.getWXContext().OPENID)) {
    return { success: false, msg: '无权限' }
  }

  try {
    // 确保集合存在
    try { await db.createCollection('announcements') } catch (e) { /* 已存在 */ }

    if (action === 'delete') {
      const { id } = event
      await db.collection('announcements').doc(id).remove()
      return { success: true }
    }

    if (!content || !content.trim()) return { success: false, msg: '公告内容不能为空' }

    await db.collection('announcements').add({
      data: {
        content: content.trim(),
        createTime: db.serverDate()
      }
    })

    // 只保留最新 5 条，删除旧的
    const all = await db.collection('announcements')
      .orderBy('createTime', 'desc')
      .get()
    if (all.data.length > 5) {
      const toDelete = all.data.slice(5)
      for (const doc of toDelete) {
        await db.collection('announcements').doc(doc._id).remove()
      }
    }

    return { success: true }
  } catch (e) {
    return { success: false, msg: e.message || '发布失败' }
  }
}
