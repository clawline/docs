# Clawline 产品功能全景文档

> 版本: 0.2.x | 更新日期: 2026-04-14  
> 基于全部源码分析自动生成，覆盖 SDK、Gateway、Channel、Web 端、小程序端、Browser Agent

---

## 一、产品简介

**Clawline** 是一个为 OpenClaw AI 平台提供实时聊天通道的完整解决方案。它让用户可以通过 Web 浏览器、微信小程序或任何自定义客户端，与 OpenClaw 上配置的 AI Agent 进行实时对话。

### 核心价值
- **实时双向通信**: 基于 WebSocket 的低延迟消息传递
- **多 Agent 支持**: 同时与多个 AI Agent 对话，自由切换
- **多端覆盖**: Web、微信小程序、Chrome 扩展、自定义 SDK 接入
- **Relay 架构**: 无需公网暴露 OpenClaw 实例，通过中继网关安全通信

### 部署模式

```
模式 A: 直连 (Direct Connect)
客户端 ─── WebSocket ──→ OpenClaw (Channel Plugin)

模式 B: 中继 (Relay)
客户端 ─── WSS ──→ Gateway (云端) ←── WS ──── OpenClaw (本地)
```

---

## 二、系统架构

### 组件关系

```
┌─────────────────────────────────────────────────────────┐
│                    Clawline 产品架构                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  客户端 (Clients)                                        │
│  ├── Client Web (React SPA/PWA)                         │
│  ├── Client WeChat (微信小程序)                           │
│  ├── Browser Agent (Chrome 扩展)                         │
│  └── 自定义客户端 (via SDK)                               │
│       │                                                 │
│       │ WebSocket (wss://)                              │
│       ▼                                                 │
│  Gateway (Relay 中继网关)                                 │
│  ├── WebSocket Relay (/backend, /client)                │
│  ├── REST API (管理、媒体、AI 辅助)                        │
│  ├── Admin UI (React)                                   │
│  ├── 消息持久化 (Supabase)                               │
│  └── 媒体存储 (本地文件系统)                               │
│       │                                                 │
│       │ WebSocket (ws://)                               │
│       ▼                                                 │
│  Channel Plugin (@restry/clawline)                      │
│  ├── OpenClaw 插件接口                                   │
│  ├── 消息处理管线                                        │
│  ├── Agent 管理与委托                                    │
│  ├── 高级功能 (群组、搜索、转发、状态)                      │
│  └── 语音转录 (Faster-Whisper)                           │
│       │                                                 │
│       │ OpenClaw Plugin SDK                             │
│       ▼                                                 │
│  OpenClaw AI Agent Runtime                              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 三、SDK (`@clawlines/sdk`)

**用途**: 为第三方应用提供 WebSocket 客户端库，连接 Clawline 网关或 Channel 插件。

### 3.1 核心类

#### ClawlineClient — 单连接客户端

| 方法 | 说明 |
|------|------|
| `connect()` | 建立 WebSocket 连接，自动重连 (最多 6 次，指数退避) |
| `close()` | 关闭连接并清除所有定时器 |
| `sendText(content, agentId?)` | 发送文本消息 |
| `sendTextWithParent(content, parentId, agentId?)` | 发送引用回复 |
| `sendMedia({messageType, mediaUrl, mimeType, ...})` | 发送图片/语音/音频 |
| `sendFile({mediaUrl, mimeType, fileName, ...})` | 发送文件 |
| `uploadFile(file, fileName?)` | HTTP 上传文件到网关 |
| `requestAgentList()` | 获取可用 Agent 列表 |
| `selectAgent(agentId)` | 切换当前 Agent |
| `requestAgentContext(agentId)` | 获取 Agent 上下文文件 |
| `requestHistory(chatId)` | 获取消息历史 |
| `requestConversationList(agentId?)` | 获取会话列表 |
| `addReaction(messageId, emoji)` | 添加表情回应 |
| `removeReaction(messageId, emoji)` | 移除表情回应 |
| `editMessage(messageId, newContent)` | 编辑消息 |
| `deleteMessage(messageId)` | 删除消息 |
| `sendTyping(isTyping?)` | 发送输入状态 |
| `getTypingAgents()` | 获取正在输入的 Agent 列表 |

**事件**:
- `connected` / `disconnected` / `connecting` / `reconnecting` — 连接状态
- `message` — 收到消息
- `typing` — 输入状态变化
- `agentList` — Agent 列表更新
- `agentContext` — Agent 上下文返回
- `error` — 错误

#### ClawlinePool — 连接池

管理多个并发 ClawlineClient 实例，LRU 策略自动清理。

| 配置 | 默认值 | 说明 |
|------|--------|------|
| `maxConnections` | 3 | 最大并发连接数 |
| `idleTimeoutMs` | 300,000 (5分钟) | 空闲超时 |

### 3.2 平台支持

- **浏览器**: 使用原生 WebSocket
- **Node.js**: 需要 `ws` 作为 peer dependency
- **TypeScript**: 完整类型定义导出

---

## 四、Gateway (中继网关)

**用途**: 云端 WebSocket 中继服务，连接客户端与 OpenClaw 插件，提供消息持久化、认证和管理功能。

### 4.1 WebSocket 协议

#### Backend 端点 (`/backend`)
OpenClaw Channel 插件连接此端点，使用 `channelId + secret` 认证。

| 帧类型 (Backend→Gateway) | 说明 |
|---------------------------|------|
| `relay.backend.hello` | 握手认证 |
| `relay.server.event` | 向客户端推送事件 |
| `relay.server.persist` | 仅持久化，不推送 |
| `relay.server.reject` | 拒绝客户端连接 |
| `relay.server.close` | 关闭客户端连接 |

| 帧类型 (Gateway→Backend) | 说明 |
|---------------------------|------|
| `relay.backend.ack` | 认证成功 |
| `relay.client.open` | 新客户端连接 |
| `relay.client.event` | 客户端消息 |
| `relay.client.close` | 客户端断开 |

#### Client 端点 (`/client`)
第三方客户端连接此端点。

**连接参数**: `?channelId=<id>&token=<token>&chatId=<id>&agentId=<id>`

**特殊处理**:
- `{type: "ping"}` → 网关直接回复 `{type: "pong"}` (不转发)
- `message.receive` 类型消息 → 广播到同 chatId 的兄弟连接

### 4.2 REST API

#### 公开端点
| 端点 | 说明 |
|------|------|
| `GET /healthz` | 健康检查 (后端数、客户端数、频道列表) |
| `GET /api/meta` | 网关元数据 (认证状态、公开 URL) |
| `GET /api/media/:filename` | 下载已上传的媒体文件 |

#### 管理端点 (需 Admin Token 或 Logto JWT)
| 端点 | 说明 |
|------|------|
| `GET /api/state` | 完整中继状态 |
| `POST /api/channels` | 创建/更新频道 |
| `DELETE /api/channels/:id` | 删除频道 |
| `POST /api/channels/:id/users` | 创建/更新用户 |
| `DELETE /api/channels/:id/users/:senderId` | 删除用户 |
| `GET /api/messages` | 查询消息日志 (分页) |
| `GET /api/messages/stats` | 消息统计 (按小时/模型/频道) |
| `GET /api/messages/sync` | 离线消息同步 |
| `POST /api/media/upload` | 上传媒体文件 (支持 multipart、base64、raw) |
| `GET/PUT /api/settings` | 通用设置 (CORS 白名单) |
| `GET/PUT /api/ai-settings` | AI/LLM 配置 |
| `GET/POST/DELETE /api/relay-nodes` | 多节点管理 |

#### AI 辅助端点
| 端点 | 说明 |
|------|------|
| `POST /api/suggestions` | AI 生成后续建议或回复草稿 |
| `POST /api/voice-refine` | AI 优化语音转录文本 |
| `POST /api/chat` | 同步 REST 聊天 (无需 WebSocket, 2 分钟超时) |

### 4.3 认证体系

| 层级 | 认证方式 | 用途 |
|------|----------|------|
| 管理员 | `X-Relay-Admin-Token` 请求头 | 所有管理 API |
| Logto JWT | `Authorization: Bearer <JWT>` | 替代管理员 Token |
| 频道用户 | `?token=<token>` 查询参数 | 客户端 WebSocket、消息同步 |

### 4.4 安全机制

- **HTTP 限流**: 每 IP 100 请求/分钟
- **WebSocket 限流**: 每连接 30 消息/分钟
- **连接数限制**: 每 IP 最多 50 个 WebSocket 连接
- **时序安全比较**: 所有 Token 比较使用 `timingSafeEqual`
- **CSP 安全头**: 严格的 Content-Security-Policy
- **HSTS**: 强制 HTTPS

### 4.5 数据持久化

| 表 | 用途 |
|----|------|
| `cl_channels` | 频道配置 (channelId, label, secret) |
| `cl_channel_users` | 用户配置 (token, chatId, allowAgents) |
| `cl_messages` | 消息日志 (去重索引: messageId + direction) |
| `cl_settings` | 键值配置 (AI 设置、CORS) |
| `cl_relay_nodes` | 多节点注册 |

**消息持久化流程**: 异步写入 Supabase → 失败重试 (最多 2 次) → 死信队列 (`persist-failures.jsonl`)

### 4.6 Admin UI

基于 React 19 + shadcn/ui 的管理界面，支持:
- 频道/用户 CRUD
- 连接状态监控
- QR 码生成
- 多节点切换
- AI 设置管理
- Logto SSO 登录

---

## 五、Channel Plugin (`@restry/clawline`)

**用途**: OpenClaw 插件，处理消息路由、Agent 管理和高级通信功能。

### 5.1 连接模式

| 模式 | 端口 | 说明 |
|------|------|------|
| `websocket` | 默认 8080 | 直接 WebSocket 服务 |
| `relay` | - | 通过 Gateway 中继 |
| `webhook` | 默认 3000 | HTTP Webhook 回调 |

### 5.2 消息处理管线

```
客户端消息 → Zod 验证 → 去重检查 (200 条 LRU) → 发送方白名单校验
→ 媒体下载 & 转录 → 历史记录 → Agent 路由 → AI 回复
→ 流式推送 (text.delta / thinking.* / stream.resume)
```

### 5.3 支持的消息类型

**入站**: text, image, voice, audio, file  
**出站**: text, markdown, image, voice, audio, file

### 5.4 完整功能清单

#### 核心消息功能
| 功能 | 说明 |
|------|------|
| 消息收发 | 文本、多媒体、文件 |
| 消息编辑 | 原地编辑、编辑历史 |
| 消息删除 | 软删除/硬删除 |
| 引用回复 | 带 parentId 的线程回复 |
| 表情回应 | 添加/移除 emoji 回应 |
| 消息转发 | 单条/批量转发到其他对话 |
| 消息置顶 | 每对话最多 3 条，支持过期 |
| 消息收藏 | 个人收藏，支持备注 |
| 消息搜索 | 全文检索、多条件过滤、相关性评分 |

#### 状态与通知
| 功能 | 说明 |
|------|------|
| 送达状态 | sent → delivered → read → failed |
| 已读回执 | 谁在何时已读 |
| 输入指示器 | 5 秒自动超时 |
| 用户在线状态 | online/offline/away/busy，30 秒心跳 |

#### 流式与实时
| 功能 | 说明 |
|------|------|
| 流式文本 | `text.delta` 逐字推送 |
| 思考状态 | `thinking.start/update/end` |
| 断点续传 | 30 分钟 TTL 的流状态缓存 |
| 工具调用广播 | `tool.start/end`，敏感数据自动脱敏 |

#### Agent 管理
| 功能 | 说明 |
|------|------|
| Agent 列表 | 名称、模型、技能、状态 |
| Agent 上下文 | SOUL.md, IDENTITY.md, USER.md 等文件 |
| Agent 选择 | 每会话可切换 |
| Agent 委托 | `<<DELEGATE:agentId>>` 指令，最大 3 层递归 |
| 服务端建议 | AI 生成后续问题建议 |

#### 群组功能
| 功能 | 说明 |
|------|------|
| 创建群组 | 群名、描述、头像 |
| 成员管理 | 添加/移除/角色变更 (owner/admin/member) |
| 群设置 | 是否允许成员邀请/发言、最大人数、是否公开 |

#### 媒体与文件
| 功能 | 说明 |
|------|------|
| 媒体下载 | URL 下载、大小限制校验 |
| 文件传输进度 | 上传/下载进度追踪 (0-100%) |
| 中继上传 | 自动上传到 Relay 或回退 base64 |
| 语音转录 | Faster-Whisper 集成，支持语言检测 |

#### 协议事件 (50+ 事件类型)

**消息**: message.receive, message.send, message.edit, message.delete, message.forward, message.pin, message.unpin  
**Agent**: agent.list.get, agent.list, agent.context.get, agent.context, agent.select, agent.selected  
**历史**: history.get, history.sync  
**会话**: conversation.list.get, conversation.list  
**连接**: connection.open, connection.close, channel.status.get, channel.status  
**实时**: typing, thinking.*, text.delta, stream.resume, ping, pong  
**反应**: reaction.add, reaction.remove  
**状态**: status.sent, status.delivered, status.read, status.failed  
**在线**: user.status  
**文件**: file.progress, file.transfer  
**群组**: group.action  
**建议**: suggestion.get, suggestion.response  
**工具**: tool.start, tool.end  

---

## 六、Client Web (Web 端)

**用途**: 基于 React 19 的 Progressive Web App，提供完整的聊天界面。

### 6.1 技术栈
React 19 + TypeScript 5.8 + Vite 6 + Tailwind CSS v4 + React Router v7

### 6.2 核心页面

| 页面 | 功能 |
|------|------|
| Onboarding | 首次使用引导、Logto OAuth 登录 |
| ChatList | Agent 列表 (列表/网格视图)、自定义名称和头像、收藏排序、消息预览 |
| ChatRoom | 主聊天界面 — 消息发送/接收、流式渲染、24+ 斜杠命令、工具调用 UI、线程分组、表情回应、引用回复、编辑删除、语音输入、AI 建议、分屏视图 |
| Dashboard | 服务器状态监控、内存指标、Agent 统计、活动时间线 |
| AgentInbox | 统一通知中心、跨连接 Agent 状态汇总、未读计数 |
| Search | 全局消息搜索、多条件过滤、结果高亮 |
| Profile | 用户信息、深色模式、通知设置、服务器管理 |
| Preferences | 高级设置 — 流式输出、AI 建议提示语、语音优化、配置导出/导入 |
| Pairing | 添加服务器 — URL 解析、QR 扫描、手动表单、openclaw:// 自定义协议 |

### 6.3 关键特性

- **连接池**: 最多 6 个并发 WebSocket 连接
- **离线队列**: 最多 200 条待发消息 (sessionStorage)
- **PWA**: Service Worker 缓存、离线访问、安装引导
- **深色模式**: 自动/始终深色/始终浅色
- **响应式**: 移动端 (<1024px) / 桌面端 (≥1024px) / 超宽屏分屏 (≥1440px)
- **Markdown 渲染**: 语法高亮 (12+ 语言)、DOMPurify 消毒
- **Logto OAuth**: 可选的第三方登录

### 6.4 斜杠命令 (24+)

| 分类 | 命令 |
|------|------|
| 基础 | /help, /status, /whoami |
| 会话 | /new, /reset, /model, /models, /compact, /context, /export |
| 指令 | /think, /verbose, /reasoning, /elevated, /exec, /queue |
| 高级 | /usage, /tts, /skill:* |

---

## 七、Client WeChat (微信小程序)

**用途**: 微信原生小程序，提供与 Web 端对等的聊天体验。

### 7.1 页面结构

| 页面 | 功能 |
|------|------|
| Entry | 路由入口，检查配对状态 |
| Onboarding | 功能展示轮播 |
| Pairing | 服务器连接 — URL/QR/手动输入 |
| Agents | Agent 列表 — 搜索、网格/列表视图、多服务器分组 |
| Chat Room | 主聊天 — 流式消息、思考状态、回复、编辑、删除、反应、语音录制、图片发送、AI 建议、斜杠命令 |
| Dashboard | 服务器状态监控 |
| Search | 本地全文消息搜索 |
| Profile | 服务器管理、通知设置、深色模式 |
| Preferences | AI 配置 (模型/温度/提示语) |

### 7.2 关键特性

- **WebSocket 连接池**: 页面切换时复用连接 (15 秒宽限期)
- **离线队列**: 最多 50 条待发消息 (LRU + wx.Storage)
- **消息持久化**: 每 Agent 最多 200 条本地消息
- **流式渲染**: 逐字显示 AI 回复
- **思考状态**: 动态标签 (思考中 → 分析中 → 整理中)
- **语音录制**: AAC 格式，最长 60 秒
- **组件框架**: glass-easel 高性能引擎
- **主题**: 支持深色/浅色模式

### 7.3 Web vs 小程序功能对比

| 功能 | Web | 小程序 |
|------|-----|--------|
| 多服务器管理 | ✅ | ✅ |
| 流式消息 | ✅ | ✅ |
| 思考状态 | ✅ | ✅ |
| 表情回应 | ✅ | ✅ |
| 引用回复 | ✅ | ✅ |
| 消息编辑/删除 | ✅ | ✅ |
| 语音输入 | ✅ (Volc ASR) | ✅ (原生录音) |
| 图片发送 | ✅ | ✅ |
| 斜杠命令 | ✅ (24+) | ✅ (20+) |
| AI 建议 | ✅ | ✅ |
| 离线队列 | ✅ (200 条) | ✅ (50 条) |
| 分屏视图 | ✅ (>1440px) | ❌ |
| Agent Inbox | ✅ | ❌ |
| 全局搜索 | ✅ (Supabase) | ✅ (本地) |
| PWA 安装 | ✅ | N/A |
| Logto 登录 | ✅ | ❌ |
| QR 扫码配对 | ✅ (摄像头) | ✅ (微信扫码) |
| 配置导出/导入 | ✅ | ❌ |

---

## 八、Browser Agent (Chrome 扩展)

**用途**: AI 驱动的浏览器自动化工具，可与 Clawline 客户端集成进行 UI 测试。

### 8.1 功能

- **Tab 控制**: 导航、点击、填表、截图
- **内容提取**: 页面文本、无障碍树、DOM 分析
- **HTTP Hook API**: 本地 127.0.0.1:4821 端口提供 REST 接口
- **Side Panel**: 活动日志和操作界面

### 8.2 API 端点

| 端点 | 说明 |
|------|------|
| `GET /health` | 健康检查 |
| `POST /navigate` | 导航到 URL |
| `POST /click` | 点击元素 |
| `POST /fill` | 填写表单 |
| `POST /screenshot` | 截图 |
| `POST /evaluate` | 执行 JavaScript |
| `GET /content` | 提取页面内容 |

---

## 九、部署选项

### Gateway 部署

| 方式 | 适用场景 |
|------|----------|
| `npm start` | 本地开发 |
| Docker | 生产部署 |
| Caddy 反向代理 | HTTPS + WSS |
| Nginx 反向代理 | 替代 Caddy |

### Client Web 部署

| 方式 | 说明 |
|------|------|
| Vercel | 静态 SPA，零配置 |
| Docker (Nginx) | 自托管 |
| PM2 Serve | 轻量级静态服务 |
| Caddy/Nginx | 自定义反向代理 |

### Client WeChat 部署
通过微信开发者工具上传，审核后发布。

---

## 十、数据流总览

```
用户在 Web/小程序 输入消息
       │
       ▼
  SDK / clawChannel
  (构建 message.receive 帧)
       │
       ▼ WebSocket
  Gateway /client
  (认证 → 限流 → 持久化到 Supabase)
       │
       ▼ relay.client.event
  Gateway /backend
       │
       ▼ WebSocket
  Channel Plugin
  (Zod 验证 → 去重 → 媒体处理 → Agent 路由)
       │
       ▼
  OpenClaw AI Agent
  (推理 → 工具调用 → 生成回复)
       │
       ▼ 流式回复
  Channel Plugin
  (text.delta / thinking.* 事件)
       │
       ▼ relay.server.event
  Gateway
  (持久化 → 广播到所有兄弟连接)
       │
       ▼ WebSocket
  客户端
  (流式渲染 → 更新 UI)
```
