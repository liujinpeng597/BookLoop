const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const ADMIN_OPENIDS = ['oBpJc7B-M09rkIGtZNQNn2CgHDN8']

// 允许修改的配置键白名单，防止写入未知配置
const ALLOWED_KEYS = ['paymentQrcode']

exports.main = async (event) => {
  const { key, value } = event

  // 只有管理员可以修改配置
  if (!ADMIN_OPENIDS.includes(cloud.getWXContext().OPENID)) {
    return { success: false, msg: '无权限' }
  }

  if (!key) return { success: false, msg: '缺少 key' }
  if (!ALLOWED_KEYS.includes(key)) return { success: false, msg: '不允许修改该配置' }

  try {
    // 在云函数端用服务端 SDK 创建集合（小程序端无此 API）
    try {
      await db.createCollection('settings')
      console.log('settings 集合已创建')
    } catch (e) {
      // 集合已存在时报错，忽略
      if (!e.message || !e.message.includes('exist')) {
        console.log('createCollection 结果:', e.message)
      }
    }

    // 查找是否已有该 key 的文档
    let docId = null
    const res = await db.collection('settings').where({ key }).get()
    if (res.data && res.data.length > 0) {
      docId = res.data[0]._id
    }

    if (docId) {
      await db.collection('settings').doc(docId).update({
        data: { value, updateTime: db.serverDate() }
      })
    } else {
      await db.collection('settings').add({
        data: { key, value, updateTime: db.serverDate() }
      })
    }

    return { success: true }
  } catch (err) {
    console.error('saveSetting error:', err)
    return { success: false, msg: err.message }
  }
}
