const cloud = require('wx-server-sdk')
const { safeGetDoc } = require('./cloud-common')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  try {
    const { bookId } = event
    const { OPENID } = cloud.getWXContext()

    if (!bookId) return { success: false, msg: '参数错误' }

    // 展示字段（书名/价格/封面等）一律从服务端回读，不信任前端传参
    const book = await safeGetDoc(db, 'books', bookId)
    if (!book) return { success: false, msg: '书籍不存在' }
    if (book.status !== 'on_sale') return { success: false, msg: '该书籍已售出或已下架' }

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
      .count()
    if (exist.total > 0) {
      return { success: false, msg: '购物车已有此书' }
    }

    await db.collection('cart').add({
      data: {
        buyerOpenId: OPENID,
        bookId,
        title: String(book.title || '').substring(0, 100),
        coverUrl: String(book.coverUrl || '').substring(0, 500),
        price: book.price,
        condition: book.condition || '',
        pickupAddress: book.pickupAddress || '',
        createTime: db.serverDate()
      }
    })

    return { success: true }
  } catch (e) {
    console.error('addToCart error:', e)
    return { success: false, msg: '加入购物车失败' }
  }
}
