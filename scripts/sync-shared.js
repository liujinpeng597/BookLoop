#!/usr/bin/env node
/**
 * 将 shared/cloud-common.js 同步到所有云函数目录。
 *
 * 用法：node scripts/sync-shared.js
 * 修改管理员 OpenID 白名单或业务枚举后，务必运行本脚本再重新部署云函数。
 */
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const src = path.join(root, 'shared', 'cloud-common.js')
const cfRoot = path.join(root, 'cloudfunctions')

if (!fs.existsSync(src)) {
  console.error('错误：未找到 shared/cloud-common.js')
  process.exit(1)
}

const content = fs.readFileSync(src, 'utf8')
const dirs = fs
  .readdirSync(cfRoot)
  .filter((d) => {
    const p = path.join(cfRoot, d)
    return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'index.js'))
  })
  .sort()

let count = 0
for (const dir of dirs) {
  fs.writeFileSync(path.join(cfRoot, dir, 'cloud-common.js'), content)
  count++
}

console.log(`✅ 已同步 cloud-common.js 到 ${count} 个云函数目录：`)
console.log('   ' + dirs.join(', '))
console.log('   提醒：同步后需要在微信开发者工具中重新部署（上传）各个云函数。')
