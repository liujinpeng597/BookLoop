// 全局业务常量（云端同名枚举位于 shared/cloud-common.js，修改需两侧同步）
const STATUS_MAP = {
  pending: '待交接',
  shipped: '配送中',
  completed: '交易完成',
  cancelled: '已取消'
}

const CATEGORY_LIST = ['教材', '考研', '文学', '生活', '其他']
const CONDITION_LIST = ['全新', '九成新', '八成新', '七成新']
const DEFAULT_PICKUP_ADDRESS = '西区七公寓512'
// 每本书配送费（元）：单本订单收 1 元，批量订单按本数累计
const DELIVERY_FEE_PER_BOOK = 1

module.exports = {
  STATUS_MAP,
  CATEGORY_LIST,
  CONDITION_LIST,
  DEFAULT_PICKUP_ADDRESS,
  DELIVERY_FEE_PER_BOOK
}
