const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

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

  try {
    // 1. 原子操作锁：尝试抢占这本书（价格从服务端读取，不信任前端传参）
    const updateRes = await db.collection('books').where({
      _id: bookId,
      status: 'on_sale'
    }).update({
      data: { status: 'sold', updateTime: db.serverDate() }
    })

    if (updateRes.stats.updated === 0) {
      return { success: false, msg: '手慢了，书籍已被抢走或下架！' }
    }

    // 2. 重新读取书籍信息获取真实价格
    const bookRes = await db.collection('books').doc(bookId).get()
    const book = bookRes.data
    if (!book) {
      // 极端情况回滚
      await db.collection('books').doc(bookId).update({
        data: { status: 'on_sale', updateTime: db.serverDate() }
      })
      return { success: false, msg: '书籍信息异常' }
    }

    // 3. 生成订单，价格以服务端数据为准
    // 单书订单：送货时收取 1 元运费，自提免费
    const deliveryFee = deliveryType === 'delivery' ? 1 : 0
    // 生成订单号并查重，避免并发下订单号碰撞
    let orderNo = ''
    for (let i = 0; i < 3; i++) {
      const candidate = Date.now() + '' + Math.floor(Math.random() * 1000000)
      const dup = await db.collection('orders').where({ orderNo: candidate }).count()
      if (dup.total === 0) { orderNo = candidate; break }
    }
    if (!orderNo) orderNo = Date.now() + '' + Math.floor(Math.random() * 1000000)
    const orderRes = await db.collection('orders').add({
      data: {
        orderNo,
        bookId,
        bookTitle: book.title,
        bookCover: book.coverUrl || '',
        price: book.price,
        deliveryType: deliveryType || 'pickup',
        deliveryFee,
        buyerName,
        buyerPhone,
        address: address || '',
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
    // 下单异常时尝试回滚书籍状态
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