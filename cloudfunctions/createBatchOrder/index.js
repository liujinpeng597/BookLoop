const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { items, deliveryType, buyerName, buyerPhone, address } = event
  const { OPENID } = cloud.getWXContext()

  if (!items || items.length === 0) return { success: false, msg: '商品列表为空' }
  if (items.length > 20) return { success: false, msg: '单次最多购买20本书' }
  if (!buyerName || !buyerPhone) return { success: false, msg: '参数缺失' }
  if (!/^1[3-9]\d{9}$/.test(buyerPhone)) return { success: false, msg: '手机号格式不正确' }

  // 记录已锁定的书籍，供失败时回滚
  const locked = []

  try {
    // 1. 原子锁：逐个抢占书籍
    for (const item of items) {
      const res = await db.collection('books').where({
        _id: item.bookId,
        status: 'on_sale'
      }).update({
        data: { status: 'sold', updateTime: db.serverDate() }
      })
      if (res.stats.updated === 0) {
        // 回滚已锁定的书
        for (const id of locked) {
          await db.collection('books').doc(id).update({
            data: { status: 'on_sale', updateTime: db.serverDate() }
          })
        }
        return { success: false, msg: `《${item.title}》已被抢走或下架` }
      }
      locked.push(item.bookId)
    }

    // 2. 读取所有书籍的真实信息（价格以服务端为准）
    const bookRecords = await db.collection('books').where({
      _id: db.command.in(locked)
    }).get()
    const bookMap = {}
    bookRecords.data.forEach(b => { bookMap[b._id] = b })

    // 3. 构建订单 items，价格从服务端读取
    const orderItems = items.map(i => {
      const book = bookMap[i.bookId]
      return {
        bookId: i.bookId,
        title: book ? book.title : i.title,
        coverUrl: book ? (book.coverUrl || '') : (i.coverUrl || ''),
        price: book ? book.price : Number(i.price)
      }
    })
    const totalPrice = orderItems.reduce((s, i) => s + Number(i.price), 0)
    const deliveryFee = deliveryType === 'delivery' ? orderItems.length : 0

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
        isBatch: true,
        items: orderItems,
        totalPrice,
        deliveryFee,
        deliveryType: deliveryType || 'pickup',
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

    // 4. 清空购物车中对应商品
    const bookIds = items.map(i => i.bookId)
    try {
      await db.collection('cart').where({
        buyerOpenId: OPENID,
        bookId: db.command.in(bookIds)
      }).remove()
    } catch (e) {
      // 清购物车失败不影响订单
    }

    return { success: true, orderNo, orderId: orderRes._id }
  } catch (e) {
    // 下单失败时释放所有已锁定的书籍，避免书籍被永久标记为已售出
    for (const id of locked) {
      try {
        await db.collection('books').doc(id).update({
          data: { status: 'on_sale', updateTime: db.serverDate() }
        })
      } catch (rollbackErr) { /* 释放失败不影响主流程 */ }
    }
    return { success: false, msg: e.message || '下单失败' }
  }
}
