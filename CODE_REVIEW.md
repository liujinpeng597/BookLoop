# BookLoop 代码审查报告

> 审查范围：`cloudfunctions/` 全部 26 个云函数、`miniprogram/` 全部 14 个页面 JS、`utils/util.js`、`app.js`，并抽查 wxml/json/依赖配置。
> 审查维度：安全性 / 健壮性 / 逻辑性 / 风格。
> 问题编号规则：`S`=安全，`R`=健壮，`L`=逻辑，`T`=风格。严重度：🔴 高 / 🟠 中 / 🟡 低 / ℹ️ 提示。

## ✅ 修复状态（第二轮提交）

本报告中的全部问题已在后续提交中修复完毕。修复要点与对应编号：

| 修复内容 | 对应问题 |
| --- | --- |
| 新增 `shared/cloud-common.js` 单一维护点 + `scripts/sync-shared.js` 同步脚本，管理员白名单/枚举/`safeGetDoc` 集中管理 | S4 / T1 / R1 |
| `addBook`/`editBook` 改用 `Number.isFinite` 价格校验 + 枚举白名单 + 长度截断 | R2 / S6 / T6 |
| 买家自助取消：`updateOrderStatus` 放行"买家 + pending + 未支付 → cancelled"，自动释放库存并发系统通知；订单详情页新增取消按钮 | L1 |
| 支付两阶段语义：`paid` = 买家自报，管理员推进到 shipped/completed 时写 `adminConfirmedPaid`；管理端三态标签（待付/自报已付·待核实/已收款）；payOrder 拒绝终态订单 | S1 / L6 |
| `createBatchOrder` 缺书一律失败回滚，删除前端价格回退；bookId 去重；回滚改条件更新 | L2 / R7 |
| `getBookDetail` 增加 `countView` 参数，订单确认页/管理端编辑页不再计入浏览量 | L3 |
| `updateOrderStatus` 删除 completed 冗余分支（书在下单时即 sold） | L4 |
| 全部管理端写操作回调补齐 `res.result` 校验（admin-orders/admin-books/detail/cart/admin-announcement） | L5 / T3 |
| `getOrders`/`getBooks`/`getChatConversations` 全部分页/显式 limit，前端触底加载更多 | R3 |
| `getCart`/`publishAnnouncement`/`getSettings` 区分"集合不存在"与真实错误，不再伪装成功 | R4 |
| 新增 `cleanupLogs` 定时云函数（每日 4 点清理 7 天前 view_logs） | R5 |
| `saveUserProfile` 以 openid 为 `_id` 写入，天然防并发重复 | R6 |
| `fetchBookByISBN` 加管理员鉴权 + ISBN 长度上限 | S3 |
| `getSettings` 公开读取 key 白名单 | S2 |
| `addToCart` 只传 bookId，展示字段服务端回读 | S5 |
| `sendChatMessage` order_share 分支 content 限长；下单接口姓名/地址长度校验 | S6 |
| 聊天清除弹窗明确"双方记录都会被清除"；清除逻辑保持服务端行为 | L7 |
| 订单号随机位数提升至 9 位 | L8 |
| 前端 `constants.js` 抽取状态/分类/成色/默认地址常量，四个页面 statusMap 统一 | T5 / T7 |
| `new Date()` → `db.serverDate()` 统一；错误处理范式统一（不再透出 e.message） | T4 / T2 |
| `wx.chooseImage` → `wx.chooseMedia`；扫码取消守卫；"正在加密上传"文案修正；直改 data 的滑动跟手写法加注释；死参数（isAdmin/bookTitle/price）清理 | T7 / L8 |
| 未知成色使用独立的 `cond-other` 中性样式 | T5 |

**遗留事项（代码层无法完成，需人工操作）：**
1. 云开发控制台确认 8 个数据库集合权限为"仅创建者可读写"或更严格（S7）；
2. `view_logs` 建议在控制台添加 `(bookId, openId, viewTime)` 组合索引（R5）；
3. 修复后需在微信开发者工具中**重新部署全部 27 个云函数**（含新增的 cleanupLogs 及其定时触发器）。

## 总评

整体水准**高于多数学生级小程序项目**：服务端鉴权意识到位（所有身份判定都基于云函数取到的 OPENID，前端 `isAdmin` 只做 UI 分流）、下单有原子锁库存和回滚、支付有条件更新防重、搜索关键字做了正则转义、状态机校验、字段白名单……这些是真实生产项目里才会有的习惯。

主要短板集中在三类：**① 错误处理路径失真**（`doc().get()` 抛错被吞、前端不校验 `res.result` 的假成功提示）；**② 业务闭环缺口**（买家无法取消订单导致库存可能被永久锁死、买家自报支付无核验）；**③ 列表接口无分页**（订单/会话过百后静默截断）。风格层面最刺眼的是 15 处复制粘贴的 `ADMIN_OPENIDS`。

**建议修复顺序：R2 → L1/L2/L5 → R1/R3 → 其余。**

---

## 一、安全性

### 🔴 S1. 买家"我已支付"完全自声明，无任何收款核验

**位置**：`cloudfunctions/payOrder/index.js`

`payOrder` 仅凭"订单属于该买家"就把 `paid: true` 写库（`paymentMethod: 'qrcode'`）。恶意买家可以对任意自己的订单点"我已支付"，随后等待管理员按"已支付"发货。

缓解因素：线下面交场景 + 管理员在 `updateOrderStatus` 时人工把关，属常见轻量方案，但当前管理端 UI 没有任何"该 paid 标记来自买家自报"的醒目区分。

**建议**：短期在订单卡片/详情把 `paid` 显示为"买家自报已转账（待核实）"；长期改两阶段确认——买家 `buyerConfirmed` + 管理员 `adminConfirmed`，两者都为 true 才显示"已支付"。更彻底的是接入微信支付，`payOrder` 改为校验微信支付订单号。

### 🟠 S2. `getSettings` 无 key 白名单，公开读任意配置

**位置**：`cloudfunctions/getSettings/index.js`

任何用户可查询任意 `key`。当前 settings 里只有 `paymentQrcode`（本就需要公开），**暂无实害**；但未来任何人往 settings 里放手机号、密钥、管理参数，都会立刻公开泄露。

**建议**：

```js
const PUBLIC_KEYS = ['paymentQrcode']
if (!PUBLIC_KEYS.includes(key)) return { success: false, msg: '无效配置' }
```

### 🟠 S3. `fetchBookByISBN` 无鉴权，且每次命中都会向云存储写文件

**位置**：`cloudfunctions/fetchBookByISBN/index.js`

该函数只服务于管理员上架场景，却没有 `ADMIN_OPENIDS` 校验。任何用户可高频调用：每次成功查询都会下载封面并 `cloud.uploadFile` 到 `book-covers/`——**云存储垃圾文件 + 云函数调用配额都是真金白银**，等于开放的免费存储写入入口。

**建议**：与其他管理函数一致，加白名单校验；顺带给豆瓣代理的调用加个简单的按 openid 频控。

### 🟠 S4. 管理员 OpenID 硬编码在 16 个云函数中

**位置**：`login`、`addBook`、`editBook`、`deleteBook`、`getBooks`、`getOrders`、`getOrderDetail`、`updateOrderStatus`、`deleteOrder`、`sendChatMessage`、`getChatMessages`、`getChatConversations`、`clearChat`、`publishAnnouncement`、`saveSetting`、`checkOrderAccess` 共 16 处（`payOrder` 是唯一用买家身份鉴权的写函数，不在此列）。

同一 OpenID 复制粘贴 15 份。换管理员、加第二个管理员时**改一处漏一处 = 权限缺口**；仓库公开后管理员身份可被枚举（OpenID 不是凭证、无法伪造身份，但可被定向骚扰/社工）。

**建议**：① 最小改动——把白名单挪到各函数的**环境变量**（云开发控制台配置，不进代码库）；② 正规做法——建 `admins` 集合存 OpenID，封装一个共享的 `isAdmin(ctx)` 工具函数（云函数间可用私有 npm 包或构建期注入共享代码）。

### 🟡 S5. `addToCart` 信任前端传入的展示字段入库

**位置**：`cloudfunctions/addToCart/index.js`

`title/price/coverUrl/condition/pickupAddress` 全部来自前端并存入 `cart` 集合。最终计价在 `createOrder/createBatchOrder` 服务端重读，**不影响金额**，但购物车展示可被伪造（配合 L2 的回退分支存在理论计价风险）。

**建议**：`addToCart` 只收 `bookId`，其余字段服务端从 `books` 回读。

### 🟡 S6. 若干服务端入参缺长度/枚举校验

- `sendChatMessage` order_share 分支的 `content` 未限长（普通分支限了 500）；
- `createOrder/createBatchOrder` 的 `buyerName/address` 无长度上限；
- `addBook` 的 `condition/category` 无枚举校验（任意字符串入库，首页分类筛选取不到 → 书籍"消失"）；
- `publishAnnouncement` 的 `content` 无长度限制（仅管理员可发，风险低）。

**建议**：补齐 `String(x).substring(0, N)` 与枚举白名单；与前端约定对齐（详见 T6）。

### ℹ️ S7. 已公开的标识符与依赖控制台的数据库权限

- `appid`、云环境 ID、管理员 OpenID 已随仓库公开——appid/env 本就公开无妨，OpenID 见 S4。
- 代码层无法审查的**关键一环**：请确认云开发控制台里 8 个集合的权限均为"**仅创建者可读写**"或更严格（本应用全部读写走云函数，客户端无需直连数据库；若误配"所有人可读写"，上述所有服务端鉴权形同虚设）。

### ✅ 做得好的地方

- 所有权限判定都在服务端用 `cloud.getWXContext().OPENID`，前端传的 `isAdmin` 全部被无视（`getOrders/getBooks` 里还有注释说明——非常好）；
- `getBooks` 搜索关键字做了正则特殊字符转义（防 ReDoS）；
- `editBook` 字段白名单 + 状态白名单；`saveSetting` key 白名单；
- `sendChatMessage` order_share 分支服务端重建订单数据，不信任前端的价格/标题（防伪造分享卡片）；
- 订单/购物车/聊天的所有权校验（IDOR 防护）基本完备；
- ISBN 清洗 `replace(/[^0-9Xx]/g, '')` 后再拼 URL，阻断了路径注入/SSRF 向量；
- wxml 无 `rich-text`/`nodes`，全部用插值渲染——无 XSS 面。

---

## 二、健壮性

### 🔴 R1. `doc().get()` 对不存在/非法 ID 直接抛错，精心写的 `if (!order)` 全是死代码

**位置**：`deleteOrder`、`getOrderDetail`、`checkOrderAccess`、`payOrder`、`deleteBook`、`removeFromCart` 等所有使用 `db.collection('x').doc(id).get()` 的地方。

wx-server-sdk 中，文档不存在或 `id` 非法时 `doc().get()` **直接 throw**（`document not exists`），根本走不到后面的 `if (!order) return '订单不存在'`——这些分支永远不触发，异常被外层 `catch` 吞成"删除失败/加载失败/支付失败"等误导文案。`checkOrderAccess` 更绕：错误路径返回 `success:false`，前端 `fail` 分支恰好按"订单已失效"兜底，行为对但语义全错。

**建议**：封装统一的安全读取：

```js
async function safeGetDoc(coll, id) {
  try {
    const res = await db.collection(coll).doc(id).get()
    return res.data || null
  } catch (e) {
    if (String(e.errCode || e.message || '').includes('not exist')) return null
    throw e
  }
}
```

让"不存在"真正走到 `if (!order)` 分支，其余异常才进 catch。

### 🔴 R2. `addBook` 价格 NaN 校验漏洞——一票否决式 bug

**位置**：`cloudfunctions/addBook/index.js:11`

```js
if (Number(price) <= 0) return { success: false, msg: '价格必须大于0' }
```

`Number("abc")` = `NaN`，而 `NaN <= 0` 为 **false** → 非法价格直接入库。后续该书进入购物车/订单后，所有合计、金额、`toFixed` 全部变成 `NaN`，相关订单流程报废。对比 `editBook` 的写法 `!(data.price > 0)`（NaN 会被拒）——同一个项目里一正一误，恰是教科书级案例。

**建议**：

```js
const p = Number(price)
if (!Number.isFinite(p) || p <= 0) return { success: false, msg: '价格必须为大于0的数字' }
```

（前端输入框 `type="digit"` 只是 UI 缓解，直接调云函数可绕过，必须服务端堵死。）

### 🟠 R3. 列表接口无分页，超过默认上限会静默截断

- `getOrders`：`.get()` 无 limit/skip，云函数端默认上限 100 条——**订单破百后，买家看不到自己的旧单，管理员后台同样截断**，且无任何提示；
- `getChatConversations`：聚合查询未显式 `.limit()`，存在默认条数上限（端侧默认 20）——管理员会话列表可能只剩 20 个；
- `admin-books` 请求 `pageSize: 100`，书籍破百同样截断；
- `getChatMessages`：limit 上限 500，历史消息超出后没有按时间游标的翻页。

**建议**：所有列表接口统一 `skip/limit` 分页 + 前端滚动加载（首页 `getBooks` 已是正确范本，照抄即可）；聚合加 `.limit(100)` 并做会话分页。

### 🟠 R4. 多处 `catch` 返回 `success: true`，把真实故障伪装成"空数据"

**位置**：`getCart`（catch → `success:true, data:[]`）、`publishAnnouncement`（get 分支）、`getSettings`

数据库权限错误、集合异常，用户看到的是"空购物车/无公告/无收款码"——排障时极具迷惑性（用户以为数据丢了）。

**建议**：仅对"集合不存在"这类预期异常降级返回空，其余返回 `success:false`。

### 🟡 R5. `view_logs` 无限增长

**位置**：`cloudfunctions/getBookDetail/index.js`

每次有效浏览 +1 条记录，无清理机制、无索引。数据量随时间线性膨胀，去重查询（按 `viewTime` 过滤）会越来越慢。

**建议**：加 `(bookId, openId, viewTime)` 组合索引；配一个每日定时触发器清理 7 天前日志。

### 🟡 R6. 若干"检查-再写入"竞态

- `addToCart` 查重非原子 → 快速双击可能产生两条相同书籍；
- `saveUserProfile` get-then-add → 并发首次保存可能产生同一 openid 两条记录；
- `getBookDetail` count-then-inc → 并发首访浏览量多计。

影响都不大，但建议知晓：可用唯一性约束/条件更新收敛。

### 🟡 R7. `createBatchOrder` 回滚无条件 `doc(id).update` 释放书籍

catch 里释放库存未带 `where({ status: 'sold' })` 条件（`createOrder` 的 catch 带了——又一处不一致）。当前时序下安全，但条件更新更稳。

### ✅ 做得好的地方

- 下单原子锁（`where({status:'on_sale'}).update`）+ 失败回滚，防超卖正确；
- `payOrder` 条件更新（`paid: false` + `status != cancelled`）防并发重复支付；
- `updateOrderStatus` 状态机 + 原子条件更新防并发状态覆盖；
- `clearChat` 知道单次 remove 有上限、用循环分批删；
- `fetchBookByISBN` 三级数据源降级（豆瓣代理→Open Library→Google Books）+ 每级超时 + 描述截断 500 字；
- 前端 `loginPromise` 防鉴权竞态、`submitting` 标志防重复提交、聊天 1s 客户端限频、`onUnload` 清定时器；
- `getChatMessages` 对 limit 做了钳制（防恶意大分页）。

---

## 三、逻辑性

### 🔴 L1. 买家无法取消订单；买家"删除订单"既不取消也不释放库存

**位置**：`updateOrderStatus`（状态机）、`deleteOrder`（买家分支）、`my.js onDeleteOrder`

状态机 `pending → cancelled` **只有管理员能触发**。买家误下单后的唯一操作是 `deleteOrder(deleteRole='buyer')`——这只是逻辑删除（买家自己看不见了），**订单仍是 pending、书仍是 sold 被锁死**，管理员视角一切照旧。买家唯一出路是聊天求管理员取消。

最坏情形：买家随手下单又随手删除 → 书被永久占用（管理员若不主动排查 pending 订单根本发现不了）。

**建议**：允许买家对 `pending` 且 `paid=false` 的订单自助取消——`deleteOrder` 买家分支或独立 `cancelOrder` 函数中：状态机校验 + 原子置 `cancelled` + 释放库存 + 发系统通知。状态机表加入口：`pending --(buyer)--> cancelled`。

### 🔴 L2. `createBatchOrder` 缺书时回退前端价格

**位置**：`cloudfunctions/createBatchOrder/index.js:46-54`

```js
price: book ? book.price : Number(i.price)
```

`bookMap` 理论上应全命中（书刚被锁住），但任何异常路径导致 miss 时，订单价格取**前端传入的 `i.price`**——违反"价格只信服务端"的原则，与整个项目的安全设计相悖。

**建议**：缺失即整体失败回滚，绝不回退前端价：

```js
if (!bookMap[i.bookId]) { /* 回滚 locked 并 return 失败 */ }
```

### 🟠 L3. `getBookDetail` 有副作用：任何读取都 +1 浏览量

**位置**：`cloudfunctions/getBookDetail/index.js`

订单确认页（`order.js loadBookDetail`）、管理员编辑页（`admin-book-edit.js`）都调它 → **每确认一次订单、每编辑一次书籍，浏览量 +1**，统计数据虚高。

**建议**：加 `{ countView: false }` 参数，或把计数拆成独立的 `viewBook` 函数，只在详情页真正展示时调用。

### 🟠 L4. `updateOrderStatus` completed 分支冗余且用了无条件更新

**位置**：`cloudfunctions/updateOrderStatus/index.js:84-98`

completed 时把书 set 为 `sold`——但书从下单那一刻起就是 `sold`，此操作无意义；且用的是 `doc().update`（无 where 条件），若期间书被管理员手动重新上架（`on_sale`），会被错误打回 `sold`。cancelled 分支倒是正确地用了 `where({status:'sold'})` 条件更新。

**建议**：删除 completed 分支（或对齐为条件更新）。状态语义上"已完成"与"已售出"本就该解耦——可以考虑 completed 时才真正置 sold、下单时用 `locked` 中间态，但那是更大的重构，当前最小改法是删掉冗余分支。

### 🟠 L5. 管理员操作的 success 回调不校验 `res.result`——失败也弹"操作成功"

**位置**：

- `admin-orders.js onUpdateStatus`（`success: () => { ... '操作成功' }`）
- `admin-books.js onChangeStatus / onDelete`
- `detail.js onDeleteTap`
- `admin-announcement.js onDelete`
- `cart.js onDeleteItem`

云函数返回 `success: false`（状态机拒绝："不能从已完成变更为已取消"；无权限；"该书状态已改变"）时，UI **照样提示成功**。管理员被误导以为已处理，实际订单/书籍状态没变——这是管理后台最伤的缺陷。

**建议**：所有写操作回调统一：

```js
success: res => {
  wx.hideLoading()
  if (res.result && res.result.success) { /* 成功提示 + 刷新 */ }
  else { wx.showToast({ title: res.result.msg || '操作失败', icon: 'none' }) }
}
```

### 🟡 L6. `payOrder` 允许对 completed 订单补写 paid

订单已完成（`paid:false`，比如管理员免单完成）后，买家仍可调用 `payOrder` 把它标成已支付。影响仅展示层，建议对终态订单一并拒绝（`status in ('completed','cancelled')` 时 return）。

### 🟡 L7. clearChat 单方清除会物理删除双方历史

**位置**：`cloudfunctions/clearChat/index.js` + `chat.js onClearChat` vs `chat-list.js onDeleteMsg`

聊天页"清除记录"= 服务端物理删除该 `chatId` 全部消息（**管理员侧也没了**）；会话列表左滑删除 = 仅本地隐藏（新消息自动恢复）。两种"删除"语义不一致，用户预期混乱。买家手滑清空后，管理员那边上下文全丢。

**建议**：统一语义——聊天页的清除也改为本地隐藏；若确需物理删，至少在确认弹窗里写明"对方的记录也会被清除"（当前文案只说"此操作不可恢复"，没说影响对方）。

### ℹ️ L8. 其他小点

- 订单号兜底分支（3 次查重失败后）不再查重——理论碰撞，影响极小；
- 运费规则：单本 1 元、批量每本 1 元（5 本=5 元）。同址合单并未省运费，批量下单省的只有时间——属产品决策，提请确认是否符合预期；
- `my.js`/`chat.js` 给 `getOrders` 传 `isAdmin: false`、`admin-orders.js` 传 `isAdmin: true`——服务端正确地无视了它们，但留着这些参数会误导后来人以为前端可控身份，建议删除。

---

## 四、风格

### 🟠 T1.（同 S4）`ADMIN_OPENIDS` 16 处复制粘贴

最典型的 DRY 违例。即使不做 S4 的方案，也至少应抽一个 `config.js` 模板 + 部署时同步替换。

### 🟠 T2. 错误处理三种范式并存

1. `success:false + msg`（主流，好）；
2. catch 吞错返回 `success:true`（R4，坏）；
3. 把 `e.message` 原样返回给用户（`saveSetting`、`removeFromCart`）——内部错误细节直透 UI，文案不可控。

**建议**：约定统一返回结构 `{ success, msg, code }`，用户文案与内部错误分离（`console.error` 记详情，返回固定话术）。

### 🟠 T3.（同 L5）回调是否检查 `res.result` 一半一半

同类页面、同类操作，有的检查有的不检查——不是风格问题，是 bug 温床。建议全局搜 `success: () =>`、`success: res => {` 后没跟 `res.result` 判断的，逐个补齐。

### 🟡 T4. `new Date()` 与 `db.serverDate()` 混用

`addToCart`、`updateOrderStatus` 通知消息、`getBookDetail` 日志用 `new Date()`；其余用 `db.serverDate()`。统一为 `db.serverDate()`（还有 T4 的孪生问题：`createTime: new Date()` 存的是函数运行时时间，与库端时间可能有偏差）。

### 🟡 T5. 魔法字符串三连

- `'西区七公寓512'` 硬编码在 3 处（`addBook` 默认值、`order.js` 兜底、`admin-book-edit` 默认值）——换个取货点要改三个文件；
- `'pending'/'on_sale'/'sold'...` 状态字符串散落约 40 处，无常量集中定义，手滑拼错即静默 bug；
- `condToClass` 的 fallback：`util.js` 默认 `'badge-default'`，`index.js` 却传 `'cond-bachenxin'`——疑似调试遗留（该 class 在 index.wxss 中存在但语义是"八成新"的样式，作为兜底不符合"未知成色"的含义）。

**建议**：状态/分类/成色收进常量对象（前端 `utils/constants.js`；云函数侧可用构建脚本注入或各自复制一份并注释"与前端保持同步"）。

### 🟡 T6. 枚举与校验两端不对齐

前端 picker 限定 5 分类 4 成色，后端 `addBook` 接受任意字符串（S6）。脏数据一入库，首页筛选直接查不到。**校验必须以后端为准、前端仅为体验**。

### ℹ️ T7. 其他小杂项

- `admin-book-edit.js`：`'正在加密上传...'` 文案名不副实（没有加密）；`err.errMsg.indexOf('cancel')` 若 errMsg 为 undefined 会 TypeError；
- `admin-settings.js`：`wx.chooseImage` 已废弃，同项目 `admin-book-edit` 已用 `wx.chooseMedia`，应统一；
- `chat-list.js`：`onSlideChange` 直接改 `this.data.conversations[index].currentX` 绕过 setData（可用的性能写法，但建议加注释说明意图，避免被后人当 bug"修复"）；
- `getOrderDetail` 的 `ADMIN_OPENIDS` 定义在函数体内，其他 14 处都在顶部；
- `admin-book-edit.js onSubmit` 给 `createOrder` 传 `bookTitle/bookCover/price`，云函数全部忽略（服务端重读）——死参数建议删除，避免误导；
- 各 `config.json` 的 `openapi: []` 为模板默认值，项目未用 openapi，属正常；
- `wx-server-sdk ~2.6.3` 版本偏旧但可用，升级需回归测试，非必须。

---

## 修复优先级路线图

| 优先级 | 问题 | 工作量 |
| --- | --- | --- |
| **P0（本周）** | R2 价格 NaN 漏洞（3 行） | 5 分钟 |
| **P0** | L5 管理端假成功提示（6 个回调补 `res.result` 判断） | 半小时 |
| **P0** | L1 买家自助取消 pending 订单（含释放库存+通知） | 1-2 小时 |
| **P1（近期）** | L2 删除前端价回退；L3 浏览量副作用参数化 | 半小时 |
| **P1** | R1 封装 safeGetDoc 替换全部 `doc().get()` | 1 小时 |
| **P1** | R3 getOrders/聚合分页 + 前端加载更多 | 半天 |
| **P1** | S3 fetchBookByISBN 加鉴权；S2 getSettings 白名单 | 15 分钟 |
| **P2（规划）** | S4 管理员配置集中化；T2/T3 统一错误处理范式 | 半天 |
| **P2** | R5 view_logs 索引+定时清理；L7 清除语义统一；T5 常量抽取 | 按需 |

---

*审查基于当前 main 分支（commit a944c13）。云开发控制台侧的数据库权限、云存储权限、环境配置不在代码审查范围内，请对照 S7 自查。*
