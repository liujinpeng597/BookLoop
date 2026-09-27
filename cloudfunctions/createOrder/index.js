const cloud = require('wx-server-sdk')
const { safeGetDoc, DEFAULT_PICKUP_ADDRESS } = require('./cloud-common')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 订单号：时间戳 + 9 位随机数，配合落库前查重
function genOrderNo() {
  return Date.now() + '' + Math.floor(Math.random() * 1000000000)
}

exports.main = async (event) => {
  const { bookId, deliveryType, buyerName, buyerPhone, address } = event
  const { OPENID } = cloud.getWXContext()

  // 基础参数校验
  if (!bookId || !buyerName || !buyerPhone) {
    return { success: false, msg: '参数缺失' }
  }
  if (!/^1[3-9]\d{9}$/.test(buyerPhone)) {
    return { success: false, msg: '手机号格式不正确' }
  }
  const nameStr = String(buyerName).trim().substring(0, 30)
  if (!nameStr) return { success: false, msg: '联系人姓名不能为空' }

  try {
    // 0. 先确认书籍存在（给出准确报错而非笼统的"系统繁忙"）
    const book = await safeGetDoc(db, 'books', bookId)
    if (!book) return { success: false, msg: '书籍不存在' }

    // 1. 原子操作锁：尝试抢占这本书
    const updateRes = await db.collection('books').where({
      _id: bookId,
      status: 'on_sale'
    }).update({
      data: { status: 'sold', updateTime: db.serverDate() }
    })

    if (updateRes.stats.updated === 0) {
      return { success: false, msg: '手慢了，书籍已被抢走或下架！' }
    }

    // 2. 生成订单，价格与书籍信息一律以服务端数据为准
    // 单书订单：送货时收取每本 1 元运费，自提免费
    const deliveryFee = deliveryType === 'delivery' ? 1 : 0
    // 自提订单把取货地址写入 address，方便订单详情展示
    const finalAddr = deliveryType === 'delivery'
      ? String(address || '').trim().substring(0, 200)
      : String(book.pickupAddress || DEFAULT_PICKUP_ADDRESS).substring(0, 100)

    let orderNo = ''
    for (let i = 0; i < 3; i++) {
      const candidate = genOrderNo()
      const dup = await db.collection('orders').where({ orderNo: candidate }).count()
      if (dup.total === 0) { orderNo = candidate; break }
    }
    if (!orderNo) orderNo = genOrderNo()

    const orderRes = await db.collection('orders').add({
      data: {
        orderNo,
        bookId,
        bookTitle: book.title,
        bookCover: book.coverUrl || '',
        price: book.price,
        deliveryType: deliveryType || 'pickup',
        deliveryFee,
        buyerName: nameStr,
        buyerPhone,
        address: finalAddr,
        buyerOpenId: OPENID,
        status: 'pending',
        paid: false,
        paidTime: null,
        paymentMethod: '',
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
    })

    return { success: true, orderId: orderRes._id }
  } catch (err) {
    console.error('createOrder error:', err)
    // 下单异常时尝试回滚书籍状态（条件更新，避免误释放他人已锁定的书）
    if (bookId) {
      try {
        await db.collection('books').where({ _id: bookId, status: 'sold' }).update({
          data: { status: 'on_sale', updateTime: db.serverDate() }
        })
      } catch (e) { /* 回滚失败也不影响返回 */ }
    }
    return { success: false, msg: '下单系统繁忙' }
  }
}
