# 功能说明

本文档介绍 OpenClaw Client Web 的核心功能和特性。

## 支持的消息类型

### 文本消息

- 纯文本消息发送和接收
- 支持 Markdown 渲染 (代码高亮、列表、链接等)
- 消息编辑 (`message.edit`)
- 消息删除 (`message.delete`)
- 消息回复 (带 `parentId` 的引用回复)

### 文件消息

- 文件上传 (通过 HTTP POST `/api/media/upload`)
- 支持 PDF、Word、Excel 等文档格式
- 发送时包含 `mediaUrl`、`mimeType` 等元数据

### 图片消息

- 图片上传和预览
- 支持 PNG、JPG、GIF、WebP 格式
- 消息类型标记为 `image`

### 音频/语音消息

- 音频文件上传
- 支持常见音频格式
- 消息类型标记为 `voice` 或 `audio`

### 消息反应 (Reactions)

- 对消息添加 Emoji 反应
- 支持移除已添加的反应
- 实时同步反应状态

## 流式输出

### 实现机制

AI 回复支持流式输出：
- 通过 WebSocket 接收分片的 `message.stream` 数据包
- 消息记录中 `isStreaming: true` 标识进行中的流式消息
- 流式完成后更新为完整消息

### 流式状态处理

```typescript
// 消息记录结构
type MessageRecord = {
  id: string;
  sender: 'user' | 'ai';
  text: string;           // 累积的文本内容
  isStreaming?: boolean;  // 是否正在流式输出
  // ...
}
```

### 打字指示器 (Typing Indicator)

- 实时显示 Agent 正在输入的状态
- WebSocket `typing` 事件通知
- 5 秒自动过期机制

## 消息历史和断线续传

### 本地存储

消息历史使用 **IndexedDB** 持久化存储：
- 数据库名：`clawline-messages`
- 存储对象：`messages`
- 支持大容量本地存储

### 索引结构

```
by-agent          → [connectionId, agentId]
by-agent-timestamp → [connectionId, agentId, timestamp]
by-timestamp      → timestamp
by-text           → text (全文搜索)
by-scope          → [connectionId, scopeId]
by-scope-timestamp → [connectionId, scopeId, timestamp]
```

### 消息加载

- 默认加载最近 **200 条** 消息
- 支持按 Agent、连接、时间范围筛选
- 支持全文搜索

### 断线续传

- WebSocket 断开后自动重连 (最多 6 次尝试)
- 重连成功后同步历史消息
- 连接状态监听：`disconnected → connecting → connected → reconnecting`

### 从 LocalStorage 迁移

首次启动时自动迁移旧版 LocalStorage 消息到 IndexedDB。

## 移动端适配

### 响应式布局

- **移动端** (< 1024px)：单屏堆叠导航 + 底部 Tab Bar
- **桌面端** (≥ 1024px)：侧边栏 + 主内容区分屏布局
- **超宽屏** (≥ 1440px)：支持分屏模式，同时显示两个聊天窗口

### PWA 特性

- 独立安装到主屏幕
- 全屏运行 (standalone 模式)
- iOS 安全区域适配 (`env(safe-area-inset-*)`)
- iOS 安装引导提示

### 手势交互

- iOS 风格的滑动返回手势 (`useSwipeBack`)
- 触控优化的按钮尺寸和间距
- 禁用下拉刷新防止误操作

### 性能优化

- 组件懒加载 (`React.lazy`)
- 虚拟化长列表 (大对话场景)
- 动画性能优化 (`motion/react` + `will-change`)

## 多服务器连接

### 连接池管理

- 支持配置多个服务器连接
- 同时保持最多 **3 个活跃 WebSocket 连接**
- 空闲连接 **5 分钟** 自动断开

### 连接切换

- Profile 页面管理连接列表
- 点击切换活跃服务器
- 支持编辑、删除、排序

## Agent 管理

### Agent 列表

- 自动获取服务端 Agent 列表 (`agent.list.get`)
- 显示 Agent 头像、名称、模型、状态
- 支持选择默认 Agent

### Agent 上下文

- 查看 Agent 的上下文文件 (`agent.context.get`)
- 显示 SOUL.md、USER.md、TOOLS.md 等配置

### 会话管理

- 按 Agent 分组显示会话
- 支持多会话切换
- 会话列表请求 (`conversation.list.get`)

## 仪表盘 (Dashboard)

### 实时状态

- 服务器连接状态
- Relay 模式和健康检查
- 在线 Agent 数量
- 连接统计 (Chat 数、Socket 数)

### 今日统计

- 发送/接收消息计数
- 活跃 Agent 列表
- 最近活动时间线

### 系统信息

- 服务端 Node.js 版本
- 平台信息
- 内存使用
- 运行时长

## 搜索功能

- 全局消息搜索
- 按 Agent、连接、时间筛选
- 支持命令过滤 (`/` 开头的命令)

## 认证系统

集成 **Logto** OAuth 认证：
- 登录/注销流程
- 用户信息显示 (头像、名称)
- Token 自动刷新

## 通知

### 推送通知

- 支持 Web Push API
- 用户可开启/关闭
- 需要用户授权

### 应用内通知

- 可独立开关
- 适用于 PWA 场景

## ACP 线程会话

### ThreadSessionCard

当 Agent 启动 ACP 子会话时，消息以可折叠的卡片形式展示：

- 标题栏显示 ACP 会话信息：Agent 名称、运行模式（persistent/ephemeral）
- 该线程的所有消息（Agent 回复和用户发送）归入同一卡片
- 活跃 session 显示呼吸灯动画和关闭按钮
- 点击关闭按钮发送 `/acp close` 结束会话
- 支持展开/折叠

### ACP Session Bar

输入框上方显示 session 切换条（仅有 ACP session 时可见）：

- 水平滚动的 chip 列表，显示 mode + sessionId 片段 + 消息数
- 点击 chip 切换 `activeThreadId`，后续消息路由到该 session
- 当前活跃 session chip 高亮
- 从消息历史中自动提取，刷新页面后仍然显示

## API Direct 标记

通过 HTTP API (`POST /api/chat`) 发送的消息会在界面上显示 "API direct" badge，用于区分 WebSocket 实时消息和 API 调用产生的消息。

标记依据：消息的 `meta.source` 字段为 `"api"`。

## Phase-aware Streaming

流式输出现在区分思考阶段和回复阶段：

- **思考文本**：Agent 的推理过程，以 thinking 事件独立展示
- **回复文本**：最终回复内容，通过 `text.delta` 事件流式输出
- 两个阶段在 UI 上分离展示，用户可以清晰看到 Agent 的推理过程

支持的事件类型：
- `thinking.start` — 开始思考
- `thinking.update` — 思考内容更新
- `thinking.end` — 思考结束
- `text.delta` — 回复文本增量

## 跨设备消息同步

消息支持跨设备和跨会话同步：

- 进入 ChatRoom 时自动从远端同步最新消息
- 监听 `message.receive` 事件，接收其他客户端发送的消息
- 消息合并策略（`mergeMessages`）确保不重复
- 配合 IndexedDB 本地缓存实现离线可用 + 在线同步

## 动态 Quick Commands

快捷命令列表按使用频率动态排序：

- 最近使用过的命令排列在前
- 命令搜索和过滤
- 自动发现 Agent 支持的 Skill 命令

## 无障碍支持

- 语义化 HTML 结构
- 键盘导航支持
- `prefers-reduced-motion` 动画减弱
- 高对比度文本