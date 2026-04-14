# WebSocket 事件参考

所有 WebSocket 消息使用 JSON 格式，遵循以下信封结构：

```typescript
type WSEvent = {
  type: WSEventType;
  data: unknown;
};
```

---

## 事件总览

| 事件类型 | 方向 | 分类 |
|---|---|---|
| `message.receive` | Client -> Server | 消息 |
| `message.send` | Server -> Client | 消息 |
| `message.edit` | 双向 | 消息 |
| `message.delete` | 双向 | 消息 |
| `message.forward` | 双向 | 消息 |
| `message.pin` | 双向 | 置顶 |
| `message.unpin` | 双向 | 置顶 |
| `history.get` | Client -> Server | 历史 |
| `history.sync` | Server -> Client | 历史 |
| `agent.list.get` | Client -> Server | Agent |
| `agent.list` | Server -> Client | Agent |
| `agent.context.get` | Client -> Server | Agent |
| `agent.context` | Server -> Client | Agent |
| `agent.select` | Client -> Server | Agent |
| `agent.selected` | Server -> Client | Agent |
| `conversation.list.get` | Client -> Server | 会话 |
| `conversation.list` | Server -> Client | 会话 |
| `channel.status.get` | Client -> Server | 系统 |
| `channel.status` | Server -> Client | 系统 |
| `connection.open` | Server -> Client | 连接 |
| `connection.close` | Server -> Client | 连接 |
| `typing` | 双向 | 指示器 |
| `thinking.start` | Server -> Client | 指示器 |
| `thinking.update` | Server -> Client | 指示器 |
| `thinking.end` | Server -> Client | 指示器 |
| `text.delta` | Server -> Client | 流式 |
| `stream.resume` | Server -> Client | 流式 |
| `reaction.add` | 双向 | 表情 |
| `reaction.remove` | 双向 | 表情 |
| `status.sent` | Server -> Client | 投递状态 |
| `status.delivered` | Server -> Client | 投递状态 |
| `status.read` | Server -> Client | 投递状态 |
| `status.failed` | Server -> Client | 投递状态 |
| `user.status` | 双向 | 在线状态 |
| `file.transfer` | 双向 | 文件传输 |
| `file.progress` | 双向 | 文件传输 |
| `group.action` | 双向 | 群组 |
| `suggestion.get` | Client -> Server | 建议 |
| `suggestion.response` | Server -> Client | 建议 |
| `tool.start` | Server -> Client | 工具调用 |
| `tool.end` | Server -> Client | 工具调用 |
| `ping` | Client -> Server | 心跳 |
| `pong` | Server -> Client | 心跳 |

---

## 消息事件

### `message.receive`

**Client -> Server** -- 客户端发送用户消息到服务端。

```typescript
{
  type: "message.receive",
  data: {
    messageId: string;
    chatId: string;
    chatType: "direct" | "group";
    senderId: string;
    senderName?: string;
    agentId?: string;
    messageType: "text" | "image" | "voice" | "audio" | "file";
    content: string;
    mediaUrl?: string;
    mimeType?: string;
    timestamp: number;
    parentId?: string;
    threadId?: string;
    meta?: Record<string, unknown>;
  }
}
```

### `message.send`

**Server -> Client** -- 服务端推送 Agent 回复。

```typescript
{
  type: "message.send",
  data: {
    messageId: string;
    chatId: string;
    content: string;
    contentType: "text" | "markdown" | "image" | "voice" | "audio" | "file";
    mediaUrl?: string;
    mimeType?: string;
    replyTo?: string;
    timestamp: number;
    agentId?: string;
    threadId?: string;
    meta?: {
      model?: string;
      inputTokens?: number;
      outputTokens?: number;
      reasoningTokens?: number;
      durationMs?: number;
    };
  }
}
```

### `message.edit`

**双向** -- 编辑已发送的消息。

```typescript
{
  type: "message.edit",
  data: {
    messageId: string;
    chatId: string;
    senderId: string;
    newContent: string;
    editedAt: number;
    editHistory?: Array<{ content: string; editedAt: number }>;
  }
}
```

### `message.delete`

**双向** -- 删除消息。

```typescript
{
  type: "message.delete",
  data: {
    messageId: string;
    chatId: string;
    senderId: string;
    deleteType: "soft" | "hard";
    deletedAt: number;
  }
}
```

### `message.forward`

**双向** -- 转发消息到另一个会话。

```typescript
{
  type: "message.forward",
  data: {
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
  }
}
```

---

## 置顶事件

### `message.pin`

**双向** -- 置顶消息。

```typescript
{
  type: "message.pin",
  data: {
    messageId: string;
    chatId: string;
    pinnedBy: string;
    pinnedAt: number;
    expiresAt?: number;
  }
}
```

### `message.unpin`

**双向** -- 取消置顶。

```typescript
{
  type: "message.unpin",
  data: {
    messageId: string;
    chatId: string;
    pinnedBy: string;
    pinnedAt: number;
    expiresAt?: number;
  }
}
```

---

## 历史事件

### `history.get`

**Client -> Server** -- 请求消息历史。

```typescript
{
  type: "history.get",
  data: {
    requestId?: string;
    chatId: string;
    limit?: number;
    before?: number;    // 分页：加载此时间戳之前的消息
    agentId?: string;
  }
}
```

### `history.sync`

**Server -> Client** -- 返回消息历史。

```typescript
{
  type: "history.sync",
  data: {
    requestId?: string;
    chatId: string;
    agentId?: string;
    messages: HistoryEntry[];
    hasMore: boolean;
    timestamp: number;
  }
}
```

---

## Agent 事件

### `agent.list.get`

**Client -> Server** -- 请求可用 Agent 列表。

```typescript
{
  type: "agent.list.get",
  data: { requestId?: string }
}
```

### `agent.list`

**Server -> Client** -- 返回可用 Agent 列表（按客户端权限过滤）。

```typescript
{
  type: "agent.list",
  data: {
    requestId?: string;
    agents: Array<{
      id: string;
      name: string;
      isDefault: boolean;
      identityName?: string;
      identityEmoji?: string;
      model?: string;
      description?: string;
      skills?: string[];
      configuredSkills?: string[];
      builtinSkills?: string[];
      globalSkills?: string[];
      workspaceSkills?: string[];
      status?: "online" | "idle" | "busy";
    }>;
    defaultAgentId: string;
    selectedAgentId?: string;
    timestamp: number;
  }
}
```

### `agent.context.get`

**Client -> Server** -- 请求 Agent 上下文文件（SOUL.md、IDENTITY.md 等）。

```typescript
{
  type: "agent.context.get",
  data: { requestId?: string; agentId: string }
}
```

### `agent.context`

**Server -> Client** -- 返回 Agent 上下文文件。

```typescript
{
  type: "agent.context",
  data: {
    requestId?: string;
    agentId: string;
    files: Array<{ name: string; content: string; updatedAt?: number }>;
    timestamp: number;
  }
}
```

支持的文件名：`SOUL.md`、`IDENTITY.md`、`USER.md`、`CONTEXT.md`、`AGENTS.md`、`TOOLS.md`、`HEARTBEAT.md`。

### `agent.select`

**Client -> Server** -- 选择 Agent。

```typescript
{
  type: "agent.select",
  data: { requestId?: string; agentId?: string | null }
}
```

### `agent.selected`

**Server -> Client** -- 确认 Agent 选择。成功后可能附带 `history.sync` 和 `stream.resume`。

```typescript
{
  type: "agent.selected",
  data: {
    requestId?: string;
    ok: boolean;
    mode: "auto" | "explicit";
    selectedAgentId?: string;
    error?: string;
    timestamp: number;
  }
}
```

---

## 会话事件

### `conversation.list.get`

**Client -> Server** -- 请求会话摘要列表。

```typescript
{
  type: "conversation.list.get",
  data: {
    requestId?: string;
    agentId?: string;
    chatType?: "direct" | "group";
    limit?: number;
  }
}
```

### `conversation.list`

**Server -> Client** -- 返回会话摘要。

```typescript
{
  type: "conversation.list",
  data: {
    requestId?: string;
    conversations: Array<{
      chatId: string;
      chatType: "direct" | "group";
      title?: string;
      lastMessageId?: string;
      lastContent?: string;
      lastContentType?: string;
      lastDirection?: "sent" | "received";
      lastTimestamp: number;
      lastSenderId?: string;
      lastSenderName?: string;
      participantIds?: string[];
      agentIds?: string[];
    }>;
    timestamp: number;
  }
}
```

---

## 系统事件

### `channel.status.get`

**Client -> Server** -- 请求频道状态。

```typescript
{
  type: "channel.status.get",
  data: { requestId?: string; includeChats?: boolean }
}
```

### `channel.status`

**Server -> Client** -- 返回频道状态和服务器信息。

```typescript
{
  type: "channel.status",
  data: {
    requestId?: string;
    channel: "clawline";
    configured: boolean;
    enabled: boolean;
    running: boolean;
    mode: "websocket" | "webhook" | "relay";
    port: number;
    path?: string;
    currentChatId: string;
    currentChatConnectionCount: number;
    connectedChatCount: number;
    connectedSocketCount: number;
    connectedChats?: string[];
    timestamp: number;
    server?: {
      uptime: number;
      node: string;
      platform: string;
      memory: NodeJS.MemoryUsage;
      pid: number;
      time: string;
    };
  }
}
```

---

## 连接事件

### `connection.open`

**Server -> Client** -- WebSocket 连接建立。

```typescript
{
  type: "connection.open",
  data: { chatId: string; timestamp: number }
}
```

### `connection.close`

**Server -> Client** -- WebSocket 连接关闭。

```typescript
{
  type: "connection.close",
  data: { chatId: string; reason?: string; timestamp: number }
}
```

---

## 指示器事件

### `typing`

**双向** -- 正在输入指示。

```typescript
{
  type: "typing",
  data: { chatId: string; senderId: string; isTyping: boolean; timestamp?: number }
}
```

### `thinking.start`

**Server -> Client** -- AI Agent 开始推理。

```typescript
{
  type: "thinking.start",
  data: { chatId: string; agentId?: string; timestamp: number }
}
```

### `thinking.update`

**Server -> Client** -- AI Agent 推理内容增量。

```typescript
{
  type: "thinking.update",
  data: { chatId: string; agentId?: string; text: string; timestamp: number }
}
```

### `thinking.end`

**Server -> Client** -- AI Agent 推理结束。

```typescript
{
  type: "thinking.end",
  data: { chatId: string; agentId?: string; timestamp: number }
}
```

---

## 流式事件

### `text.delta`

**Server -> Client** -- AI Agent 流式文本。`text` 为累计全文（非增量）。

```typescript
{
  type: "text.delta",
  data: {
    chatId: string;
    text: string;      // 累计全文
    done: boolean;
    agentId?: string;
    timestamp: number;
  }
}
```

### `stream.resume`

**Server -> Client** -- 客户端重连时恢复中断的流。详见[流式断点续传](./advanced-features.md#12-流式断点续传)。

```typescript
{
  type: "stream.resume",
  data: {
    chatId: string;
    agentId: string;
    text: string;
    isComplete: boolean;
    startTime: number;
    timestamp: number;
  }
}
```

---

## 表情事件

### `reaction.add`

**双向** -- 添加表情反应。

```typescript
{
  type: "reaction.add",
  data: { messageId: string; chatId: string; senderId: string; emoji: string; timestamp: number }
}
```

### `reaction.remove`

**双向** -- 移除表情反应。

```typescript
{
  type: "reaction.remove",
  data: { messageId: string; chatId: string; senderId: string; emoji: string; timestamp: number }
}
```

---

## 投递状态事件

### `status.sent`

**Server -> Client** -- 消息已发送。

```typescript
{
  type: "status.sent",
  data: { messageId: string; chatId: string; status: "sent"; timestamp: number }
}
```

### `status.delivered`

**Server -> Client** -- 消息已投递。

```typescript
{
  type: "status.delivered",
  data: { messageId: string; chatId: string; senderId?: string; status: "delivered"; timestamp: number }
}
```

### `status.read`

**Server -> Client** -- 消息已读。

```typescript
{
  type: "status.read",
  data: { messageId: string; chatId: string; senderId?: string; status: "read"; timestamp: number }
}
```

### `status.failed`

**Server -> Client** -- 消息投递失败。

```typescript
{
  type: "status.failed",
  data: { messageId: string; chatId: string; status: "failed"; timestamp: number; error?: string }
}
```

---

## 在线状态事件

### `user.status`

**双向** -- 用户在线状态更新。详见[用户在线状态](./advanced-features.md#3-用户在线状态)。

```typescript
{
  type: "user.status",
  data: {
    userId: string;
    userName?: string;
    status: "online" | "offline" | "away" | "busy";
    lastSeen?: number;
    statusMessage?: string;
    timestamp: number;
  }
}
```

---

## 文件传输事件

### `file.transfer`

**双向** -- 文件传输状态快照。

```typescript
{
  type: "file.transfer",
  data: {
    fileId: string;
    chatId: string;
    senderId: string;
    fileName: string;
    fileSize: number;
    fileType: string;
    mimeType: string;
    url?: string;
    status: "pending" | "uploading" | "uploaded" | "downloading" | "completed" | "failed";
    progress: number;
    uploadedBytes?: number;
    timestamp: number;
    error?: string;
  }
}
```

### `file.progress`

**双向** -- 传输进度增量更新。

```typescript
{
  type: "file.progress",
  data: {
    fileId: string;
    chatId: string;
    progress: number;
    uploadedBytes: number;
    totalBytes: number;
    status: "uploading" | "downloading";
    timestamp: number;
  }
}
```

---

## 群组事件

### `group.action`

**双向** -- 所有群组管理操作使用此事件，`data.type` 指定具体操作。

```typescript
{
  type: "group.action",
  data: {
    type: "group.create" | "member.add" | "member.remove" | "member.promote"
        | "member.demote" | "group.update" | "group.delete" | "settings.update";
    groupId: string;
    actorId: string;
    targetUserId?: string;
    data?: unknown;
    timestamp: number;
  }
}
```

---

## 建议事件

### `suggestion.get`

**Client -> Server** -- 请求 AI 生成后续建议。

```typescript
{
  type: "suggestion.get",
  data: {
    requestId?: string;
    messages: Array<{ role: string; text: string }>;
  }
}
```

### `suggestion.response`

**Server -> Client** -- 返回生成的建议。

```typescript
{
  type: "suggestion.response",
  data: {
    requestId?: string;
    suggestions: string[];
    source: "server";
    error?: string;
    timestamp: number;
  }
}
```

---

## 工具调用事件

### `tool.start`

**Server -> Client** -- AI Agent 开始执行工具。

```typescript
{
  type: "tool.start",
  data: {
    toolName: string;
    toolCallId: string;
    agentId: string;
    args?: Record<string, unknown>;   // 敏感值已脱敏
    timestamp: number;
  }
}
```

### `tool.end`

**Server -> Client** -- AI Agent 完成工具执行。

```typescript
{
  type: "tool.end",
  data: {
    toolName: string;
    toolCallId: string;
    agentId: string;
    completed: true;
    resultSummary?: string;           // 截断至 300 字符
    timestamp: number;
  }
}
```

---

## 心跳事件

### `ping`

**Client -> Server** -- 客户端心跳。

```typescript
{ type: "ping", data: {} }
```

### `pong`

**Server -> Client** -- 服务端心跳响应。

```typescript
{ type: "pong", data: { timestamp: number } }
```
