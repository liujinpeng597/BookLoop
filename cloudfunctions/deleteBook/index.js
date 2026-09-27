const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const ADMIN_OPENIDS = ['oBpJc7B-M09rkIGtZNQNn2CgHDN8']

exports.main = async (event) => {
  if (!ADMIN_OPENIDS.includes(cloud.getWXContext().OPENID)) return { success: false, msg: '无权限' }

  const { bookId, permanent } = event
  if (!bookId) return { success: false, msg: '缺少书籍ID' }

  try {
    if (permanent) {
      await db.collection('books').doc(bookId).remove()
      return { success: true, msg: '已彻底删除' }
    }

    const bookRes = await db.collection('books').doc(bookId).get()
    if (!bookRes.data) return { success: false, msg: '书籍不存在' }

    await db.collection('books').doc(bookId).update({
      data: { status: 'removed', updateTime: db.serverDate() }
    })
    return { success: true, msg: '下架成功' }
  } catch (err) {
    console.error('deleteBook error:', err)
    return { success: false, msg: '操作失败' }
  }
}