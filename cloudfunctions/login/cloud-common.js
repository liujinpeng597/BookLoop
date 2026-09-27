/**
 * 云函数公共模块：管理员白名单 + 通用工具 + 业务枚举
 *
 * ⚠️ 各云函数目录下的 cloud-common.js 是本文件的同步副本（由 scripts/sync-shared.js 生成）。
 *    修改管理员名单或枚举时：编辑本文件 → 运行 `node scripts/sync-shared.js` → 重新部署云函数。
 */
const ADMIN_OPENIDS = ['oBpJc7B-M09rkIGtZNN2CgHDN8'] // 管理员 OpenID 白名单（唯一维护点）

function isAdminOpenid(openid) {
  return !!openid && ADMIN_OPENIDS.includes(openid)
}

/**
 * 安全读取单个文档。
 * wx-server-sdk 的 doc().get() 在文档不存在或 ID 非法时会直接抛错（而不是返回空），
 * 该封装把这类情况归一化为返回 null，使业务代码的 if (!doc) 分支真正可达。
 */
async function safeGetDoc(db, collection, id) {
  if (!id || typeof id !== 'string') return null
  try {
    const res = await db.collection(collection).doc(id).get()
    return res.data || null
  } catch (err) {
    const msg = String((err && (err.errMsg || err.message)) || '')
    if (/not exist|invalid|DOCUMENT/i.test(msg)) return null
    throw err
  }
}

// 业务枚举（与 miniprogram/utils/constants.js 保持同步，修改需两侧同步）
const CATEGORIES = ['教材', '考研', '文学', '生活', '其他']
const CONDITIONS = ['全新', '九成新', '八成新', '七成新']
const DEFAULT_PICKUP_ADDRESS = '西区七公寓512'

module.exports = {
  ADMIN_OPENIDS,
  isAdminOpenid,
  safeGetDoc,
  CATEGORIES,
  CONDITIONS,
  DEFAULT_PICKUP_ADDRESS
}
