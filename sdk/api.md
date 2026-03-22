# API 参考

## ClawlineClient

单连接客户端，管理一个 WebSocket 连接。

### 构造函数

```typescript
import { ClawlineClient } from '@clawlines/sdk'

const client = new ClawlineClient(options: ClientOptions)
```

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `url` | `string` | 否 | WebSocket 地址。默认 `wss://gateway.clawlines.net/client` |
| `senderId` | `string` | 是 | 唯一用户标识 |
| `senderName` | `string` | 是 | 显示名称 |
| `token` | `string` | 否 | 鉴权令牌 |
| `chatId` | `string` | 否 | 会话 ID |
| `agentId` | `string` | 否 | 初始 Agent ID |

### 连接

| 方法 | 说明 |
|------|------|
| `connect()` | 建立连接（自动重连最多 6 次） |
| `close()` | 主动断开 |
| `getStatus()` | 返回 `'connected'` \| `'connecting'` \| `'reconnecting'` \| `'disconnected'` |
| `isReady()` | 连接是否 OPEN |
| `getChatId()` | 当前会话 ID（服务端可能在 `connection.open` 时覆盖） |

### 消息收发

```typescript
// 文本
const payload = client.sendText('Hello')
const reply = client.sendTextWithParent('Reply', parentMessageId)

// 媒体（图片、语音、音频）
client.sendMedia({
  messageType: 'image',   // 'image' | 'voice' | 'audio'
  content: '描述',
  mediaUrl: 'https://...',
  mimeType: 'image/jpeg',
  agentId: 'optional',
})

// 文件
client.sendFile({
  content: '文件名',
  mediaUrl: 'https://...',
  mimeType: 'application/pdf',
  fileName: 'doc.pdf',
})

// 原始数据包
client.sendRaw({ type: 'custom.type', data: { ... } })
```

所有 `send*` 方法返回 `OutboundPayload`（含自动生成的 `messageId` 和 `timestamp`）。

### 文件上传

```typescript
const file = new File(['...'], 'photo.jpg', { type: 'image/jpeg' })
const url = await client.uploadFile(file)
// url = 'https://gateway.../api/media/abc123.jpg'
```

上传走 HTTP POST（不是 WebSocket），自动从 WS URL 推导出 HTTP 地址。仅 Relay 模式支持。

### Agent 管理

```typescript
client.requestAgentList()           // 触发 'agentList' 事件
client.selectAgent('research')      // 切换 Agent
client.requestAgentContext('main')  // 触发 'agentContext' 事件
const ctx = client.getAgentContext('main')  // 获取缓存
```

### 会话

```typescript
client.requestHistory('chat-id')           // 触发 'message' 事件（历史消息）
client.requestConversationList('agent-id') // 请求会话列表
```

### 互动

```typescript
client.addReaction('msg-id', '👍')
client.removeReaction('msg-id', '👍')
client.editMessage('msg-id', '新内容')
client.deleteMessage('msg-id')
client.sendTyping(true)   // 发送正在输入
client.sendTyping(false)  // 取消
const typing = client.getTypingAgents()  // ['agent-1', 'agent-2']
```

### 事件

```typescript
client.on('connected', () => void)
client.on('disconnected', () => void)
client.on('connecting', () => void)
client.on('reconnecting', () => void)
client.on('message', (packet: InboundPacket) => void)
client.on('typing', (agentIds: string[]) => void)
client.on('agentList', (agents: AgentInfo[]) => void)
client.on('agentContext', (agentId: string, context: AgentContext) => void)
client.on('error', (error: Error) => void)
```

`on()` 返回取消函数：

```typescript
const off = client.on('message', handler)
off()  // 取消监听
```

---

## ClawlinePool

多连接管理器，适合同时连接多个 Agent 或服务器。

### 构造函数

```typescript
import { ClawlinePool } from '@clawlines/sdk'

const pool = new ClawlinePool({
  maxConnections: 3,       // 最大并发（默认 3）
  idleTimeoutMs: 300000,   // 空闲超时（默认 5 分钟）
})
```

### 连接

```typescript
const connId = pool.connect({
  senderId: 'alice',
  senderName: 'Alice',
  url: 'ws://server-1:3100',
})

pool.close(connId)
pool.closeAll()
```

超过 `maxConnections` 时，最老的空闲连接会被自动关闭。

### 操作

```typescript
pool.sendText(connId, 'Hello')
pool.selectAgent(connId, 'research')
pool.requestAgentList(connId)
pool.getTypingAgents(connId)
pool.getStatus(connId)        // ConnectionStatus
pool.getClient(connId)        // ClawlineClient 实例
pool.getActiveConnectionIds() // string[]
pool.getConnectionCount()     // number
```

### 事件

```typescript
pool.on('connectionStatus', (connectionId, status) => void)
pool.on('message', (connectionId, packet) => void)
pool.on('typing', (connectionId, agentIds) => void)
pool.on('agentList', (connectionId, agents) => void)
pool.on('agentContext', (connectionId, agentId, context) => void)
pool.on('error', (connectionId, error) => void)
```

---

## 消息帧格式

### 出站（Client → Server）

```json
{
  "type": "message.receive",
  "data": {
    "messageId": "msg-xxx",
    "chatId": "chat-1",
    "chatType": "direct",
    "senderId": "alice",
    "senderName": "Alice",
    "messageType": "text",
    "content": "Hello",
    "timestamp": 1711100000000
  }
}
```

### 入站（Server → Client）

| type | 说明 |
|------|------|
| `connection.open` | 连接建立，含 `chatId` |
| `message.receive` | 完整消息 |
| `text.delta` | 流式文本片段 |
| `text.done` | 流式结束 |
| `agent.list` | Agent 列表 |
| `agent.context` | Agent 上下文文件 |
| `typing` | 打字状态 |
| `history.sync` | 历史消息同步 |
| `conversation.list` | 会话列表 |

---

## 类型定义

```typescript
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

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

type InboundPacket = {
  type: string
  data: {
    messageId?: string
    content?: string
    chatId?: string
    agentId?: string
    senderId?: string
    [key: string]: unknown
  }
}

type AgentContext = {
  files: Array<{ name: string; content: string; updatedAt?: number }>
  timestamp: number
}
```

---

## 常量

```typescript
import { DEFAULTS } from '@clawlines/sdk'

DEFAULTS.WS_URL                 // 'wss://gateway.clawlines.net/client'
DEFAULTS.MAX_RECONNECT_ATTEMPTS // 6
DEFAULTS.MAX_ACTIVE_CONNECTIONS // 3
DEFAULTS.IDLE_TIMEOUT_MS        // 300000
DEFAULTS.TYPING_TIMEOUT_MS      // 5000
```
