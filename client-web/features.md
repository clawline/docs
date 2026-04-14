# 功能说明

## 消息类型

### 文本消息

- 纯文本收发，支持 Markdown 渲染（代码高亮、列表、链接等）
- 消息编辑（`message.edit`）、删除（`message.delete`）、引用回复（`parentId`）

### 文件消息

- 通过 HTTP POST `/api/media/upload` 上传，支持 PDF、Word、Excel 等格式
- 携带 `mediaUrl`、`mimeType` 等元数据

### 图片消息

- 图片上传与预览，支持 PNG、JPG、GIF、WebP

### 语音消息

- 音频文件上传，消息类型为 `voice` 或 `audio`

### 消息回应

- 添加/移除 emoji 回应，实时同步

## 流式输出

AI 回复支持流式输出：

- 通过 WebSocket 接收分块 `message.stream` 数据
- `isStreaming: true` 标记进行中的流

```typescript
type MessageRecord = {
  id: string;
  sender: 'user' | 'ai';
  text: string;           // accumulated text content
  isStreaming?: boolean;   // whether the message is currently streaming
}
```

### 阶段感知流式

流式输出区分思考和回复阶段：

- **思考文本**: 推理过程，通过 `thinking.start` / `thinking.update` / `thinking.end` 事件展示
- **回复文本**: 最终响应，通过 `text.delta` 事件流式输出
- UI 中两个阶段视觉分离

### 输入状态指示

- 实时显示 Agent 输入状态，WebSocket `typing` 事件通知，5 秒自动过期

## 消息历史与重连

### 远程存储（Supabase）

消息存储在 Supabase `cl_messages` 表中，通过 Gateway HTTP API 访问，无本地数据库。

- **启动时** `messageCache.warmCache()` 拉取每个连接最近 5 小时的消息，缓存到内存
- **使用中** WebSocket 事件保持内存缓存最新
- **进入聊天** 从内存缓存加载（零额外 HTTP 请求）
- **上滑加载** `fetchOlderMessages()` 从 Supabase 分页拉取

### 重连机制

- WebSocket 断连后自动重连（最多 6 次）
- 重连后从 Supabase 同步缺失消息
- 连接状态生命周期: `disconnected -> connecting -> connected -> reconnecting`

## Agent Inbox

跨所有连接的统一通知中心（`screens/AgentInbox.tsx`）。

### 状态追踪

- **pending_reply** -- Agent 有未读/未回复消息
- **thinking** -- Agent 正在处理
- **idle** -- 无待处理活动
- **offline** -- 连接已断开

### 核心能力

- 聚合所有 WebSocket 连接的 Agent 到单一列表
- 显示未读计数、最后消息预览
- 展开卡片即标记为已读
- 按最近消息排序，过滤系统消息
- 跨连接 Agent 去重，状态持久化到 localStorage
- "建议回复"按钮通过 Gateway `/api/suggestions` 生成 AI 草稿
- 内联快速回复输入框

### 通知

- Agent 回复时播放通知音（当前未查看该聊天时）
- 窗口隐藏/失焦时发送浏览器推送通知

## 离线消息队列（Outbox）

WebSocket 不可用时，消息排队到离线发件箱（`services/outbox.ts`）。

- 最多 **200 条**消息，存储在内存 `Map` + `sessionStorage`
- 连接恢复后自动发送
- 队列满时淘汰最旧消息，派发 `openclaw:outbox-overflow` 事件
- 支持文本、媒体、文件及引用回复

## AI 建议与回复草稿

通过 Gateway `/api/suggestions` 端点生成（`services/suggestions.ts`）。

### 智能建议

- AI 回复后，客户端发送最近 6 条消息（每条截断 300 字符）到 Gateway
- 返回短跟进建议，显示为聊天下方的可点击标签
- 结果按内容哈希缓存，去重并发请求
- 可在偏好设置中开关，支持自定义 prompt

### 回复草稿

- Agent Inbox 中的"建议回复"按钮，发送最近 10 条消息，`mode: 'reply'`
- 支持独立的自定义 prompt

### 语音文本优化

- 语音转写后可通过 AI 优化文本再发送
- 调用 Gateway `/api/voice-refine` 端点，可在偏好设置中开关

## 消息搜索

全局全文搜索（`screens/Search.tsx`）。

- 实时搜索，结果按 Agent 分组，显示匹配高亮
- 点击结果直接跳转到相关聊天
- 过滤器: 全部 / 已发送 / 已接收 / 图片 / 语音 / 命令
- 排序: 相关度 / 时间线

## 自定义 Agent 头像和名称

- 自定义名称存储在 localStorage `clawline.agentNames`，全应用生效
- 自定义头像存储在 localStorage `openclaw.agentAvatars`
- 名称变更通过 `openclaw:agent-names-updated` 事件跨组件同步

## Agent 收藏与排序

- 收藏 Agent 置顶到"收藏"分区，持久化到 localStorage `clawline.agentFavorites`
- 拖拽排序模式，使用 Motion `Reorder.Item`，顺序按连接持久化到 `clawline.agentOrder.{connectionId}`
- 收藏全局生效，排序按连接独立

## 分屏视图

宽屏双面板聊天（`App.tsx`）。

- 视口 **>= 1440px** 时激活，显示两个 ChatRoom 并排
- 聊天头部的切换按钮控制开关
- 状态持久化到 localStorage（`openclaw.split` 前缀）
- 窄屏时自动回退单面板

## 偏好设置导出/导入

所有用户设置可导出/导入为 JSON 文件（`screens/Preferences.tsx`）。

- 导出 18 个固定配置项 + 动态连接配置（Agent 排序、分屏状态等）
- 导入后自动写入 localStorage 并刷新页面

## 语音输入

使用浏览器原生 **Web Speech API**（Chrome、Edge、Safari 支持）。

- 连续识别模式，支持中间结果和最终结果
- 默认语言 `zh-CN`，自动重启识别保持不中断
- 火山引擎 ASR 配置已存储，待后续 Gateway 代理集成
- 转写文本可选 AI 优化后再发送

## 移动端适配

### 响应式布局

- **移动端** (< 1024px): 全屏堆叠导航 + 底部标签栏
- **桌面端** (>= 1024px): 侧边栏 + 主内容区，可调整宽度
- **超宽屏** (>= 1440px): 分屏模式

### PWA 功能

- 可安装到主屏幕，独立模式全屏运行
- iOS 安全区域适配（`env(safe-area-inset-*)`）
- iOS 安装引导（`useIOSPWA`）
- Service Worker 构建哈希缓存失效
- `usePWAUpdate` 检测新版本并提示更新

### 手势交互

- iOS 风格滑动返回（`useSwipeBack`）
- 触控优化按钮尺寸
- 禁用下拉刷新防止误触

### 性能优化

- `React.lazy` 懒加载页面
- 虚拟化长列表
- `motion/react` + `will-change` 动画优化
- 手动分包: react-vendor、motion、markdown、highlight

## 多服务器连接

- 配置多个服务器连接，最多 **3 个并发活跃 WebSocket 连接**
- 空闲连接 **5 分钟**后自动断开
- Profile 页面管理连接列表，支持编辑、删除、排序

## Agent 管理

- 自动获取服务器 Agent 列表（`agent.list.get`），显示头像、名称、模型和状态
- 查看 Agent 上下文文件（SOUL.md、USER.md、TOOLS.md 等）
- 按 Agent 分组对话，支持多对话切换

## Dashboard

### 实时状态

- 服务器连接状态、Relay 模式、健康检查
- 在线 Agent 数量、连接统计

### 今日统计

- 收发消息数量、活跃 Agent 列表、近期活动时间线

### 系统信息

- Node.js 版本、平台信息、内存使用、运行时长

## 认证

集成 **Logto** OAuth: 登录/登出、用户信息展示、自动 Token 刷新。

## 通知

- **推送通知**: Web Push API，用户可开关，需浏览器授权
- **应用内通知**: 独立开关，适合 PWA 场景

## ACP 线程会话

### ThreadSessionCard

Agent 发起 ACP 子会话时，消息显示为可折叠卡片：

- 头部显示 Agent 名称、运行模式（persistent/ephemeral）
- 活跃会话显示呼吸动画和关闭按钮（发送 `/acp close`）

### ACP Session Bar

输入框上方的会话切换栏（仅 ACP 会话存在时显示）：

- 水平滚动标签列表，显示模式 + sessionId 片段 + 消息数
- 点击标签切换 `activeThreadId`，后续消息路由到该会话

## API Direct 标记

通过 HTTP API（`POST /api/chat`）发送的消息在 UI 显示 "API direct" 标记，区别于 WebSocket 实时消息。检测依据: `meta.source === "api"`。

## 跨设备消息同步

- 进入 ChatRoom 时自动从服务器同步最新消息
- 监听 `message.receive` 事件接收其他客户端发送的消息
- `mergeMessages` 合并策略防止重复
- Supabase 远程存储 + 内存缓存实现离线可用 + 在线同步

## 动态快捷命令

- 按使用频率动态排序，最近使用的命令优先
- 支持命令搜索和过滤
- 自动发现 Agent 支持的技能命令

## 无障碍

- 语义化 HTML 结构
- 键盘导航支持
- `prefers-reduced-motion` 动画减弱
- 高对比度文本
