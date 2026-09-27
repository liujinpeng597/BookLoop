const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const ADMIN_OPENIDS = ['oBpJc7B-M09rkIGtZNQNn2CgHDN8'] // 替换为你的真实 Admin OpenID

exports.main = async (event) => {
  if (!ADMIN_OPENIDS.includes(cloud.getWXContext().OPENID)) return { success: false, msg: '无权限' }

  const { title, author, isbn, price, originalPrice, condition, category, coverUrl, description, pickupAddress } = event
  if (!title || !price) return { success: false, msg: '必填项缺失' }
  if (Number(price) <= 0) return { success: false, msg: '价格必须大于0' }
  if (title.length > 200) return { success: false, msg: '书名过长' }

  try {
    const res = await db.collection('books').add({
      data: {
        title, author: author || '', isbn: isbn || '',
        price: Number(price), originalPrice: Number(originalPrice) || 0,
        condition, category, coverUrl: coverUrl || '',
        description: description || '', pickupAddress: pickupAddress || '西区七公寓512',
        status: 'on_sale', views: 0, likes: 0,
        createTime: db.serverDate(), updateTime: db.serverDate()
      }
    })
    return { success: true, id: res._id }
  } catch (err) {
    return { success: false, msg: '写入失败' }
  }
}