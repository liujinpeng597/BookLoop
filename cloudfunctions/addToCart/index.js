const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  try {
    const { bookId, title, coverUrl, price, condition, pickupAddress } = event
    const { OPENID } = cloud.getWXContext()

    if (!bookId) return { success: false, msg: '参数错误' }

    // 购物车上限 30 本，防止恶意囤积
    const countRes = await db.collection('cart')
      .where({ buyerOpenId: OPENID })
      .count()
    if (countRes.total >= 30) {
      return { success: false, msg: '购物车已满，请先清理' }
    }

    // 检查是否已在购物车中
    const exist = await db.collection('cart')
      .where({ buyerOpenId: OPENID, bookId })
      .get()
    if (exist.data && exist.data.length > 0) {
      return { success: false, msg: '购物车已有此书' }
    }

    await db.collection('cart').add({
      data: {
        buyerOpenId: OPENID,
        bookId,
        title: (title || '').substring(0, 100),
        coverUrl: coverUrl || '',
        price,
        condition: condition || '',
        pickupAddress: pickupAddress || '',
        createTime: new Date()
      }
    })

    return { success: true }
  } catch (e) {
    return { success: false, msg: e.message || '加入购物车失败' }
  }
}
