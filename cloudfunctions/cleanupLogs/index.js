const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 定时触发（见 config.json 的 timer 触发器，每日凌晨 4 点）：
// 清理 7 天前的浏览日志。view_logs 只服务于"10 分钟内去重计数"，历史数据无保留价值。
exports.main = async () => {
  const deadline = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  let removed = 0

  try {
    // 分批删除：单次 remove 有数量上限，循环直到删完
    for (let i = 0; i < 100; i++) {
      const res = await db.collection('view_logs').where({
        viewTime: _.lt(deadline)
      }).remove()
      const n = (res.stats && res.stats.removed) || 0
      removed += n
      if (n === 0) break
    }
    return { success: true, removed }
  } catch (e) {
    // 集合不存在（尚无任何浏览记录）视为正常
    const msg = String((e && (e.errMsg || e.message)) || '')
    if (/not exist/i.test(msg)) return { success: true, removed: 0 }
    console.error('cleanupLogs error:', e)
    return { success: false, msg: '清理失败' }
  }
}
