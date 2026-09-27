const cloud = require('wx-server-sdk')
const { isAdminOpenid } = require('./cloud-common')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

/**
 * 统计当前用户的时间戳 since 之后的未读消息数（tabBar 角标用）。
 * 已读水位由前端本地存储维护（chat_read_ts），进入消息页/聊天页时刷新。
 * 支持已读机制跨设备不同步（校园场景单设备为主），换取零集合改动。
 */
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { success: false, msg: '登录状态异常' }

  // since 缺失视为刚安装（无历史未读），避免首次进入弹出全量角标
  const since = Number(event.since)
  const sinceDate = Number.isFinite(since) && since > 0 ? new Date(since) : new Date()

  try {
    // 与当前用户相关的三类消息：
    // 1. 系统通知（toOpenId = 我）
    // 2. 我的客服会话里别人发的（chatId = 我，含 chat / order_share）
    // 3. 管理员视角：任意买家会话里买家发来的聊天
    const cond = _.or([
      { toOpenId: OPENID },
      { chatId: OPENID, fromOpenId: _.neq(OPENID) },
      { type: 'chat', fromOpenId: _.neq(OPENID), chatId: _.neq(OPENID) }
    ]).and({ createTime: _.gt(sinceDate) })

    const res = await db.collection('chat_messages').where(cond).count()
    return { success: true, count: res.total || 0 }
  } catch (e) {
    console.error('getUnreadCount error:', e)
    return { success: false, msg: '查询失败' }
  }
}
