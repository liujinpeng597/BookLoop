const cloud = require('wx-server-sdk')
const { isAdminOpenid } = require('./cloud-common')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async () => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  return {
    openid: openid,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
    isAdmin: isAdminOpenid(openid) // 告诉前端是不是管理员
  }
}
