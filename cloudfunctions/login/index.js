const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 🌟 这里填入你的真实 OpenID（在云开发控制台数据库里随便找一条你自己的数据就能看到）
const ADMIN_OPENIDS = ['oBpJc7B-M09rkIGtZNQNn2CgHDN8'] 

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  return {
    openid: openid,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
    isAdmin: ADMIN_OPENIDS.includes(openid) // 告诉前端是不是管理员
  }
}