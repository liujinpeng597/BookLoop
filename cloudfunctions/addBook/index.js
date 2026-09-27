const cloud = require('wx-server-sdk')
const { isAdminOpenid, CATEGORIES, CONDITIONS, DEFAULT_PICKUP_ADDRESS } = require('./cloud-common')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  if (!isAdminOpenid(cloud.getWXContext().OPENID)) return { success: false, msg: '无权限' }

  const { title, author, isbn, price, originalPrice, condition, category, coverUrl, description, pickupAddress } = event
  if (!title || !price) return { success: false, msg: '必填项缺失' }

  const titleStr = String(title).trim()
  if (!titleStr) return { success: false, msg: '书名不能为空' }
  if (titleStr.length > 200) return { success: false, msg: '书名过长' }

  // 价格校验：必须为有限数字且大于 0（Number("abc") = NaN 会绕过 "<= 0" 判断，务必用 isFinite）
  const p = Number(price)
  if (!Number.isFinite(p) || p <= 0) return { success: false, msg: '价格必须为大于0的数字' }
  const op = Number(originalPrice) || 0
  if (!Number.isFinite(op) || op < 0) return { success: false, msg: '原价格式不正确' }

  // 枚举白名单校验：脏数据会导致首页分类筛选取不到（书籍"消失"）
  if (condition !== undefined && !CONDITIONS.includes(condition)) return { success: false, msg: '无效的成色' }
  if (category !== undefined && !CATEGORIES.includes(category)) return { success: false, msg: '无效的分类' }

  try {
    const res = await db.collection('books').add({
      data: {
        title: titleStr,
        author: String(author || '').substring(0, 100),
        isbn: String(isbn || '').substring(0, 20),
        price: p,
        originalPrice: op,
        condition: condition || '八成新',
        category: category || '其他',
        coverUrl: String(coverUrl || '').substring(0, 500),
        description: String(description || '').substring(0, 1000),
        pickupAddress: String(pickupAddress || DEFAULT_PICKUP_ADDRESS).substring(0, 100),
        status: 'on_sale', views: 0, likes: 0,
        createTime: db.serverDate(), updateTime: db.serverDate()
      }
    })
    return { success: true, id: res._id }
  } catch (err) {
    console.error('addBook error:', err)
    return { success: false, msg: '写入失败' }
  }
}
