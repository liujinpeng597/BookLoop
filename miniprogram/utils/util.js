// 动态获取自定义导航栏高度信息，适配所有机型
const getNavBarInfo = () => {
  const sysInfo = wx.getWindowInfo()
  const menuButton = wx.getMenuButtonBoundingClientRect()
  return {
    navTop: menuButton.top,
    navHeight: menuButton.height + (menuButton.top - sysInfo.statusBarHeight) * 2,
    // 右上角胶囊按钮占位：胶囊左边缘到屏幕右边缘的距离 + 额外间隔，
    // 供自定义导航栏右侧按钮定位，避免与微信自带胶囊重叠
    navRight: (sysInfo.windowWidth - menuButton.right) + menuButton.width + 8
  }
}

// 书籍品相 → CSS 类名映射
const condToClass = (condition, fallback = 'badge-default') => {
  const map = {
    '全新': 'cond-quanxin',
    '九成新': 'cond-jiuchenxin',
    '八成新': 'cond-bachenxin',
    '七成新': 'cond-qichenxin'
  }
  return map[condition] || fallback
}

module.exports = { getNavBarInfo, condToClass }
