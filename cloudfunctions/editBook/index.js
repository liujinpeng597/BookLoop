const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const ADMIN_OPENIDS = ['oBpJc7B-M09rkIGtZNQNn2CgHDN8'] 

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!ADMIN_OPENIDS.includes(OPENID)) return { success: false, msg: '无权限' }

  const { bookId, ...updateData } = event
  const allowed = ['title', 'author', 'isbn', 'price', 'originalPrice', 'condition', 'category', 'coverUrl', 'description', 'status', 'pickupAddress']
  const data = { updateTime: db.serverDate() }
  allowed.forEach(key => { if (updateData[key] !== undefined) data[key] = updateData[key] })

  // 状态白名单校验，防止写入非法状态值
  if (data.status !== undefined && !['on_sale', 'removed', 'sold'].includes(data.status)) {
    return { success: false, msg: '无效的书籍状态' }
  }
  // 价格必须是大于 0 的数字
  if (data.price !== undefined) {
    data.price = Number(data.price)
    if (!(data.price > 0)) return { success: false, msg: '价格必须大于0' }
  }

  // 原子操作锁：管理员下架/上架也必须校验当前状态
  let query = { _id: bookId }
  if (data.status === 'removed') query.status = 'on_sale' 
  if (data.status === 'on_sale') query.status = 'removed' 

  try {
    const res = await db.collection('books').where(query).update({ data })
    
    // 如果修改失败，说明状态不对（比如已经被买走了）
    if (res.stats.updated === 0) {
      return { success: false, msg: data.status ? '操作失败，该书状态已改变！' : '更新失败' }
    }
    return { success: true }
  } catch(err) { 
    return { success: false, msg: '更新失败' }
  }
}