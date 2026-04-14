# API 函数参考

所有导出函数来自 `channel/src/generic/` 模块，按功能分类。

---

## 1. 核心 -- 发送与探测

**源文件:** `send.ts`, `probe.ts`, `bot.ts`

### 发送

| 函数 | 参数 | 返回类型 | 说明 |
|------|------|----------|------|
| `sendMessageGeneric` | `SendGenericMessageParams` | `Promise<GenericSendResult>` | 发送文本或媒体消息，解析媒体 URL，持久化历史，更新投递状态 |
| `sendMediaGeneric` | `{ cfg, to, mediaUrl, mediaType, mimeType?, caption?, ... }` | `Promise<GenericSendResult>` | 媒体发送便捷封装 |
| `sendStreamDelta` | `{ cfg, to, text, done?, agentId? }` | `Promise<void>` | 发送流式文本片段，记录断点续传状态 |
| `sendThinkingIndicator` | `{ cfg, to, eventType, content?, agentId? }` | `Promise<void>` | 发送思考指示器事件 |

```typescript
type SendGenericMessageParams = {
  cfg: OpenClawConfig;
  to: string;                    // "user:xxx", "chat:xxx" 或裸 ID
  text: string;
  replyToMessageId?: string;
  contentType?: "text" | "markdown" | "image" | "voice" | "audio" | "file";
  mediaUrl?: string;
  mimeType?: string;
  chatType?: "direct" | "group";
  agentId?: string;
  threadId?: string;
  meta?: OutboundMessageMeta;
};

type GenericSendResult = {
  messageId: string;
  chatId: string;
};
```

### 探测

| 函数 | 参数 | 返回类型 | 说明 |
|------|------|----------|------|
| `probeGeneric` | `cfg?: GenericChannelConfig` | `Promise<GenericProbeResult>` | 频道健康检查 |

```typescript
type GenericProbeResult = {
  ok: boolean;
  error?: string;
  mode?: "websocket" | "webhook" | "relay";
  port?: number;
  relayUrl?: string;
};
```

### 消息处理

| 函数 | 参数 | 返回类型 | 说明 |
|------|------|----------|------|
| `parseGenericMessage` | `InboundMessage` | `GenericMessageContext` | 解析入站消息为内部上下文 |
| `handleGenericMessage` | `{ cfg, message, runtime?, chatHistories? }` | `Promise<void>` | 主处理入口：DM 策略校验、去重、媒体/转写、路由到 Agent |

---

## 2. 表情反应

**源文件:** `reactions.ts`

| 函数 | 参数 | 返回类型 | 说明 |
|------|------|----------|------|
| `addReaction` | `{ messageId, chatId, senderId, emoji }` | `MessageReaction` | 添加表情反应 |
| `removeReaction` | `{ messageId, chatId, senderId, emoji }` | `boolean` | 移除反应 |
| `getMessageReactions` | `{ messageId, chatId }` | `Map<string, MessageReaction[]>` | 按 emoji 分组获取反应 |
| `broadcastReaction` | `{ cfg, chatId, event }` | `void` | 广播反应事件 |
| `handleReactionEvent` | `{ cfg, event }` | `Promise<void>` | 处理并广播 |

```typescript
type MessageReaction = {
  messageId: string;
  chatId: string;
  senderId: string;
  emoji: string;
  timestamp: number;
};
```

---

## 3. 消息管理

**源文件:** `message-management.ts`

| 函数 | 参数 | 返回类型 | 说明 |
|------|------|----------|------|
| `editMessage` | `{ messageId, chatId, senderId, newContent, oldContent? }` | `MessageEdit` | 编辑消息 |
| `deleteMessage` | `{ messageId, chatId, senderId, deleteType? }` | `MessageDelete` | 删除消息（默认软删除） |
| `isMessageDeleted` | `{ messageId, chatId }` | `boolean` | 检查是否已删除 |
| `getMessageEditHistory` | `{ messageId, chatId }` | `MessageEdit \| undefined` | 获取编辑历史 |
| `broadcastMessageEdit` | `{ cfg, chatId, edit }` | `void` | 广播编辑事件 |
| `broadcastMessageDelete` | `{ cfg, chatId, deletion }` | `void` | 广播删除事件 |
| `handleMessageEdit` | `{ cfg, edit }` | `Promise<void>` | 处理编辑请求 |
| `handleMessageDelete` | `{ cfg, deletion }` | `Promise<void>` | 处理删除请求 |

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

---

## 4. 状态与已读回执

### message-status.ts

| 函数 | 参数 | 返回类型 | 说明 |
|------|------|----------|------|
| `updateMessageStatus` | `{ cfg, messageId, chatId, status, error? }` | `void` | 更新状态并广播 |
| `broadcastMessageStatus` | `{ cfg, event }` | `void` | 广播状态事件 |
| `getMessageStatus` | `{ messageId, chatId }` | `MessageStatusEvent \| null` | 获取状态 |
| `handleStatusUpdate` | `{ cfg, messageId, chatId, status }` | `Promise<void>` | 处理状态更新 |
| `clearOldMessageStatuses` | `maxAgeMs` (默认 24h) | `number` | 清理过期状态 |

### status.ts (已读回执)

| 函数 | 参数 | 返回类型 | 说明 |
|------|------|----------|------|
| `updateMessageStatus` | `{ messageId, chatId, senderId, status }` | `MessageStatusUpdate` | 用户级状态更新 |
| `markMessageAsRead` | `{ messageId, chatId, readBy }` | `ReadReceipt` | 标记已读 |
| `getMessageStatus` | `{ messageId, chatId, senderId }` | `MessageStatusUpdate \| undefined` | 获取用户级状态 |
| `getReadReceipts` | `{ messageId, chatId }` | `ReadReceipt[]` | 获取已读回执 |
| `getOverallMessageStatus` | `{ messageId, chatId }` | `MessageStatus` | 聚合状态 |
| `broadcastStatusUpdate` | `{ cfg, chatId, statusUpdate }` | `void` | 广播 |
| `handleStatusUpdate` | `{ cfg, statusUpdate }` | `Promise<void>` | 处理更新 |

```typescript
// message-status.ts
type MessageStatus = "sent" | "delivered" | "read" | "failed";
type MessageStatusEvent = {
  messageId: string; chatId: string; status: MessageStatus;
  timestamp: number; error?: string;
};

// status.ts
type MessageStatusUpdate = {
  messageId: string; chatId: string; senderId: string;
  status: "sent" | "delivered" | "read"; timestamp: number;
};
type ReadReceipt = {
  messageId: string; chatId: string; readBy: string; readAt: number;
};
```

---

## 5. 输入指示器

**源文件:** `typing.ts`

| 函数 | 参数 | 返回类型 | 说明 |
|------|------|----------|------|
| `startTyping` | `{ chatId, senderId, senderName?, timeout? }` | `TypingIndicator` | 开始输入（默认 5 秒自动停止） |
| `stopTyping` | `{ chatId, senderId }` | `TypingIndicator` | 停止输入 |
| `getTypingUsers` | `chatId` | `string[]` | 获取正在输入的用户 |
| `isUserTyping` | `{ chatId, senderId }` | `boolean` | 检查用户是否在输入 |
| `broadcastTypingIndicator` | `{ cfg, chatId, indicator }` | `void` | 广播 |
| `handleTypingIndicator` | `{ cfg, indicator }` | `Promise<void>` | 处理输入事件 |

```typescript
type TypingIndicator = {
  chatId: string; senderId: string; senderName?: string;
  isTyping: boolean; timestamp: number;
};
```

---

## 6. 消息转发

**源文件:** `forwarding.ts`

| 函数 | 参数 | 返回类型 | 说明 |
|------|------|----------|------|
| `forwardMessage` | `{ cfg, originalMessageId, ... }` | `Promise<ForwardedMessage>` | 转发单条消息 |
| `forwardMultipleMessages` | `{ cfg, messages, forwardedBy, targetChatId }` | `Promise<ForwardedMessage[]>` | 批量转发 |
| `getForwardedMessages` | `{ chatId, originalMessageId? }` | `ForwardedMessage[]` | 获取转发记录 |
| `broadcastForwardEvent` | `{ cfg, chatId, forwarded }` | `void` | 广播转发事件 |
| `handleForwardRequest` | `{ cfg, forward }` | `Promise<void>` | 处理转发请求 |

```typescript
type ForwardedMessage = {
  originalMessageId: string; originalChatId: string;
  originalSenderId: string; originalSenderName?: string;
  forwardedBy: string; forwardedByName?: string;
  targetChatId: string; timestamp: number;
  content: string;
  messageType: "text" | "image" | "voice" | "audio" | "file";
  mediaUrl?: string; mimeType?: string;
};
```

---

## 7. 在线状态

**源文件:** `presence.ts`

| 函数 | 参数 | 返回类型 | 说明 |
|------|------|----------|------|
| `updateUserStatus` | `{ userId, userName?, status, statusMessage?, cfg? }` | `UserPresence` | 更新状态（online 时启动 30 秒心跳） |
| `sendHeartbeat` | `{ userId, userName? }` | `UserPresence` | 刷新心跳 |
| `getUserStatus` | `userId` | `UserPresence \| undefined` | 获取状态 |
| `getOnlineUsers` | -- | `UserPresence[]` | 获取在线用户 |
| `getLastSeen` | `userId` | `number \| undefined` | 最后在线时间 |
| `setUserOffline` | `{ userId, userName? }` | `UserPresence` | 强制离线 |
| `broadcastUserStatus` | `{ cfg, presence, targetChatId? }` | `void` | 广播状态 |
| `handleUserStatusUpdate` | `{ cfg, status }` | `Promise<void>` | 处理状态更新 |
| `handleUserConnect` | `{ cfg, userId, userName? }` | `void` | 处理连接 |
| `handleUserDisconnect` | `{ cfg, userId, userName? }` | `void` | 处理断开 |

```typescript
type UserStatus = "online" | "offline" | "away" | "busy";
type UserPresence = {
  userId: string; userName?: string; status: UserStatus;
  lastSeen?: number; statusMessage?: string; timestamp: number;
};
```

---

## 8. 文件传输

**源文件:** `file-transfer.ts`

| 函数 | 参数 | 返回类型 | 说明 |
|------|------|----------|------|
| `initFileTransfer` | `{ fileId, chatId, senderId, fileName, fileSize, fileType, mimeType }` | `FileTransfer` | 初始化传输 |
| `updateFileTransferProgress` | `{ fileId, progress, uploadedBytes?, status?, url?, error? }` | `FileTransfer \| undefined` | 更新进度 |
| `completeFileTransfer` | `{ fileId, url }` | `FileTransfer \| undefined` | 标记完成 |
| `failFileTransfer` | `{ fileId, error }` | `FileTransfer \| undefined` | 标记失败 |
| `getFileTransfer` | `fileId` | `FileTransfer \| undefined` | 获取传输记录 |
| `getChatFileTransfers` | `chatId` | `FileTransfer[]` | 获取会话传输列表 |
| `broadcastFileProgress` | `{ cfg, chatId, progress }` | `void` | 广播进度 |
| `broadcastFileTransfer` | `{ cfg, chatId, transfer }` | `void` | 广播状态变更 |
| `handleFileUpload` | `{ cfg, fileId, chatId, senderId, ... }` | `Promise<FileTransfer>` | 完整上传流程 |
| `handleFileDownload` | `{ cfg, fileId, chatId, url, maxBytes? }` | `Promise<{ buffer, contentType?, size }>` | 下载文件（默认限 100 MB） |

```typescript
type FileTransfer = {
  fileId: string; chatId: string; senderId: string;
  fileName: string; fileSize: number; fileType: string; mimeType: string;
  url?: string;
  status: "pending" | "uploading" | "uploaded" | "downloading" | "completed" | "failed";
  progress: number; uploadedBytes?: number; timestamp: number; error?: string;
};

type FileTransferProgress = {
  fileId: string; chatId: string; progress: number;
  uploadedBytes: number; totalBytes: number;
  status: "uploading" | "downloading"; timestamp: number;
};
```

---

## 9. 搜索

**源文件:** `search.ts`

| 函数 | 参数 | 返回类型 | 说明 |
|------|------|----------|------|
| `indexMessage` | `InboundMessage` | `void` | 加入搜索索引 |
| `removeMessageFromIndex` | `{ messageId, chatId }` | `void` | 从索引移除 |
| `searchMessages` | `SearchQuery` | `SearchResponse` | 全文搜索 |
| `searchByContent` | `{ content, chatId?, limit? }` | `SearchResponse` | 按内容搜索 |
| `searchBySender` | `{ senderId, chatId?, limit? }` | `SearchResponse` | 按发送者搜索 |
| `searchByDateRange` | `{ startDate, endDate, chatId?, limit? }` | `SearchResponse` | 按时间范围搜索 |
| `getMessageById` | `messageId` | `InboundMessage \| undefined` | 按 ID 获取 |
| `getRecentMessages` | `{ chatId, limit? }` | `InboundMessage[]` | 最近消息（默认 50 条） |
| `clearChatMessages` | `chatId` | `void` | 清空会话索引 |

```typescript
type SearchQuery = {
  query: string; chatId?: string; senderId?: string;
  messageType?: "text" | "image" | "voice" | "audio" | "file";
  startDate?: number; endDate?: number;
  limit?: number; offset?: number;
};

type SearchResult = {
  message: InboundMessage; score: number; highlights?: string[];
};

type SearchResponse = {
  results: SearchResult[]; total: number; query: SearchQuery; timestamp: number;
};
```

---

## 10. 群组

**源文件:** `groups.ts`

| 函数 | 参数 | 返回类型 | 说明 |
|------|------|----------|------|
| `createGroup` | `{ groupId, groupName, ... }` | `GroupInfo` | 创建群组 |
| `addGroupMember` | `{ groupId, userId, ... }` | `GroupMember \| undefined` | 添加成员 |
| `removeGroupMember` | `{ groupId, userId }` | `boolean` | 移除成员 |
| `changeGroupMemberRole` | `{ groupId, userId, newRole }` | `GroupMember \| undefined` | 变更角色 |
| `updateGroupSettings` | `{ groupId, settings }` | `GroupInfo \| undefined` | 更新设置 |
| `updateGroupInfo` | `{ groupId, groupName?, ... }` | `GroupInfo \| undefined` | 更新信息 |
| `getGroupInfo` | `groupId` | `GroupInfo \| undefined` | 获取群组信息 |
| `getUserGroups` | `userId` | `GroupInfo[]` | 用户所属群组 |
| `isGroupAdmin` | `{ groupId, userId }` | `boolean` | 是否管理员 |
| `broadcastGroupAction` | `{ cfg, action }` | `void` | 广播群组操作 |
| `handleGroupAction` | `{ cfg, action }` | `Promise<void>` | 处理群组操作 |

```typescript
type GroupRole = "owner" | "admin" | "member";

type GroupMember = {
  userId: string; userName?: string; role: GroupRole;
  joinedAt: number; invitedBy?: string;
};

type GroupSettings = {
  allowMemberInvites: boolean; allowMemberMessages: boolean;
  onlyAdminsCanEdit: boolean; maxMembers: number; isPublic: boolean;
};

type GroupAction = {
  type: "group.create" | "member.add" | "member.remove"
      | "member.promote" | "member.demote"
      | "group.update" | "group.delete" | "settings.update";
  groupId: string; actorId: string; targetUserId?: string;
  data?: unknown; timestamp: number;
};
```

---

## 11. 置顶与收藏

**源文件:** `pins-stars.ts`

### 置顶

| 函数 | 参数 | 返回类型 | 说明 |
|------|------|----------|------|
| `pinMessage` | `{ messageId, chatId, pinnedBy, expiresAt? }` | `PinnedMessage` | 置顶（上限 3 条） |
| `unpinMessage` | `{ messageId, chatId }` | `boolean` | 取消置顶 |
| `getPinnedMessages` | `chatId` | `PinnedMessage[]` | 获取置顶列表 |
| `isMessagePinned` | `{ messageId, chatId }` | `boolean` | 是否已置顶 |
| `broadcastPinEvent` | `{ cfg, chatId, event, pinned }` | `void` | 广播 |
| `handlePinMessage` | `{ cfg, messageId, chatId, pinnedBy, expiresAt? }` | `Promise<void>` | 处理置顶 |
| `handleUnpinMessage` | `{ cfg, messageId, chatId }` | `Promise<void>` | 处理取消置顶 |

### 收藏

| 函数 | 参数 | 返回类型 | 说明 |
|------|------|----------|------|
| `starMessage` | `{ messageId, chatId, starredBy, note? }` | `StarredMessage` | 收藏 |
| `unstarMessage` | `{ messageId, chatId, starredBy }` | `boolean` | 取消收藏 |
| `getStarredMessages` | `{ userId, chatId? }` | `StarredMessage[]` | 获取收藏列表 |
| `isMessageStarred` | `{ messageId, chatId, userId }` | `boolean` | 是否已收藏 |
| `getStarredCount` | `userId` | `number` | 收藏总数 |
| `handleStarMessage` | `{ messageId, chatId, starredBy, note? }` | `Promise<StarredMessage>` | 处理收藏 |
| `handleUnstarMessage` | `{ messageId, chatId, starredBy }` | `Promise<boolean>` | 处理取消收藏 |

```typescript
type PinnedMessage = {
  messageId: string; chatId: string; pinnedBy: string;
  pinnedAt: number; expiresAt?: number;
};

type StarredMessage = {
  messageId: string; chatId: string; starredBy: string;
  starredAt: number; note?: string;
};
```

---

## 12. 媒体

**源文件:** `media.ts`

| 函数 | 参数 | 返回类型 | 说明 |
|------|------|----------|------|
| `downloadMediaFromUrl` | `{ url, maxBytes }` | `Promise<{ buffer, contentType? }>` | 下载媒体（检查大小限制） |
| `resolveGenericMediaList` | `{ message, maxBytes, log? }` | `Promise<MediaInfo[]>` | 解析入站消息媒体 |
| `buildMediaPayload` | `MediaInfo[]` | `object` | 构建 Agent 上下文的媒体载荷 |
| `inferMediaTypeFromMime` | `mimeType` | `"image" \| "voice" \| "audio" \| "file"` | MIME 类型分类 |
| `inferMimeTypeFromSource` | `source` | `string \| undefined` | 从 data URI 或扩展名推断 MIME |

```typescript
type MediaInfo = {
  path: string;
  contentType?: string;
  placeholder: string;    // 如 "<media:image>"
};
```

---

## 13. 历史

**源文件:** `history.ts`

内存存储，定期持久化到 `~/.openclaw/clawline-history.json`。

| 函数 | 参数 | 返回类型 | 说明 |
|------|------|----------|------|
| `appendInboundHistoryMessage` | `InboundMessage` | `void` | 记录入站消息 |
| `appendOutboundHistoryMessage` | `OutboundMessage, meta?` | `void` | 记录出站消息 |
| `updateHistoryMessage` | `{ chatId, messageId, ... }` | `boolean` | 更新历史记录 |
| `removeHistoryMessage` | `{ chatId, messageId }` | `boolean` | 删除历史记录 |
| `getRecentHistoryMessages` | `{ chatId, limit?, before?, agentId? }` | `HistoryMessageRecord[]` | 获取历史（默认 20 条） |
| `getConversationSummaries` | `{ userId?, agentId?, chatType?, limit? }` | `ConversationSummary[]` | 获取会话摘要（默认 100 条） |

```typescript
type HistoryMessageRecord = {
  messageId: string; chatId: string;
  direction: "sent" | "received";
  content: string;
  contentType: "text" | "markdown" | "image" | "voice" | "audio" | "file";
  mediaUrl?: string; mimeType?: string; timestamp: number;
  replyTo?: string; senderId?: string; senderName?: string;
  chatType?: "direct" | "group";
  agentId?: string; threadId?: string;
};
```

---

## 14. Agent

**源文件:** `agents.ts`

| 函数 | 参数 | 返回类型 | 说明 |
|------|------|----------|------|
| `listGenericAgents` | `cfg` | `{ agents, defaultAgentId }` | 列出所有 Agent 及元信息 |
| `resolveGenericAgentModel` | `cfg, agentId` | `string \| undefined` | 解析 Agent 主模型 |
| `resolveGenericAgentId` | `cfg, requestedAgentId?` | `string \| undefined` | 校验并规范化 Agent ID |
| `resolveExplicitGenericAgentRoute` | `{ cfg, requestedAgentId?, chatType, chatId, senderId }` | `object \| undefined` | 解析完整路由上下文 |
| `resolveGenericAgentWorkspaceCandidates` | `cfg, agentId` | `string[]` | 解析工作区目录候选路径 |

---

## 15. 流式状态

**源文件:** `stream-state.ts`

| 函数 | 参数 | 返回类型 | 说明 |
|------|------|----------|------|
| `recordStreamDelta` | `chatId, agentId, text, done` | `void` | 记录流式片段（替换式） |
| `markStreamCompleted` | `chatId, agentId` | `void` | 标记完成 |
| `getStreamState` | `chatId, agentId` | `ChatStreamEntry \| undefined` | 获取流状态 |
| `consumeStreamState` | `chatId, agentId` | `ChatStreamEntry \| undefined` | 获取并删除（仅已完成） |
| `clearStreamState` | `chatId, agentId` | `void` | 显式清除 |
| `pruneExpiredStreams` | -- | `void` | 清理过期条目（TTL 30 分钟） |
| `getStreamStoreSize` | -- | `number` | 活跃条目数 |

```typescript
type ChatStreamEntry = {
  streamText: string; completed: boolean;
  startTime: number; lastUpdate: number;
};
```

---

## 16. 出站适配器

**源文件:** `outbound.ts`

| 导出 | 类型 | 说明 |
|------|------|------|
| `genericOutbound` | `ChannelOutboundAdapter` | 出站适配器，含 `sendText` 和 `sendMedia`，自动解析 `agentId` 和 `threadId` |

| 属性 | 值 | 说明 |
|------|-----|------|
| `deliveryMode` | `"direct"` | 即时发送 |
| `chunkerMode` | `"markdown"` | 按 Markdown 结构分片 |
| `textChunkLimit` | `4000` | 每片最大字符数 |

---

## 公共类型

### InboundMessage（客户端到服务端）

```typescript
type InboundMessage = {
  messageId: string; chatId: string;
  chatType: "direct" | "group";
  senderId: string; senderName?: string; agentId?: string;
  messageType: "text" | "image" | "voice" | "audio" | "file";
  content: string; mediaUrl?: string; mimeType?: string;
  timestamp: number; parentId?: string; threadId?: string;
  meta?: Record<string, unknown>;
};
```

### OutboundMessage（服务端到客户端）

```typescript
type OutboundMessage = {
  messageId: string; chatId: string;
  content: string;
  contentType: "text" | "markdown" | "image" | "voice" | "audio" | "file";
  mediaUrl?: string; mimeType?: string; replyTo?: string;
  timestamp: number; agentId?: string; threadId?: string;
  meta?: OutboundMessageMeta;
};

type OutboundMessageMeta = {
  model?: string; inputTokens?: number; outputTokens?: number;
  reasoningTokens?: number; durationMs?: number;
};
```

### WebSocket 事件类型

```typescript
type WSEvent = { type: WSEventType; data: unknown };
```

| 分类 | 事件类型 |
|------|---------|
| 消息 | `message.receive`, `message.send`, `message.edit`, `message.delete`, `message.forward`, `message.pin`, `message.unpin` |
| 历史 | `history.get`, `history.sync` |
| Agent | `agent.list.get`, `agent.list`, `agent.context.get`, `agent.context`, `agent.select`, `agent.selected` |
| 会话 | `conversation.list.get`, `conversation.list` |
| 频道 | `channel.status.get`, `channel.status` |
| 连接 | `connection.open`, `connection.close`, `ping`, `pong` |
| 流式 | `text.delta`, `stream.resume`, `thinking.start`, `thinking.update`, `thinking.end` |
| 表情 | `reaction.add`, `reaction.remove` |
| 状态 | `status.sent`, `status.delivered`, `status.read`, `status.failed` |
| 在线 | `user.status` |
| 文件 | `file.progress`, `file.transfer` |
| 群组 | `group.action` |
| 工具 | `tool.start`, `tool.end` |
| 建议 | `suggestion.get`, `suggestion.response` |
