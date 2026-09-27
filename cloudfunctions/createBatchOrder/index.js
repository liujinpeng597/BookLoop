const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

function genOrderNo() {
  return Date.now() + '' + Math.floor(Math.random() * 1000000000)
}

exports.main = async (event) => {
  const { items, deliveryType, buyerName, buyerPhone, address } = event
  const { OPENID } = cloud.getWXContext()

  if (!items || !Array.isArray(items) || items.length === 0) return { success: false, msg: '商品列表为空' }
  if (items.length > 20) return { success: false, msg: '单次最多购买20本书' }
  if (!buyerName || !buyerPhone) return { success: false, msg: '参数缺失' }
  if (!/^1[3-9]\d{9}$/.test(buyerPhone)) return { success: false, msg: '手机号格式不正确' }
  const nameStr = String(buyerName).trim().substring(0, 30)
  if (!nameStr) return { success: false, msg: '联系人姓名不能为空' }
  const addrStr = deliveryType === 'delivery'
    ? String(address || '').trim().substring(0, 200)
    : ''

  // bookId 去重与清洗（重复 ID 会造成重复计价与锁定失败）
  const bookIds = [...new Set(items.map(i => i && i.bookId).filter(Boolean))]
  if (bookIds.length === 0) return { success: false, msg: '商品列表为空' }

  // 条件释放：只把本单锁定（sold）的书放回在售，避免误释放他人订单的库存
  const releaseLocked = async (locked) => {
    for (const id of locked) {
      try {
        await db.collection('books').where({ _id: id, status: 'sold' }).update({
          data: { status: 'on_sale', updateTime: db.serverDate() }
        })
      } catch (e) { /* 释放失败不影响主流程 */ }
    }
  }

  // 记录已锁定的书籍，供失败时回滚
  const locked = []

  try {
    // 1. 原子锁：逐个抢占书籍
    for (const bookId of bookIds) {
      const res = await db.collection('books').where({
        _id: bookId,
        status: 'on_sale'
      }).update({
        data: { status: 'sold', updateTime: db.serverDate() }
      })
      if (res.stats.updated === 0) {
        await releaseLocked(locked)
        return { success: false, msg: '部分商品已被抢走或下架，请重新确认购物车' }
      }
      locked.push(bookId)
    }

    // 2. 读取所有书籍的真实信息（价格一律以服务端为准）
    const bookRecords = await db.collection('books').where({
      _id: db.command.in(locked)
    }).get()
    const bookMap = {}
    bookRecords.data.forEach(b => { bookMap[b._id] = b })

    // 查不到的书一律判失败回滚，绝不回退前端价格
    for (const id of locked) {
      if (!bookMap[id]) {
        await releaseLocked(locked)
        return { success: false, msg: '商品信息异常，下单已取消' }
      }
    }

    // 3. 构建订单 items
    const orderItems = locked.map(id => {
      const book = bookMap[id]
      return {
        bookId: id,
        title: book.title,
        coverUrl: book.coverUrl || '',
        price: book.price
      }
    })
    const totalPrice = orderItems.reduce((s, i) => s + Number(i.price), 0)
    // 批量订单按本数计配送费（每本 1 元）
    const deliveryFee = deliveryType === 'delivery' ? orderItems.length : 0

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
        isBatch: true,
        items: orderItems,
        totalPrice,
        deliveryFee,
        deliveryType: deliveryType || 'pickup',
        buyerName: nameStr,
        buyerPhone,
        address: addrStr,
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
    console.error('createBatchOrder error:', e)
    // 下单失败时释放所有已锁定的书籍，避免书籍被永久标记为已售出
    await releaseLocked(locked)
    return { success: false, msg: '下单失败' }
  }
}
