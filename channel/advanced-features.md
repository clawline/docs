# 高级功能

---

## 目录

1. [消息转发](#1-消息转发)
2. [消息置顶与收藏](#2-消息置顶与收藏)
3. [用户在线状态](#3-用户在线状态)
4. [群组管理](#4-群组管理)
5. [消息搜索](#5-消息搜索)
6. [文件传输](#6-文件传输)
7. [消息状态与已读回执](#7-消息状态与已读回执)
8. [消息编辑与删除](#8-消息编辑与删除)
9. [Agent 委派](#9-agent-委派)
10. [工具调用事件](#10-工具调用事件)
11. [建议回复](#11-建议回复)
12. [流式断点续传](#12-流式断点续传)
13. [语音转写](#13-语音转写)

---

## 1. 消息转发

将消息从一个会话转发到另一个会话，保留原始发送者信息。

```typescript
type ForwardedMessage = {
  originalMessageId: string;
  originalChatId: string;
  originalSenderId: string;
  originalSenderName?: string;
  forwardedBy: string;
  forwardedByName?: string;
  targetChatId: string;
  timestamp: number;
  content: string;
  messageType: "text" | "image" | "voice" | "audio" | "file";
  mediaUrl?: string;
  mimeType?: string;
};
```

### API

| 函数 | 说明 |
|---|---|
| `forwardMessage(params)` | 转发单条消息，内容前缀 `[Forwarded from <sender>]` |
| `forwardMultipleMessages(params)` | 按顺序转发多条消息到目标会话 |
| `getForwardedMessages({ chatId, originalMessageId? })` | 获取转发记录，可按原消息 ID 过滤 |
| `broadcastForwardEvent({ cfg, chatId, forwarded })` | 向目标会话广播 `message.forward` 事件 |
| `handleForwardRequest({ cfg, forward })` | 服务端处理：转发并广播 |

### 事件

| 事件 | 方向 | 载荷 |
|---|---|---|
| `message.forward` | Server -> Client | `ForwardedMessage` |

> 文本消息使用 `sendMessageGeneric`；媒体消息使用 `sendMediaGeneric`；文件类型回退为包含 URL 的文本消息。

---

## 2. 消息置顶与收藏

置顶是会话级别（所有成员可见），收藏是用户私有书签。

```typescript
type PinnedMessage = {
  messageId: string;
  chatId: string;
  pinnedBy: string;
  pinnedAt: number;
  expiresAt?: number;
};

type StarredMessage = {
  messageId: string;
  chatId: string;
  starredBy: string;
  starredAt: number;
  note?: string;
};
```

### 置顶 API

| 函数 | 说明 |
|---|---|
| `pinMessage(params)` | 置顶消息，每个会话最多 3 条，超出自动移除最早的。支持 `expiresAt` 自动取消 |
| `unpinMessage({ messageId, chatId })` | 取消置顶 |
| `getPinnedMessages(chatId)` | 获取有效置顶列表（排除过期） |
| `isMessagePinned({ messageId, chatId })` | 检查是否已置顶 |
| `handlePinMessage(params)` | 服务端处理：置顶并广播 |
| `handleUnpinMessage(params)` | 服务端处理：取消置顶并广播 |

### 收藏 API

| 函数 | 说明 |
|---|---|
| `starMessage(params)` | 收藏消息，支持附注 |
| `unstarMessage(params)` | 取消收藏 |
| `getStarredMessages({ userId, chatId? })` | 获取用户收藏列表 |
| `isMessageStarred({ messageId, chatId, userId })` | 检查是否已收藏 |
| `getStarredCount(userId)` | 获取收藏总数 |

### 事件

| 事件 | 方向 | 载荷 |
|---|---|---|
| `message.pin` | Server -> Client | `PinnedMessage` |
| `message.unpin` | Server -> Client | `PinnedMessage` |

收藏是私有操作，不触发广播。

---

## 3. 用户在线状态

基于心跳的在线/离线状态追踪，30 秒无心跳自动离线。

```typescript
type UserStatus = "online" | "offline" | "away" | "busy";

type UserPresence = {
  userId: string;
  userName?: string;
  status: UserStatus;
  lastSeen?: number;
  statusMessage?: string;
  timestamp: number;
};
```

### API

| 函数 | 说明 |
|---|---|
| `updateUserStatus(params)` | 设置状态。设为 `"online"` 时启动 30 秒心跳计时器 |
| `sendHeartbeat({ userId, userName? })` | 重置心跳计时器 |
| `getUserStatus(userId)` | 获取当前状态 |
| `getOnlineUsers()` | 获取所有在线用户 |
| `getLastSeen(userId)` | 获取最后在线时间 |
| `setUserOffline({ userId })` | 强制离线并清除计时器 |
| `handleUserConnect({ cfg, userId })` | WebSocket 连接时调用：设为在线并广播 |
| `handleUserDisconnect({ cfg, userId })` | WebSocket 断开时调用：设为离线并广播 |

### 事件

| 事件 | 方向 | 载荷 |
|---|---|---|
| `user.status` | Server -> Client | `UserPresence` |

---

## 4. 群组管理

创建和管理群聊，支持角色权限控制。

```typescript
type GroupRole = "owner" | "admin" | "member";

type GroupMember = {
  userId: string;
  userName?: string;
  role: GroupRole;
  joinedAt: number;
  invitedBy?: string;
};

type GroupInfo = {
  groupId: string;
  groupName: string;
  description?: string;
  avatar?: string;
  createdBy: string;
  createdAt: number;
  members: Map<string, GroupMember>;
  settings: GroupSettings;
};

type GroupSettings = {
  allowMemberInvites: boolean;   // 默认: false
  allowMemberMessages: boolean;  // 默认: true
  onlyAdminsCanEdit: boolean;    // 默认: true
  maxMembers: number;            // 默认: 256
  isPublic: boolean;             // 默认: false
};

type GroupAction = {
  type: "group.create" | "member.add" | "member.remove"
      | "member.promote" | "member.demote"
      | "group.update" | "group.delete" | "settings.update";
  groupId: string;
  actorId: string;
  targetUserId?: string;
  data?: unknown;
  timestamp: number;
};
```

### API

| 函数 | 说明 |
|---|---|
| `createGroup(params)` | 创建群组，创建者为 `"owner"` |
| `addGroupMember(params)` | 添加成员，群满时抛出异常 |
| `removeGroupMember(params)` | 移除成员，不可移除 owner |
| `changeGroupMemberRole(params)` | 升级为 `"admin"` 或降级为 `"member"`，不可修改 owner |
| `updateGroupSettings(params)` | 更新群组设置 |
| `updateGroupInfo(params)` | 更新名称、描述、头像 |
| `getGroupInfo(groupId)` | 获取群组信息 |
| `getUserGroups(userId)` | 获取用户所属群组列表 |
| `isGroupAdmin({ groupId, userId })` | 检查是否为管理员或群主 |
| `handleGroupAction({ cfg, action })` | 统一处理入口，除 `group.create` 外需管理员权限 |

### 事件

| 事件 | 方向 | 载荷 |
|---|---|---|
| `group.action` | Server -> Client | `GroupAction` |

---

## 5. 消息搜索

基于内存索引的全文搜索，支持相关性评分、过滤和分页。

```typescript
type SearchQuery = {
  query: string;
  chatId?: string;
  senderId?: string;
  messageType?: "text" | "image" | "voice" | "audio" | "file";
  startDate?: number;
  endDate?: number;
  limit?: number;    // 默认: 50
  offset?: number;   // 默认: 0
};

type SearchResult = {
  message: InboundMessage;
  score: number;        // 0-1
  highlights?: string[];
};

type SearchResponse = {
  results: SearchResult[];
  total: number;
  query: SearchQuery;
  timestamp: number;
};
```

### API

| 函数 | 说明 |
|---|---|
| `indexMessage(message)` | 将消息加入搜索索引 |
| `removeMessageFromIndex({ messageId, chatId })` | 从索引移除 |
| `searchMessages(query)` | 全功能搜索，按评分降序 |
| `searchByContent({ content, chatId?, limit? })` | 按内容搜索 |
| `searchBySender({ senderId, chatId?, limit? })` | 按发送者搜索 |
| `searchByDateRange({ startDate, endDate, chatId?, limit? })` | 按时间范围搜索 |
| `getMessageById(messageId)` | 按 ID 获取消息 |
| `getRecentMessages({ chatId, limit? })` | 获取最近消息（默认 50 条） |
| `clearChatMessages(chatId)` | 清空会话索引 |

### 评分权重

| 信号 | 权重 | 说明 |
|---|---|---|
| 内容匹配 | 1.0 | 大小写不敏感 |
| 发送者名匹配 | 0.5 | |
| 消息 ID 匹配 | 0.3 | |
| 时间衰减 | 0.0-0.2 | 30 天线性衰减 |

---

## 6. 文件传输

文件上传/下载生命周期管理与进度追踪。

```typescript
type FileTransfer = {
  fileId: string;
  chatId: string;
  senderId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  mimeType: string;
  url?: string;
  status: "pending" | "uploading" | "uploaded" | "downloading" | "completed" | "failed";
  progress: number;       // 0-100
  uploadedBytes?: number;
  timestamp: number;
  error?: string;
};

type FileTransferProgress = {
  fileId: string;
  chatId: string;
  progress: number;
  uploadedBytes: number;
  totalBytes: number;
  status: "uploading" | "downloading";
  timestamp: number;
};
```

### API

| 函数 | 说明 |
|---|---|
| `initFileTransfer(params)` | 创建传输记录，状态 `"pending"` |
| `updateFileTransferProgress(params)` | 更新进度（0-100）、状态、URL 或错误 |
| `completeFileTransfer({ fileId, url })` | 标记完成 |
| `failFileTransfer({ fileId, error })` | 标记失败 |
| `getFileTransfer(fileId)` | 获取传输记录 |
| `getChatFileTransfers(chatId)` | 获取会话所有传输记录 |
| `handleFileUpload(params)` | 完整上传流程：初始化 -> 10% 递增进度 -> 完成，全程广播 |
| `handleFileDownload(params)` | 下载文件，默认限制 100 MB |

### 事件

| 事件 | 方向 | 载荷 |
|---|---|---|
| `file.transfer` | Server -> Client | `FileTransfer` |
| `file.progress` | Server -> Client | `FileTransferProgress` |

---

## 7. 消息状态与已读回执

### 简单状态模块 (`message-status.ts`)

每条消息一个状态。

```typescript
type MessageStatus = "sent" | "delivered" | "read" | "failed";

type MessageStatusEvent = {
  messageId: string;
  chatId: string;
  status: MessageStatus;
  timestamp: number;
  error?: string;
};
```

| 函数 | 说明 |
|---|---|
| `updateMessageStatus(params)` | 更新状态并广播 |
| `getMessageStatus({ messageId, chatId })` | 获取当前状态 |
| `handleStatusUpdate(params)` | 处理客户端状态更新 |
| `clearOldMessageStatuses(maxAgeMs?)` | 清理过期状态（默认 24 小时） |

### 用户级状态与已读回执 (`status.ts`)

按用户追踪投递状态，管理群聊已读回执。

```typescript
type MessageStatusUpdate = {
  messageId: string;
  chatId: string;
  senderId: string;
  status: "sent" | "delivered" | "read";
  timestamp: number;
};

type ReadReceipt = {
  messageId: string;
  chatId: string;
  readBy: string;
  readAt: number;
};
```

| 函数 | 说明 |
|---|---|
| `updateMessageStatus(params)` | 记录用户级状态 |
| `markMessageAsRead(params)` | 创建已读回执并更新状态 |
| `getMessageStatus({ messageId, chatId, senderId })` | 获取用户级状态 |
| `getReadReceipts({ messageId, chatId })` | 获取所有已读回执 |
| `getOverallMessageStatus({ messageId, chatId })` | 计算聚合状态（有人已读返回 `"read"`） |

### 事件

| 事件 | 方向 | 载荷 |
|---|---|---|
| `status.sent` | Server -> Client | `MessageStatusEvent` |
| `status.delivered` | Server -> Client | `MessageStatusEvent` / `MessageStatusUpdate` |
| `status.read` | Server -> Client | `MessageStatusEvent` / `MessageStatusUpdate` |
| `status.failed` | Server -> Client | `MessageStatusEvent` |

---

## 8. 消息编辑与删除

支持编辑历史追踪，软删除保留记录，硬删除彻底移除。

```typescript
type MessageEdit = {
  messageId: string;
  chatId: string;
  senderId: string;
  newContent: string;
  editedAt: number;
  editHistory?: Array<{ content: string; editedAt: number }>;
};

type MessageDelete = {
  messageId: string;
  chatId: string;
  senderId: string;
  deleteType: "soft" | "hard";
  deletedAt: number;
};
```

### API

| 函数 | 说明 |
|---|---|
| `editMessage(params)` | 编辑消息，`oldContent` 会追加到编辑历史 |
| `deleteMessage(params)` | 删除消息，默认软删除 |
| `isMessageDeleted({ messageId, chatId })` | 检查是否已删除 |
| `getMessageEditHistory({ messageId, chatId })` | 获取编辑历史 |
| `handleMessageEdit({ cfg, edit })` | 服务端处理：编辑并广播 |
| `handleMessageDelete({ cfg, deletion })` | 服务端处理：删除并广播 |

### 事件

| 事件 | 方向 | 载荷 |
|---|---|---|
| `message.edit` | Server -> Client | `MessageEdit` |
| `message.delete` | Server -> Client | `MessageDelete` |

---

## 9. Agent 委派

Agent 在输出中嵌入委派标签，将任务分派给其他 Agent。

### 标签语法

```
<<DELEGATE:targetAgentId>>发给目标 Agent 的消息<</DELEGATE>>
```

```typescript
type DelegateDirective = {
  targetAgentId: string;
  message: string;
};
```

### API

| 函数 | 说明 |
|---|---|
| `extractDelegateDirectives(text)` | 解析所有委派标签，返回 `{ directives, cleanedText }` |
| `stripDelegateTags(text)` | 从流式片段中去除标签，防止 UI 闪烁 |
| `dispatchDelegates(params)` | 执行委派：为每个指令创建 `delegate-<uuid>` 消息并分发 |

### 递归保护

委派可链式触发（A -> B -> C）。最大深度为 **3**，超出后丢弃。

### 示例

Agent 输出：
```
我请代码审查员检查一下。
<<DELEGATE:code-reviewer>>请审查此函数的安全性：function login(user, pass) { ... }<</DELEGATE>>
```

客户端看到：
```
我请代码审查员检查一下。
[Delegated task to **code-reviewer**]
```

---

## 10. 工具调用事件

向客户端实时广播工具执行状态，用于 UI 指示器（如「正在搜索...」）。

```typescript
interface ToolCallHookEvent {
  toolName?: string;
  name?: string;
  params?: Record<string, unknown>;
  args?: Record<string, unknown>;
  toolCallId?: string;
  result?: unknown;
  agentId?: string;
  chatId?: string;
}
```

### API

| 函数 | 说明 |
|---|---|
| `broadcastToolCallEvent(eventType, hookEvent)` | 广播 `tool.start` 或 `tool.end`，自动处理脱敏、限流和 Agent 隔离 |

### 事件

| 事件 | 方向 | 载荷 |
|---|---|---|
| `tool.start` | Server -> Client | `{ toolName, toolCallId, agentId, timestamp, args? }` |
| `tool.end` | Server -> Client | `{ toolName, toolCallId, agentId, timestamp, completed: true, resultSummary? }` |

### 安全机制

- **敏感值脱敏**: `key`、`token`、`secret`、`password` 等字段替换为 `[redacted]`，超过 200 字符的字符串截断
- **限流**: 每 200ms 最多 10 个事件
- **Agent 隔离**: 无 `agentId` 的事件直接丢弃
- **结果截断**: `resultSummary` 限 300 字符

---

## 11. 建议回复

服务端 AI 生成后续建议。

```typescript
interface SuggestionResult {
  suggestions: string[];
  error?: string;
}
```

### API

| 函数 | 说明 |
|---|---|
| `generateSuggestions(cfg, recentMessages, signal?)` | 基于最近 6 条消息生成 3-4 条建议，支持 `AbortSignal` |

### 事件

| 事件 | 方向 | 载荷 |
|---|---|---|
| `suggestion.get` | Client -> Server | `{ requestId?, messages: Array<{ role, text }> }` |
| `suggestion.response` | Server -> Client | `{ requestId?, suggestions, source: "server", error?, timestamp }` |

### Provider 解析优先级

1. 优先 provider: `azure-foundry`, `sweden-ext`, `us2`, `clawfood`, `liwei-eastus2`, `openai`, `github-copilot`
2. 配置中其他可用 provider
3. 优先模型: `gpt-4.1`, `GPT-4.1`, `gpt-5-mini`, `gpt-4o-mini`, `gpt-4o`, `gpt-5.2`

无可用 provider 时返回 `{ suggestions: [], error: "no-provider" }`。

---

## 12. 流式断点续传

跨 WebSocket 断连持久化流式响应状态，客户端重连后可恢复中断的 AI 回复。

```typescript
type ChatStreamEntry = {
  streamText: string;
  completed: boolean;
  startTime: number;
  lastUpdate: number;
};
```

### API

| 函数 | 说明 |
|---|---|
| `recordStreamDelta(chatId, agentId, text, done)` | 记录流式片段（替换而非追加，因上游发送累计全文） |
| `markStreamCompleted(chatId, agentId)` | 标记流完成 |
| `getStreamState(chatId, agentId)` | 获取流状态，过期返回 `undefined` |
| `consumeStreamState(chatId, agentId)` | 获取并删除已完成的流状态；未完成的返回快照但不删除 |
| `clearStreamState(chatId, agentId)` | 显式清除 |
| `pruneExpiredStreams()` | 清理过期条目，每 5 分钟自动执行 |
| `getStreamStoreSize()` | 返回活跃条目数 |

### 事件

| 事件 | 方向 | 载荷 |
|---|---|---|
| `stream.resume` | Server -> Client | `{ chatId, agentId, text, isComplete, startTime, timestamp }` |

### 生命周期

1. 流式传输时，每个 `text.delta` 调用 `recordStreamDelta()` 持久化
2. `message.send` 触发时调用 `markStreamCompleted()`
3. 客户端重连后，服务端调用 `consumeStreamState()` 发送 `stream.resume`
4. TTL 为 **30 分钟**

Key 格式：`${chatId}::${agentId}`，支持多 Agent 独立流状态。

---

## 13. 语音转写

使用 faster-whisper 对语音和音频消息进行本地语音转文字。

```typescript
type GenericTranscriptionResult = {
  provider: "faster-whisper";
  text: string;
  language?: string;
  languageProbability?: number;
  mediaType: "voice" | "audio";
  model: string;
};
```

### API

| 函数 | 说明 |
|---|---|
| `maybeTranscribeGenericAudio(params)` | 条件转写：检查配置是否启用且消息类型符合。失败返回 `null` |
| `formatGenericTranscriptionBlock(result)` | 格式化为 `[Voice transcript]\n<text>` 或 `[Audio transcript]\n<text>` |

### 配置

```yaml
channels:
  clawline:
    transcription:
      enabled: true
      applyToVoice: true
      applyToAudio: true
      model: "tiny"
      language: "zh"
      device: "cpu"
      computeType: "int8"
      pythonPath: "/path/to/python3"
      timeoutMs: 120000
```

### Python 解析顺序

1. `transcription.pythonPath`
2. `GENERIC_CHANNEL_TRANSCRIBE_PYTHON` 环境变量
3. `~/.openclaw/workspace/.venv/bin/python`
4. `python3` (PATH)
5. `python` (PATH)

缺少 faster-whisper 时尝试下一个候选；其他错误终止搜索。默认超时 120 秒。

---

## 通用模式

### 广播

所有广播函数：检查 `connectionMode` 为 `"websocket"` -> 获取 WebSocket 管理器 -> `sendToClient(chatId, event)`。

### 内存存储

所有高级功能使用内存 `Map`/`Set` 存储，不持久化。生产环境应替换为数据库或 Redis。

### 事件驱动架构

1. 客户端发送请求事件
2. `monitor.ts` 路由到对应 handler
3. Handler 更新状态并调用广播函数
4. 会话内所有客户端收到更新
