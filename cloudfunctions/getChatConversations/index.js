const cloud = require('wx-server-sdk')
const { isAdminOpenid } = require('./cloud-common')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const isAdmin = isAdminOpenid(OPENID)

  try {
    let query = db.collection('chat_messages').aggregate()

    // 管理员只看用户聊天，不看系统通知
    if (isAdmin) {
      query = query.match({ type: 'chat' })
    } else {
      // 非管理员只能看到与自己相关的会话：
      // 自己的聊天室(chatId=OPENID) 或 发给自己的系统通知(toOpenId=OPENID)
      query = query.match(db.command.or([
        { chatId: OPENID },
        { toOpenId: OPENID }
      ]))
    }

    const res = await query
      .group({
        _id: '$chatId',
        lastMsg: db.command.aggregate.last('$content'),
        lastDetail: db.command.aggregate.last('$detail'),
        lastTime: db.command.aggregate.last('$createTime'),
        msgType: db.command.aggregate.last('$type'),
        bookTitle: db.command.aggregate.last('$bookTitle'),
        orderStatus: db.command.aggregate.last('$orderStatus')
      })
      .sort({ lastTime: -1 })
      // 聚合查询存在默认返回条数上限（约 20 条），必须显式声明上限，否则会话列表会被静默截断
      .limit(100)
      .end()

    const list = res.list || []

    // 查询用户昵称：收集所有 chat 类型的 openid
    const openids = list
      .filter(item => item.msgType === 'chat' || !item.msgType)
      .map(item => item._id)
      .filter(Boolean)

    let nicknames = {}
    if (openids.length > 0) {
      try {
        const userRes = await db.collection('users').where({
          openid: db.command.in(openids)
        }).get()
        ;(userRes.data || []).forEach(u => {
          if (u.nickName) nicknames[u.openid] = u.nickName
        })
      } catch (e) {
        // users 集合可能尚不存在
      }
    }

    return { success: true, data: list, nicknames }
  } catch (e) {
    console.error('getChatConversations error:', e)
    return { success: false, msg: '加载失败' }
  }
}
