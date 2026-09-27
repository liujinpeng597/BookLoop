const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { key } = event
  if (!key) return { success: false, msg: '缺少 key' }

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
          console.log('getTempFileURL 转换失败，返回原始值:', e.message)
        }
      }

      return { success: true, data: { ...doc, value } }
    }
    return { success: true, data: null }
  } catch (err) {
    console.log('getSettings 查询失败:', err.message)
    return { success: true, data: null }
  }
}
