# 高级用法

本页涵盖 `@clawlines/sdk` 的底层协议函数、工具函数、类型定义、错误处理和高级模式。基础用法参见 [API Reference](/sdk/api)。

## 协议函数

SDK 导出 13 个帧构建函数和 4 个解析函数，用于直接操作 WebSocket 协议。

```typescript
import {
  createTextMessageFrame,
  createRawPacketFrame,
  createAgentListRequest,
  createAgentSelectRequest,
  createAgentContextRequest,
  createConversationListRequest,
  createHistoryRequest,
  createAddReactionRequest,
  createRemoveReactionRequest,
  createTypingRequest,
  createEditMessageRequest,
  createDeleteMessageRequest,
  parseInboundPacket,
  extractAgentList,
  extractAgentContext,
  extractTypingInfo,
  extractChatIdFromConnectionOpen,
} from '@clawlines/sdk'
```

### 出站帧构建

每个构建函数返回 `{ type: string; data: ... }` 对象，用 `JSON.stringify()` 序列化后通过 WebSocket 发送。

#### `createTextMessageFrame(payload)`

将 `OutboundPayload` 包装为 `message.receive` 帧。

```typescript
function createTextMessageFrame(
  payload: OutboundPayload
): { type: 'message.receive'; data: OutboundPayload }
```

```typescript
const frame = createTextMessageFrame({
  messageId: 'msg-001',
  chatId: 'chat-1',
  chatType: 'direct',
  senderId: 'alice',
  senderName: 'Alice',
  messageType: 'text',
  content: 'Hello',
  timestamp: Date.now(),
})
```

#### `createRawPacketFrame(type, data)`

创建自定义类型的帧，用于协议扩展。

```typescript
function createRawPacketFrame(
  type: string,
  data: Record<string, unknown>
): { type: string; data: Record<string, unknown> }
```

#### `createAgentListRequest()`

创建 `agent.list.get` 请求，自动生成 `requestId`。

```typescript
function createAgentListRequest(): {
  type: 'agent.list.get';
  data: { requestId: string }
}
```

#### `createAgentSelectRequest(agentId)`

创建 `agent.select` 请求。传 `null` 取消选择。

```typescript
function createAgentSelectRequest(
  agentId: string | null
): {
  type: 'agent.select';
  data: { requestId: string; agentId: string | null }
}
```

#### `createAgentContextRequest(agentId)`

创建 `agent.context.get` 请求，获取指定 Agent 的上下文文件。

```typescript
function createAgentContextRequest(
  agentId: string
): {
  type: 'agent.context.get';
  data: { requestId: string; agentId: string }
}
```

#### `createConversationListRequest(agentId?)`

创建 `conversation.list.get` 请求。可选 `agentId` 过滤结果。

```typescript
function createConversationListRequest(
  agentId?: string
): {
  type: 'conversation.list.get';
  data: { requestId: string; agentId?: string }
}
```

#### `createHistoryRequest(chatId)`

创建 `history.get` 请求，获取会话历史消息。

```typescript
function createHistoryRequest(
  chatId: string
): {
  type: 'history.get';
  data: { requestId: string; chatId: string }
}
```

#### `createAddReactionRequest(messageId, chatId, senderId, emoji)`

创建 `reaction.add` 请求，自动设置 `timestamp`。

```typescript
function createAddReactionRequest(
  messageId: string,
  chatId: string,
  senderId: string,
  emoji: string
): { type: 'reaction.add'; data: Record<string, unknown> }
```

#### `createRemoveReactionRequest(messageId, chatId, senderId, emoji)`

创建 `reaction.remove` 请求，签名同上。

```typescript
function createRemoveReactionRequest(
  messageId: string,
  chatId: string,
  senderId: string,
  emoji: string
): { type: 'reaction.remove'; data: Record<string, unknown> }
```

#### `createTypingRequest(chatId, senderId, isTyping)`

创建 `typing` 帧，指示用户是否正在输入。

```typescript
function createTypingRequest(
  chatId: string,
  senderId: string,
  isTyping: boolean
): { type: 'typing'; data: Record<string, unknown> }
```

#### `createEditMessageRequest(messageId, chatId, senderId, newContent)`

创建 `message.edit` 请求。

```typescript
function createEditMessageRequest(
  messageId: string,
  chatId: string,
  senderId: string,
  newContent: string
): { type: 'message.edit'; data: Record<string, unknown> }
```

#### `createDeleteMessageRequest(messageId, chatId, senderId)`

创建 `message.delete` 请求。

```typescript
function createDeleteMessageRequest(
  messageId: string,
  chatId: string,
  senderId: string
): { type: 'message.delete'; data: Record<string, unknown> }
```

### 入站包解析

#### `parseInboundPacket(raw)`

将 WebSocket 原始消息字符串解析为 `InboundPacket`，无效 JSON 返回 `null`。

```typescript
function parseInboundPacket(raw: string): InboundPacket | null
```

```typescript
const packet = parseInboundPacket('{"type":"message.receive","data":{"content":"Hi"}}')
if (packet) {
  console.log(packet.type)         // 'message.receive'
  console.log(packet.data.content) // 'Hi'
}
```

#### `extractAgentList(packet)`

从 `agent.list` 包中提取 `AgentInfo[]`，类型不匹配返回空数组。

```typescript
function extractAgentList(packet: InboundPacket): AgentInfo[]
```

#### `extractAgentContext(packet)`

从 `agent.context` 包中提取上下文，类型不匹配或缺少 `agentId` 返回 `null`。

```typescript
function extractAgentContext(
  packet: InboundPacket
): { agentId: string; context: AgentContext } | null
```

#### `extractTypingInfo(packet)`

从 `typing` 包中提取输入状态，类型不匹配返回 `null`。

```typescript
function extractTypingInfo(
  packet: InboundPacket
): { agentId: string; senderId: string; isTyping: boolean } | null
```

#### `extractChatIdFromConnectionOpen(packet)`

从 `connection.open` 包中提取 `chatId`，不匹配返回 `null`。

```typescript
function extractChatIdFromConnectionOpen(
  packet: InboundPacket
): string | null
```

---

## 工具函数

### `createStableId(prefix)`

生成唯一 ID：前缀 + 时间戳 + 6 位随机后缀。

```typescript
function createStableId(prefix: string): string
```

```typescript
import { createStableId } from '@clawlines/sdk'

createStableId('msg')    // 'msg-1711100000000-a3f8k2'
createStableId('conn')   // 'conn-1711100000001-x9m1p4'
```

### `buildSocketUrl(serverUrl, chatId?, agentId?, token?)`

构建完整的 WebSocket URL，附加 query 参数。`serverUrl` 为空时使用默认网关地址。

```typescript
function buildSocketUrl(
  serverUrl: string,
  chatId?: string,
  agentId?: string,
  token?: string
): string
```

```typescript
import { buildSocketUrl } from '@clawlines/sdk'

buildSocketUrl('wss://gateway.clawlines.net/client', 'chat-1', 'main', 'tok-abc')
// 'wss://gateway.clawlines.net/client?chatId=chat-1&agentId=main&token=tok-abc'
```

### `deriveHttpBaseUrl(wsUrl)`

将 WebSocket URL 转换为 HTTP URL：`wss://` → `https://`，并去除 `/client` 或 `/backend` 路径后缀。

```typescript
function deriveHttpBaseUrl(wsUrl: string): string
```

```typescript
import { deriveHttpBaseUrl } from '@clawlines/sdk'

deriveHttpBaseUrl('wss://gateway.clawlines.net/client')
// 'https://gateway.clawlines.net'
```

### `getWebSocketClass()`

返回当前运行时的 WebSocket 构造函数。浏览器环境返回 `globalThis.WebSocket`，Node.js 环境尝试 `require('ws')`。

```typescript
function getWebSocketClass(): typeof WebSocket
```

### `DEFAULTS`

导出的默认常量：

```typescript
import { DEFAULTS } from '@clawlines/sdk'

DEFAULTS.WS_URL                 // 'wss://gateway.clawlines.net/client'
DEFAULTS.MAX_RECONNECT_ATTEMPTS // 6
DEFAULTS.MAX_ACTIVE_CONNECTIONS // 3
DEFAULTS.IDLE_TIMEOUT_MS        // 300_000 (5 分钟)
DEFAULTS.TYPING_TIMEOUT_MS      // 5_000 (5 秒)
```

---

## 类型定义

所有类型从 `@clawlines/sdk` 作为 type-only 导出。

### `ClientOptions`

```typescript
type ClientOptions = {
  /** WebSocket 服务器 URL，默认: 'wss://gateway.clawlines.net/client' */
  url?: string
  /** 发送者 ID（必填） */
  senderId: string
  /** 发送者显示名（必填） */
  senderName: string
  /** 鉴权 token */
  token?: string
  /** 会话 ID */
  chatId?: string
  /** 初始 Agent ID */
  agentId?: string
}
```

### `PoolOptions`

```typescript
type PoolOptions = {
  /** 最大并发连接数，默认: 3 */
  maxConnections?: number
  /** 空闲超时（毫秒），默认: 300000 */
  idleTimeoutMs?: number
}
```

### `ConnectionStatus`

```typescript
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
```

### `OutboundPayload`

```typescript
type OutboundPayload = {
  messageId: string
  chatId: string
  chatType: string
  senderId: string
  senderName: string
  agentId?: string
  messageType: string   // 'text' | 'image' | 'voice' | 'audio' | 'file'
  content: string
  mediaUrl?: string
  mimeType?: string
  timestamp: number
}
```

### `InboundPacket`

```typescript
type InboundPacket = {
  type: string
  data: {
    messageId?: string
    content?: string
    chatId?: string
    agentId?: string
    senderId?: string
    isTyping?: boolean
    agents?: AgentInfo[]
    files?: ContextFile[]
    timestamp?: number
    [key: string]: unknown
  }
}
```

### `AgentInfo`

```typescript
type AgentInfo = {
  id: string
  name: string
  isDefault: boolean
  identityName?: string
  identityEmoji?: string
  model?: string
  description?: string
  skills?: string[]
  status?: 'online' | 'idle' | 'busy'
}
```

### `ContextFile`

```typescript
type ContextFile = {
  name: string
  content: string
  updatedAt?: number
}
```

### `AgentContext`

```typescript
type AgentContext = {
  files: ContextFile[]
  timestamp: number
}
```

### `ConversationSummary`

```typescript
type ConversationSummary = {
  chatId: string
  agentId?: string
  senderName?: string
  lastMessage?: string
  timestamp?: number
  unreadCount?: number
}
```

### `MediaOptions`

```typescript
type MediaOptions = {
  messageType: 'image' | 'voice' | 'audio'
  content: string       // 描述或标题
  mediaUrl: string      // 上传后的 URL
  mimeType: string      // MIME 类型
  agentId?: string      // 覆盖当前 Agent
}
```

### `FileOptions`

```typescript
type FileOptions = {
  content: string       // 标题或文件名
  mediaUrl: string      // 上传后的 URL
  mimeType: string      // MIME 类型
  fileName?: string     // 显示文件名
  agentId?: string      // 覆盖当前 Agent
}
```

### `ClawlineEvents`

```typescript
type ClawlineEvents = {
  connected: () => void
  disconnected: () => void
  connecting: () => void
  reconnecting: () => void
  message: (packet: InboundPacket) => void
  typing: (agentIds: string[]) => void
  agentList: (agents: AgentInfo[]) => void
  agentContext: (agentId: string, context: AgentContext) => void
  error: (error: Error) => void
}
```

### `EventKey`

```typescript
type EventKey = keyof ClawlineEvents
```

### `EventCallback<K>`

```typescript
type EventCallback<K extends EventKey> = ClawlineEvents[K]
```

---

## 错误处理

### 错误事件

| 场景 | 错误信息 | 触发时机 |
|------|---------|---------|
| WebSocket 错误 | `'WebSocket error'` | 底层 WebSocket 触发 `error` 事件 |
| 未连接时发送 | `'Socket is not connected.'` | `isReady()` 为 `false` 时调用发送方法 |
| 上传失败 | `'Upload failed: {status}'` | `uploadFile()` 收到非 2xx 响应 |
| 无 WebSocket 运行时 | `'WebSocket not available...'` | Node.js 环境未安装 `ws` 包 |
| Pool 连接不存在 | `'Connection {id} not found'` | 使用无效连接 ID 调用 `pool.sendText()` |

注意：`sendText` 等发送方法同步抛出异常，需用 try/catch 捕获：

```typescript
try {
  client.sendText('Hello')
} catch (err) {
  console.error('Send failed:', err.message)
}
```

### 重连机制

WebSocket 意外关闭时自动重连：

1. 状态变为 `reconnecting`，触发 `reconnecting` 事件
2. 指数退避：1s, 2s, 4s, 8s, 15s, 15s（上限 15 秒）
3. 6 次失败后放弃，状态变为 `disconnected`
4. 重连成功时计数器归零
5. 调用 `client.close()` 立即取消重连

```typescript
client.on('reconnecting', () => {
  console.log('正在重连...')
})

client.on('connected', () => {
  console.log('重连成功')
})
```

### 空闲超时

每次交互（连接、发送、接收）重置空闲计时器。`DEFAULTS.IDLE_TIMEOUT_MS`（5 分钟）内无活动则自动关闭连接，不触发重连。

```typescript
// 心跳防止空闲超时
const heartbeat = setInterval(() => {
  if (client.isReady()) {
    client.sendTyping(false)
  }
}, 4 * 60 * 1000)

client.on('disconnected', () => {
  clearInterval(heartbeat)
})
```

### 断连处理模式

```typescript
const client = new ClawlineClient({ senderId: 'user', senderName: 'User' })

client.on('disconnected', () => updateStatusIndicator('offline'))
client.on('reconnecting', () => updateStatusIndicator('reconnecting'))
client.on('connected', () => {
  updateStatusIndicator('online')
  client.requestAgentList()
  client.requestHistory(client.getChatId())
})
client.on('error', (err) => console.warn('Connection error:', err.message))

window.addEventListener('beforeunload', () => client.close())
```

---

## 高级模式

### Pool 配置

Pool 限制最大连接数，超出时自动关闭最早空闲的连接。

```typescript
import { ClawlinePool } from '@clawlines/sdk'

const pool = new ClawlinePool({
  maxConnections: 5,
  idleTimeoutMs: 10 * 60_000,
})
```

传入已存在的 `connectionId` 会复用现有客户端：

```typescript
pool.connect({
  connectionId: 'main',
  senderId: 'alice',
  senderName: 'Alice',
})
```

### 自定义协议帧

通过 `sendRaw()` 发送 SDK 未内置的自定义帧：

```typescript
client.sendRaw({
  type: 'plugin.invoke',
  data: {
    pluginId: 'weather',
    action: 'getForecast',
    params: { city: 'Tokyo' },
  },
})

client.on('message', (packet) => {
  if (packet.type === 'plugin.result') {
    console.log('Plugin result:', packet.data)
  }
})
```

### 连接生命周期管理

`on()` 返回取消订阅函数，便于清理：

```typescript
const unsubscribers: Array<() => void> = []
unsubscribers.push(client.on('connected', onConnected))
unsubscribers.push(client.on('message', onMessage))

// 清理
unsubscribers.forEach((unsub) => unsub())
```

React 组件中的使用：

```typescript
useEffect(() => {
  const client = new ClawlineClient({ senderId: userId, senderName: userName, chatId })

  const offMessage = client.on('message', (packet) => {
    setMessages((prev) => [...prev, packet])
  })
  const offTyping = client.on('typing', (agents) => {
    setTypingAgents(agents)
  })

  client.connect()

  return () => {
    offMessage()
    offTyping()
    client.close()
  }
}, [userId, userName, chatId])
```

### 多 Agent 切换

运行时切换 Agent 无需断开连接：

```typescript
client.on('agentList', (agents) => {
  const research = agents.find(a => a.id === 'research')
  if (research) client.selectAgent(research.id)
})

client.on('agentContext', (agentId, context) => {
  console.log(`Agent "${agentId}" 有 ${context.files.length} 个上下文文件`)
})

client.requestAgentList()

// 取消选择
client.selectAgent(null)
```

### 消息路由器

按包类型分发入站消息：

```typescript
type PacketHandler = (data: InboundPacket['data']) => void

const handlers = new Map<string, PacketHandler>()

handlers.set('text.delta', (data) => appendToStream(data.content ?? ''))
handlers.set('text.done', () => finalizeStream())
handlers.set('message.receive', (data) => addFullMessage(data))
handlers.set('history.sync', (data) => loadHistory(data))

client.on('message', (packet) => {
  const handler = handlers.get(packet.type)
  if (handler) handler(packet.data)
})
```

### 直接使用 WebSocket

绕过客户端的自动重连、空闲超时和事件系统，直接使用底层 WebSocket：

```typescript
import { buildSocketUrl, getWebSocketClass, parseInboundPacket } from '@clawlines/sdk'

const WS = getWebSocketClass()
const url = buildSocketUrl('wss://gateway.clawlines.net/client', 'chat-1', 'main', 'token')
const socket = new WS(url)

socket.addEventListener('message', (event) => {
  const packet = parseInboundPacket(String(event.data))
  if (packet) {
    // 完全控制包处理
  }
})
```
