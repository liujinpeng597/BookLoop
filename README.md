# BookLoop · 理工布克 📚

> 一个基于 **微信小程序 + 微信云开发** 的校园二手书交易平台，让闲置教材在校园里流动起来。

**理工布克**（BookLoop）面向高校学生，提供二手书的浏览、搜索、加购、下单、线下面交支付、买卖双方即时沟通等完整闭环，并内置一套完整的商家管理后台（上架、订单、公告、系统设置）。无需自建服务器，前端与后端全部运行在微信云开发之上。

---

## ✨ 功能特性

### 用户端（小程序前台）

| 模块 | 说明 |
| --- | --- |
| 🏠 首页 | 书籍列表、分类筛选（教材 / 考研 / 文学 / 生活 / 其他）、关键词搜索（300ms 防抖）、下拉刷新、分页加载、顶部公告栏 |
| 📖 书籍详情 | 价格 / 原价对比、成色标签、自取地址、浏览量统计、防重复计数 |
| 🛒 购物车 | 加购、数量合并、批量下单、清空失效项 |
| 📝 订单 | 单本下单 / 购物车批量下单、订单状态流转（待取书 / 已完成 / 已取消）、订单详情 |
| 💰 支付 | 线下二维码支付确认，云函数原子更新防止并发重复支付 |
| 💬 即时聊天 | 买卖双方围绕订单点对点聊天、会话列表、未读消息、清空聊天记录 |
| 👤 个人中心 | 微信头像昵称资料维护、我的订单入口 |

### 管理端（内置后台，按 OpenID 白名单鉴权）

| 模块 | 说明 |
| --- | --- |
| 📚 图书管理 | 上架 / 编辑 / 下架 / 删除书籍 |
| 🔍 ISBN 智能录入 | 输入 ISBN 自动抓取书名、作者、封面、简介（豆瓣 API 优先，Open Library 兜底），封面自动转存云存储 |
| 📦 订单管理 | 全部订单查看、状态流转（确认取书 / 完成订单 / 取消）、取消自动回滚库存并通知买家 |
| 📢 公告管理 | 发布 / 撤回首页公告 |
| ⚙️ 系统设置 | 收款码等运营参数在线配置 |

### 技术亮点

- **零服务器架构**：26 个云函数 + 云数据库 + 云存储，天然免运维、免域名备案
- **权限内控**：管理员以 OpenID 白名单形式在 15 个云函数中做服务端鉴权，前端仅做 UI 分流
- **并发安全**：下单锁库存、支付原子更新（`where` 条件更新）防超卖 / 重复支付
- **体验优化**：搜索防抖、分页拉取、`lazyCodeLoading` 按需注入、本地缓存用户资料

---

## 🧰 技术栈

- **前端**：微信小程序原生框架（WXML / WXSS / JS），基础库 `3.15.2`
- **后端**：微信云开发（云函数 + 云数据库 + 云存储），`wx-server-sdk`
- **图书数据源**：豆瓣图书 API（镜像代理）、[Open Library](https://openlibrary.org/) API

---

## 📁 项目结构

```
BookLoop/
├── miniprogram/                 # 小程序前端
│   ├── app.js                   # 全局逻辑：云环境初始化、静默登录、身份鉴定
│   ├── app.json                 # 页面路由、TabBar、窗口配置
│   ├── utils/
│   │   └── util.js              # 成色文案、导航栏适配等公共工具
│   ├── assets/                  # TabBar 图标
│   └── pages/
│       ├── index/               # 首页：列表 / 分类 / 搜索 / 公告
│       ├── detail/              # 书籍详情
│       ├── cart/                # 购物车
│       ├── order/               # 我的订单
│       ├── order-detail/        # 订单详情
│       ├── payment/             # 支付（扫码线下支付）
│       ├── chat-list/           # 会话列表
│       ├── chat/                # 聊天窗口
│       ├── my/                  # 个人中心
│       ├── admin-books/         # [管理] 图书列表
│       ├── admin-book-edit/     # [管理] 图书上架 / 编辑（ISBN 抓取）
│       ├── admin-orders/        # [管理] 订单管理
│       ├── admin-announcement/  # [管理] 公告管理
│       └── admin-settings/      # [管理] 系统设置
├── cloudfunctions/              # 云函数（26 个）
│   ├── login/                   # 静默登录，返回 openid 与管理员身份
│   ├── getBooks/                # 书籍列表（分类 / 关键词 / 分页）
│   ├── getBookDetail/           # 书籍详情（含浏览计数去重）
│   ├── addBook/                 # 上架书籍（管理员）
│   ├── editBook/                # 编辑书籍（管理员）
│   ├── deleteBook/              # 下架 / 删除（管理员）
│   ├── fetchBookByISBN/         # ISBN 抓取图书信息 + 封面转存（管理员）
│   ├── addToCart/ getCart/ removeFromCart/      # 购物车
│   ├── createOrder/ createBatchOrder/           # 单本 / 批量下单（锁库存）
│   ├── getOrders/ getOrderDetail/ checkOrderAccess/  # 订单查询 / 权限校验
│   ├── updateOrderStatus/       # 订单状态流转（管理员，含回滚库存）
│   ├── deleteOrder/             # 删除订单（买家 / 管理员）
│   ├── payOrder/                # 支付确认（原子防重）
│   ├── sendChatMessage/ getChatMessages/ getChatConversations/ clearChat/  # 聊天
│   ├── saveUserProfile/         # 用户资料
│   ├── publishAnnouncement/     # 公告发布 / 查询（管理员）
│   └── getSettings/ saveSetting/  # 系统设置
├── project.config.json          # 微信开发者工具项目配置
└── README.md
```

---

## 🚀 快速开始

### 1. 准备工作

- 已注册的微信小程序账号，获取自己的 **AppID**
- 下载安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)

### 2. 导入项目

```bash
git clone https://github.com/liujinpeng597/BookLoop.git
```

用微信开发者工具「导入项目」选择本仓库根目录，将 `project.config.json` 中的 `appid` 替换为你自己的：

```json
{
  "appid": "你的AppID"
}
```

### 3. 开通云开发

在开发者工具中点击「云开发」开通环境（选择免费基础额度即可），然后把 `miniprogram/app.js` 中的环境 ID 换成你自己的：

```js
wx.cloud.init({
  env: '你的云环境ID',   // 原值: cloud1-8g361be61aa5b7ef
  traceUser: true
})
```

### 4. 部署云函数

在开发者工具中，右键 `cloudfunctions` 目录下**每个函数文件夹** →「上传并部署：云端安装依赖（不上传 node_modules）」。

> 共 26 个函数，需要逐个部署（也可以右键 `cloudfunctions` 根目录批量上传）。

### 5. 创建数据库集合

在云开发控制台「数据库」中手动创建以下集合（无需手动建表结构，插入数据时自动生成字段）：

| 集合 | 用途 |
| --- | --- |
| `books` | 书籍信息（价格、成色、分类、状态、浏览量） |
| `orders` | 订单（买家、状态、支付标记、订单号） |
| `cart` | 购物车 |
| `chat_messages` | 聊天消息 |
| `users` | 用户资料（头像、昵称） |
| `announcements` | 首页公告 |
| `settings` | 系统设置（收款码等） |
| `view_logs` | 浏览记录（用于浏览量去重统计） |

> 建议在数据库「权限设置」中将所有集合设为 **仅创建者可读写** 或 **所有用户不可读写**（读写均由云函数完成，客户端不直连数据库）。

### 6. 配置管理员

所有涉及管理的云函数中都有管理员白名单，把其中的 OpenID 替换为你自己的（共 15 处，值为同一 OpenID）：

```js
// 以 cloudfunctions/login/index.js 为例
const ADMIN_OPENIDS = ['你的OpenID']
```

> 获取 OpenID：部署 `login` 云函数后在小程序里触发登录，控制台日志中即可看到 `openid`；或在云开发数据库任意一条你自己的数据中查看。

配置完成、重新部署相关云函数后，用管理员微信进入小程序，「我的」页面即出现管理后台入口。

---

## 📖 业务流程

```
买家浏览/搜索 → 加入购物车/直接下单 → 扫码线下支付 → 点击"我已支付"
     ↓                                    ↓
管理员订单管理确认到账 → 订单完成 → 书籍状态置为已售 → 双方可围绕订单聊天沟通面交
```

---

## ⚠️ 注意事项

- 本项目支付方式为**线下二维码收款 + 买家确认**，未接入微信支付商户接口，适合校园面交等轻量场景；如需接入微信支付，可扩展 `payOrder` 云函数。
- `fetchBookByISBN` 依赖的豆瓣图书 API 为第三方镜像，存在不稳定性；失败时自动切换 Open Library 兜底。
- `project.private.config.json` 为开发者本地私有配置，已加入 `.gitignore`，不会提交到仓库。

---

## 📄 License

本项目仅供学习交流使用，欢迎 Star / Fork。商用请自行评估合规风险。
