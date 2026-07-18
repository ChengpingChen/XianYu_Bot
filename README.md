# 闲鱼自动回复 Bot 项目文档

> 基于 Node.js + WebSocket + DeepSeek AI 的闲鱼 IM 自动回复机器人，支持产品知识库与付款后自动发货。

> ⚠️ **免责声明：本项目为非官方 Bot 工具，使用第三方 Bot 操作闲鱼账号存在包括但不限于账号封禁、限制登录、资金冻结等风险。使用本软件即表示您自愿承担一切因使用本软件而产生的后果与责任，作者不承担任何连带责任。请谨慎使用，遵守平台规则。**

---

## 1. 项目概述

本项目是一个**闲鱼（Goofish）卖家自动客服机器人**，能够：

- **实时监听**闲鱼 WebSocket 消息，秒级响应买家咨询
- **基于 DeepSeek AI** 生成自然、贴合商品信息的回复
- **维护产品知识库**，让 AI 回复更精准、更像真实卖家
- **付款后自动发货**，检测到买家付款后自动发送资源/链接
- **过滤售前系统消息**，避免对“已拍下待付款”等无效状态误回复
- **补回复启动前未读消息**，确保不遗漏任何潜在买家

适用场景：数字资源、虚拟商品、标准化商品等需要自动回复 + 自动交付的闲鱼卖家。

---

## 2. 技术栈

| 技术/库 | 用途 |
|---------|------|
| **Node.js 22.x** | 运行时环境 |
| **goofish-client v1.4.0** | 封装闲鱼 WebSocket IM 协议、MTOP 登录、消息收发 |
| **DeepSeek API** | 大语言模型生成客服回复 |
| **MsgPack** | 闲鱼 WebSocket 消息的二进制序列化/反序列化 |
| **MTOP API** | 淘宝/闲鱼移动端 H5 API 协议（获取 IM Token、用户信息等） |
| **dotenv** | 环境变量管理（Cookie、API Key、运行参数） |
| **leveldown** | 读取闲鱼桌面客户端 LevelDB 中存储的 token（可选） |
| **原生 fetch** | 调用 DeepSeek Chat Completions API |

---

## 3. 项目架构

```text
┌─────────────────────────────────────────────────────────────┐
│                        闲鱼/Goofish 服务端                    │
│   WebSocket: wss://wss-goofish.dingtalk.com/                 │
│   MTOP API: h5api.m.goofish.com                              │
└──────────────────┬──────────────────────────────────────────┘
                   │ WebSocket / MTOP
┌──────────────────▼──────────────────────────────────────────┐
│                      闲鱼自动回复 Bot                         │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  bot.js（主程序）                                        │  │
│  │  · 配置加载（.env）                                       │  │
│  │  · 产品知识库（products.json）                            │  │
│  │  · MTOP 获取 IM Token                                    │  │
│  │  · WebSocket 连接 & 注册                                   │  │
│  │  · 消息监听：onSyncPush / onFormattedMessage             │  │
│  │  · 会话管理：conversationMap / deliveredCids             │  │
│  │  · AI 回复：DeepSeek                                     │  │
│  │  · 自动发货：handleAutoDelivery                          │  │
│  └─────────────────────────────────────────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ lib/logger.js │  │ lib/token.js  │  │  products.json     │  │
│  │ 日志模块      │  │ Token 提取    │  │ 产品知识库         │  │
│  └──────────────┘  └──────────────┘  └────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. 核心流程

```text
1. 启动
   ├─ 加载 .env 配置（Cookie、DeepSeek API Key、冷却时间）
   ├─ 加载 products.json 产品知识库
   └─ 初始化 goofish-client

2. 登录 & 连接
   ├─ MTOP 获取 IM Token（mtop.taobao.idlemessage.pc.login.token）
   ├─ 连接 WebSocket（wss://wss-goofish.dingtalk.com/）
   └─ 注册 IM 服务（register）

3. 会话准备
   ├─ 调用 listNewestPagination 拉取会话列表
   ├─ 解析 singleChatUserConversation.singleChatConversation.cid
   ├─ 构建 conversationMap（cid -> 会话信息）
   └─ catchUpUnread：补回复启动前未读消息

4. 实时监听
   ├─ onSyncPush（底层 MsgPack）：捕获所有同步消息，包括系统消息
   └─ onFormattedMessage（格式化消息）：捕获买家文本消息

5. 消息处理
   ├─ 付款成功 → handleAutoDelivery → 发送 products.json 中的 delivery
   ├─ 售前系统消息（已拍下/待付款/待成交）→ 跳过，不回复
   └─ 普通买家消息 → genReply（DeepSeek）→ sendReply
```

---

## 5. 文件结构

```text
bot/
├── bot.js                  # 主程序：IM 连接、消息处理、AI 回复、自动发货
├── products.json           # 产品知识库（标题、价格、描述、发货内容）
├── read-token.js           # 从闲鱼桌面 App 的 LevelDB 提取 token（备用）
├── package.json            # 项目依赖与 npm scripts
├── .env.example            # 环境变量模板
├── .env                    # 实际配置（已加入 .gitignore）
├── .gitignore
├── lib/
│   ├── logger.js           # 控制台 + 文件双写日志，按日期轮转
│   └── token.js            # LevelDB token 提取、JWT 解码、过期检测
├── logs/                   # 运行日志（按日期生成）
└── node_modules/           # 依赖
```

---

## 6. 功能模块详解

### 6.1 配置加载（`bot.js` 顶部）

- 优先使用 `GOOFISH_COOKIE`（完整 Cookie 字符串），兼容性最好
- 回退使用分字段拼装：`_m_h5_tk`、`cna`、`unb`、`tracknick`
- `DEEPSEEK_API_KEY`：AI 回复能力
- `REPLY_COOLDOWN`：回复冷却时间（默认 60 秒）
- `LOG_DIR`：日志目录

### 6.2 产品知识库（`products.json`）

- 按 `itemId` 组织商品信息
- 字段：`title`、`price`、`desc`、`faq`、`delivery`
- `delivery` 字段是付款后自动发送的发货内容
- 支持变量替换：`{title}`、`{price}`
- 未手动填写的商品，Bot 会自动调用 `client.api.mtop.item.getDetail` 获取标题和价格

### 6.3 自动发货

- 关键词检测：`已付款`、`买家已付款`、`支付成功`、`待发货`、`去发货` 等
- 深度搜索：`deepSearchPayment()` 递归遍历整个 MsgPack 解码对象，不放过任何嵌套字段
- 会话匹配：pushCid → itemId → 单候选会话
- 去重：`deliveredCids` Set 防止同一会话重复发货
- 刷新重试：未匹配到会话时自动刷新会话列表再试一次

### 6.4 AI 回复

- 使用 DeepSeek `deepseek-chat` 模型
- 将商品信息注入 system prompt，让 AI 基于具体商品回答
- 限制 `max_tokens=200`，回复简短（50 字以内）
- 失败自动重试 1 次，超时 15 秒

### 6.5 消息监听双保险

| 监听器 | 层级 | 用途 |
|--------|------|------|
| `onSyncPush` | 底层 MsgPack | 捕获所有同步消息，包括系统通知、付款通知 |
| `onFormattedMessage` | 高层格式化 | 捕获买家文本消息，解析 title/subTitle/extJson |

### 6.6 会话管理

- `conversationMap`：以 `cid` 为 key，缓存会话的 peerUserId、itemId、receivers 等
- `repliedMsgs`：基于 `msgId` 去重，避免重复回复
- `refreshConversations()`：每 5 分钟刷新一次会话列表

---

## 7. 踩坑与解决方案

### 坑 1：误以为闲鱼 IM 是 HTTP REST API

**现象**：`api.goofish.pro/api/im/session/list` 持续返回 500。

**原因**：闲鱼 IM 基于 **WebSocket**（`wss://wss-goofish.dingtalk.com/`），不是 HTTP REST。

**解决**：引入 `goofish-client` 库，使用 WebSocket 协议连接、注册、收发消息。

---

### 坑 2：Session 过期

**现象**：`FAIL_SYS_SESSION_EXPIRED::Session过期`。

**原因**：Cookie 中缺少 `cookie2` 这个 HttpOnly 字段，或 Cookie 已过期。

**解决**：从浏览器 F12 → Network → 任意请求 → Headers → Cookie 复制**完整 Cookie 字符串**，粘贴到 `.env` 的 `GOOFISH_COOKIE=` 中。注意不是只复制 cookie2，而是整段 Cookie。

---

### 坑 3：会话列表解析异常

**现象**：Bot 连接成功但加载 0 个会话。

**原因**：会话数据嵌套在 `singleChatUserConversation` 下，`cid` 在 `singleChatConversation.cid` 中，不是顶层字段。

**解决**：解析时解包嵌套结构：

```javascript
const conv = raw.singleChatUserConversation || raw.groupChatUserConversation || raw;
const singleConv = conv.singleChatConversation || conv.groupChatConversation || {};
const cid = singleConv.cid || conv.cid || conv.conversationId || '';
```

---

### 坑 4：`senderId` 是对象而不是字符串

**现象**：日志显示 `senderId=[object Object]`，无法匹配用户。

**原因**：MsgPack 解码后的 `senderId` 形如 `{"1":"2217553835771@goofish"}`。

**解决**：编写 `extractUserId()`，递归尝试 `uid/userId/id/1` 键、数组元素、含 `@goofish` 的字符串，并去掉 `@goofish` 后缀。

---

### 坑 5：发送消息报 `uid is invalid`

**现象**：调用 `sendTextMessage` 失败，提示接收人 ID 无效。

**原因**：`receivers` 需要包含双方 `userId@goofish` 格式，且需发送方、接收方同时存在。

**解决**：`receivers = [pairFirst, pairSecond]`，其中 `pairFirst`/`pairSecond` 是服务端返回的原始 `@goofish` 格式 ID。

---

### 坑 6：消息重复回复

**现象**：同一条消息被回复多次。

**原因**：`onSyncPush` 和 `onFormattedMessage` 可能同时收到同一条消息，且重启后无法持久化去重。

**解决**：使用 `repliedMsgs` Set，基于 `msgId` 去重；重启后重新从会话列表处理未读消息。

---

### 坑 7：启动前的未读消息没有回复

**现象**：Bot 启动后只回复新消息，历史未读消息被遗漏。

**原因**：监听器在 `register()` 之后才注册，错过注册瞬间同步下来的历史消息。

**解决**：

1. 将消息监听器注册移到 `register()` 之前。
2. 增加 `catchUpUnread()`：遍历 `conversationMap`，对未读会话补回复。

---

### 坑 8：系统消息被当成普通消息回复

**现象**："我已拍下，待付款" 等系统消息触发了 AI 回复。

**原因**：系统消息没有正常 `senderId`（为空或 `1`），被当作普通消息进入 `handleIncomingMessage`。

**解决**：

1. 在 `onSyncPush` 中识别 `senderId` 为空/`0`/`1` 的系统消息。
2. 增加 `PRE_PAYMENT_KEYWORDS` 过滤：包含 `已拍下/待付款/待成交/待刀成/已小刀` 的系统消息直接跳过。

---

### 坑 9：付款通知检测不到

**现象**：买家已付款，但 Bot 没有自动发货。

**原因**：付款系统消息是 MsgPack 对象，关键词可能藏在深层字段（如 `extJson.subTitle`），而不是 `text` 或 `reminderContent` 顶层字段。

**解决**：

1. `deepSearchPayment()` 递归遍历整个解码对象，最多搜索 6 层。
2. `isPaymentMessage()` 检查 `title/subTitle/bizTag/tag/desc/description/message/msg/body/name` 等 15+ 字段。
3. 在 `onFormattedMessage` 中也检查 `content.title`、`content.subTitle`、`extJson` 等字段。

---

### 坑 10：售前消息与付款成功消息混淆

**现象**：想跳过“已拍下待付款”，又怕漏掉“买家已付款”。

**原因**：两类消息都是系统消息，都可能出现在同一个会话中。

**解决**：

- 付款关键词：`已付款`、`买家已付款`、`支付成功`、`待发货`、`去发货` 等
- 售前关键词：`已拍下`、`待付款`、`待成交`、`待刀成`、`已小刀`、`修改价格` 等
- 检测顺序：**先付款 → 再售前 → 最后普通回复**。确保付款消息优先触发自动发货，不会被售前关键词拦截。

---

## 8. 配置说明（`.env`）

```ini
# ====== 闲鱼 Cookie（推荐完整字符串）======
GOOFISH_COOKIE=...

# 备选：分字段填写（若使用 GOOFISH_COOKIE 则无需填写）
UNB=...
CNA=...
MH5_TK=...
TRACKNICK=...

# ====== DeepSeek API ======
DEEPSEEK_API_KEY=...

# ====== 运行参数 ======
REPLY_COOLDOWN=60000
LOG_DIR=./logs
```

### Cookie 获取方法

1. 登录 https://www.goofish.pro
2. 按 F12 → Network → 刷新页面或发送一条消息
3. 点击任意请求 → Headers → 找到 `Cookie:`
4. 复制完整 Cookie 字符串，粘贴到 `.env` 的 `GOOFISH_COOKIE=` 后面

> 注意：Cookie 会过期，通常需要每隔几天重新获取一次。

---

## 9. 如何运行

```bash
# 1. 进入项目目录
cd C:\Users\admin\Desktop\bot

# 2. 安装依赖（已安装可跳过）
npm install

# 3. 配置环境变量
# 复制 .env.example 为 .env，并填写 GOOFISH_COOKIE 和 DEEPSEEK_API_KEY

# 4. 启动 Bot
npm start

# 5. 开发模式（热重载）
npm run dev

# 6. 从闲鱼桌面 App 提取 token（备用）
npm run token
npm run token:print
```

---

## 10. 日志解读

启动成功时关键日志：

```text
========== 闲鱼自动回复 Bot 启动 ==========
当前账号: xxx (UID: 2217xxx)
IM Token 获取成功
WebSocket 已连接
========== 设置消息监听 ==========
IM 注册成功
已加载 50 个会话
========== 开始监听消息 ==========
```

收到消息时常见日志：

```text
[系统消息] cid=... msgId=... senderId=(空)
[售前消息，跳过回复] msgId=... 内容=我已拍下，待付款
[付款检测✓] msgId=... pushCid=...
  → pushCid 匹配会话: itemId=...
[自动发货] 会话 ... 检测到付款，发送资源链接
[买家 2217xxx] 可以便宜点吗
-> 回复: 亲，价格已经很优惠了哦...
```

---

## 11. 扩展建议

1. **多账号管理**：将 Cookie 配置改为 JSON 数组，循环启动多个 `Goofish` 实例。
2. **更复杂的 AI prompt**：根据商品类目设置不同的人设、回复风格。
3. **订单状态对接**：接入闲鱼订单 API，实现更精确的发货判断。
4. **定时任务**：如库存检查、价格监控、自动上下架等。
5. **消息持久化**：将会话记录写入 SQLite，便于后续分析和客服质检。
6. **敏感词过滤**：AI 生成内容后再过一遍违禁词/平台敏感词检查。
7. **web 管理后台**：通过 Web UI 管理产品知识库、查看日志、手动发货。

---

## 12. 注意事项

1. **Cookie 安全**：`.env` 已加入 `.gitignore`，请勿提交到 Git。
2. **频率控制**：闲鱼对消息频率有限制，避免短时间内大量发送，建议保持 `REPLY_COOLDOWN` 合理。
3. **平台规则**：自动回复内容需遵守闲鱼社区规范，避免诱导线下交易、虚假宣传等。
4. **人工兜底**：Bot 处理不了的问题应提示买家联系人工客服。
5. **Cookie 过期**：一旦遇到 `Session过期` 错误，请重新登录并获取新 Cookie。
6. **虚拟商品合规**：自动发送网盘链接等数字资源时，确保不违反平台及版权规定。

---

## 13. 版本历史

| 版本 | 主要变更 |
|------|----------|
| v2.0.0 | 改用 WebSocket 协议；支持产品知识库；支持付款后自动发货；过滤售前系统消息 |

---

*文档最后更新：2026-07-03*
