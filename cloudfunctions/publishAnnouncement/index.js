const cloud = require('wx-server-sdk')
const { isAdminOpenid } = require('./cloud-common')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const MAX_CONTENT_LEN = 500

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
      // 集合不存在视为无公告；其余错误如实返回失败（而非伪装成空数据）
      const msg = String((e && (e.errMsg || e.message)) || '')
      if (/not exist/i.test(msg)) {
        try { await db.createCollection('announcements') } catch (_) { /* 已存在 */ }
        return { success: true, data: action === 'get' ? null : [] }
      }
      console.error('publishAnnouncement query error:', e)
      return { success: false, msg: '公告加载失败' }
    }
  }

  if (!isAdminOpenid(cloud.getWXContext().OPENID)) {
    return { success: false, msg: '无权限' }
  }

  try {
    // 确保集合存在
    try { await db.createCollection('announcements') } catch (e) { /* 已存在 */ }

    if (action === 'delete') {
      const { id } = event
      if (!id) return { success: false, msg: '缺少公告ID' }
      await db.collection('announcements').doc(id).remove()
      return { success: true }
    }

    if (!content || !String(content).trim()) return { success: false, msg: '公告内容不能为空' }
    const text = String(content).trim().substring(0, MAX_CONTENT_LEN)

    await db.collection('announcements').add({
      data: {
        content: text,
        createTime: db.serverDate()
      }
    })

    // 只保留最新 5 条，删除旧的
    const all = await db.collection('announcements')
      .orderBy('createTime', 'desc')
      .limit(10)
      .get()
    if (all.data.length > 5) {
      const toDelete = all.data.slice(5)
      for (const doc of toDelete) {
        await db.collection('announcements').doc(doc._id).remove()
      }
    }

    return { success: true }
  } catch (e) {
    console.error('publishAnnouncement error:', e)
    return { success: false, msg: '发布失败' }
  }
}
