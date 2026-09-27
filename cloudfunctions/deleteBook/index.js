const cloud = require('wx-server-sdk')
const { isAdminOpenid, safeGetDoc } = require('./cloud-common')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  if (!isAdminOpenid(cloud.getWXContext().OPENID)) return { success: false, msg: '无权限' }

  const { bookId, permanent } = event
  if (!bookId) return { success: false, msg: '缺少书籍ID' }

  try {
    if (permanent) {
      // 彻底删除（书籍记录不存在时 doc.remove 也按成功处理）
      await db.collection('books').doc(bookId).remove()
      return { success: true, msg: '已彻底删除' }
    }

    const book = await safeGetDoc(db, 'books', bookId)
    if (!book) return { success: false, msg: '书籍不存在' }

    await db.collection('books').doc(bookId).update({
      data: { status: 'removed', updateTime: db.serverDate() }
    })
    return { success: true, msg: '下架成功' }
  } catch (err) {
    console.error('deleteBook error:', err)
    return { success: false, msg: '操作失败' }
  }
}
