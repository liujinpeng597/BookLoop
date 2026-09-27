const cloud = require('wx-server-sdk')
const { isAdminOpenid, CATEGORIES, CONDITIONS } = require('./cloud-common')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!isAdminOpenid(OPENID)) return { success: false, msg: '无权限' }

  const { bookId, ...updateData } = event
  if (!bookId) return { success: false, msg: '缺少书籍ID' }

  // 字段白名单：只允许更新以下字段
  const allowed = ['title', 'author', 'isbn', 'price', 'originalPrice', 'condition', 'category', 'coverUrl', 'description', 'status', 'pickupAddress']
  const data = { updateTime: db.serverDate() }
  allowed.forEach(key => { if (updateData[key] !== undefined) data[key] = updateData[key] })

  // 状态白名单，防止写入非法状态值
  if (data.status !== undefined && !['on_sale', 'removed', 'sold'].includes(data.status)) {
    return { success: false, msg: '无效的书籍状态' }
  }
  // 价格必须为大于 0 的有限数字（NaN 会被 !(x > 0) 正确拒绝）
  if (data.price !== undefined) {
    data.price = Number(data.price)
    if (!Number.isFinite(data.price) || !(data.price > 0)) return { success: false, msg: '价格必须为大于0的数字' }
  }
  if (data.originalPrice !== undefined) {
    data.originalPrice = Number(data.originalPrice) || 0
    if (!Number.isFinite(data.originalPrice) || data.originalPrice < 0) return { success: false, msg: '原价格式不正确' }
  }
  if (data.condition !== undefined && !CONDITIONS.includes(data.condition)) return { success: false, msg: '无效的成色' }
  if (data.category !== undefined && !CATEGORIES.includes(data.category)) return { success: false, msg: '无效的分类' }
  if (data.title !== undefined) {
    data.title = String(data.title).trim().substring(0, 200)
    if (!data.title) return { success: false, msg: '书名不能为空' }
  }
  if (data.description !== undefined) data.description = String(data.description).substring(0, 1000)
  if (data.pickupAddress !== undefined) data.pickupAddress = String(data.pickupAddress).substring(0, 100)
  if (data.coverUrl !== undefined) data.coverUrl = String(data.coverUrl).substring(0, 500)

  // 原子状态锁：下架要求当前在售；重新上架要求当前已下架
  let query = { _id: bookId }
  if (data.status === 'removed') query.status = 'on_sale'
  if (data.status === 'on_sale') query.status = 'removed'

  try {
    const res = await db.collection('books').where(query).update({ data })

    // 更新 0 条说明状态不对（比如已被买走）或书籍不存在
    if (res.stats.updated === 0) {
      return { success: false, msg: data.status ? '操作失败，该书状态已改变！' : '更新失败' }
    }
    return { success: true }
  } catch (err) {
    console.error('editBook error:', err)
    return { success: false, msg: '更新失败' }
  }
}
