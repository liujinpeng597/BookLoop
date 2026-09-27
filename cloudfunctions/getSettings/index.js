const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 允许匿名读取的配置键白名单（新增敏感配置时切勿加入此列表）
const PUBLIC_KEYS = ['paymentQrcode']

exports.main = async (event) => {
  const { key } = event
  if (!key) return { success: false, msg: '缺少 key' }
  if (!PUBLIC_KEYS.includes(key)) return { success: false, msg: '无效配置' }

  try {
    const res = await db.collection('settings').where({ key }).get()
    if (res.data && res.data.length > 0) {
      const doc = res.data[0]
      let value = doc.value

      // 如果值是 cloud:// 文件ID，在云函数端转为临时HTTPS链接
      // 云函数有完整存储权限，避免小程序端权限不足的问题
      if (typeof value === 'string' && value.startsWith('cloud://')) {
        try {
          const tempRes = await cloud.getTempFileURL({ fileList: [value] })
          if (tempRes.fileList && tempRes.fileList.length > 0 && tempRes.fileList[0].tempFileURL) {
            value = tempRes.fileList[0].tempFileURL
          }
        } catch (e) {
          console.error('getTempFileURL 转换失败:', e)
        }
      }

      return { success: true, data: { ...doc, value } }
    }
    return { success: true, data: null }
  } catch (err) {
    // 集合不存在视为未配置；其余错误如实返回失败
    const msg = String((err && (err.errMsg || err.message)) || '')
    if (/not exist/i.test(msg)) {
      try { await db.createCollection('settings') } catch (_) { /* 已存在 */ }
      return { success: true, data: null }
    }
    console.error('getSettings error:', err)
    return { success: false, msg: '配置读取失败' }
  }
}
