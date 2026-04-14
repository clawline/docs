# API 参考

## 鉴权方式

Relay Gateway 支持三种鉴权方式，管理 API 需要其中之一：

| 方式 | 适用场景 | 说明 |
|------|---------|------|
| Admin Token (Header) | 管理 API、媒体上传 | `X-Relay-Admin-Token: <RELAY_ADMIN_TOKEN>` |
| Admin Token (Query) | 管理 API（快速测试） | `?adminToken=<RELAY_ADMIN_TOKEN>` |
| Logto JWT Bearer | 管理 API、媒体上传 | `Authorization: Bearer <jwt>` — JWT 由 Logto OIDC 签发，audience 为 `LOGTO_API_RESOURCE` |

媒体上传 API 额外支持：

| 方式 | 说明 |
|------|------|
| Channel Secret | `X-Channel-Secret: <channel-secret>` — 用 channel 的 secret 鉴权 |
| Channel User Token | Bearer token 或 query param 匹配任一 channel 用户的 token |

---

## REST API

### GET /healthz

健康检查端点，**无需鉴权**。

**响应：**

```json
{
  "ok": true,
  "backendCount": 1,
  "clientCount": 3,
  "channels": [
    {
      "channelId": "demo",
      "label": "🍎 Demo",
      "backendConnected": true,
      "clientCount": 3,
      "instanceId": "openclaw-sg-1"
    }
  ],
  "timestamp": 1711100000000
}
```

---

### GET /api/meta

公开元信息端点，**无需鉴权**。

**响应：**

```json
{
  "ok": true,
  "adminAuthEnabled": true,
  "publicBaseUrl": "https://relay.example.com",
  "pluginBackendUrl": "ws://127.0.0.1:19080/backend",
  "timestamp": 1711100000000
}
```

---

### GET /api/state

获取完整的 relay 状态，**需要管理鉴权**。

**响应：**

```json
{
  "ok": true,
  "configPath": "supabase://xxx.supabase.co/public/cl_channels,cl_channel_users",
  "adminAuthEnabled": true,
  "publicBaseUrl": "https://relay.example.com",
  "pluginBackendUrl": "ws://127.0.0.1:19080/backend",
  "channels": [
    {
      "channelId": "demo",
      "label": "🍎 Demo",
      "secret": "abc123...",
      "secretMasked": "abc1***ef12",
      "tokenParam": "token",
      "userCount": 2,
      "users": [
        {
          "id": "user1",
          "senderId": "user1",
          "chatId": null,
          "token": "xxx...",
          "allowAgents": null,
          "enabled": true
        }
      ],
      "backendConnected": true,
      "clientCount": 1,
      "instanceId": "openclaw-sg-1",
      "lastConnectedAt": 1711100000000,
      "lastDisconnectedAt": null
    }
  ],
  "stats": {
    "backendCount": 1,
    "clientCount": 1
  },
  "timestamp": 1711100000000
}
```

---

### POST /api/channels

创建或更新 channel，**需要管理鉴权**。

**请求体：**

```json
{
  "channelId": "demo",
  "label": "🍎 Demo",
  "secret": "optional-custom-secret"
}
```

- `channelId`（必填）：channel 唯一标识
- `label`（可选）：显示名称
- `secret`（可选）：backend 鉴权密钥，不填则自动生成

**响应：**

```json
{
  "ok": true,
  "channel": { /* 完整 channel 对象 */ }
}
```

---

### DELETE /api/channels/:channelId

删除 channel 及其所有用户，断开相关 backend 和 client 连接。**需要管理鉴权**。

**响应：**

```json
{
  "ok": true,
  "channelId": "demo"
}
```

---

### POST /api/channels/:channelId/users

为指定 channel 创建或更新用户，**需要管理鉴权**。

**请求体：**

```json
{
  "senderId": "alice",
  "chatId": "optional-fixed-chat-id",
  "token": "optional-custom-token",
  "allowAgents": ["agent1", "agent2"],
  "enabled": true
}
```

- `senderId`（必填）：用户唯一标识
- `chatId`（可选）：绑定的 chatId，客户端连接时如果指定了不匹配的 chatId 会被拒绝
- `token`（可选）：不填则自动生成 32 位 hex
- `allowAgents`（可选）：允许使用的 agent 列表，不填或 `["*"]` 表示全部
- `enabled`（可选）：默认 `true`

**响应：**

```json
{
  "ok": true,
  "channel": { /* 完整 channel 对象 */ },
  "user": { /* 创建/更新后的 user 对象 */ }
}
```

---

### DELETE /api/channels/:channelId/users/:senderId

从 channel 中删除用户。**需要管理鉴权**。

**响应：**

```json
{
  "ok": true,
  "channel": { /* 完整 channel 对象 */ },
  "senderId": "alice"
}
```

---

### POST /api/chat

直接通过 HTTP 发送消息并获取 Agent 回复，**无需 WebSocket 连接**。适用于脚本集成、单次问答、自动化测试等场景。**需要管理鉴权**。

**请求体：**

```json
{
  "message": "你好，请帮我写一段代码",
  "channelId": "demo",
  "agentId": "main",
  "senderId": "api-user",
  "senderName": "API 调用者",
  "chatId": "api-session-1"
}
```

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `message` | ✅ | - | 用户消息文本 |
| `channelId` | ✅ | - | 目标 channel |
| `agentId` | ✅ | - | 目标 Agent |
| `senderId` | 否 | `"api"` | 发送者标识 |
| `senderName` | 否 | 同 senderId | 发送者显示名 |
| `chatId` | 否 | 同 senderId | 会话标识 |

**实现机制：**

- 网关为此请求创建一个虚拟 WebSocket 连接，模拟完整的消息收发流程
- 入站和出站消息均持久化到 Supabase，并标记 `meta.source: "api"`
- 入站消息会广播到该 channel 的所有已连接 WebSocket 客户端
- 超时时间：**120 秒**

**成功响应 (200)：**

```json
{
  "ok": true,
  "messageId": "msg-1713000000000-abc123",
  "content": "以下是一个简单的 Hello World 示例...",
  "agentId": "main",
  "timestamp": 1713000001234,
  "meta": { "source": "api" }
}
```

**错误响应：**

| HTTP 状态码 | 场景 |
|------------|------|
| 400 | 缺少 `message`、`channelId` 或 `agentId` |
| 503 | 该 channel 的 backend 未连接 |
| 504 | Agent 120 秒内未响应 |

**使用示例：**

```bash
curl -X POST https://relay.example.com/api/chat \
  -H "Content-Type: application/json" \
  -H "X-Relay-Admin-Token: your-admin-token" \
  -d '{
    "message": "今天天气怎么样？",
    "channelId": "demo",
    "agentId": "main"
  }'
```

---

### GET /api/settings

获取通用 relay 设置（CORS 配置）。**需要管理鉴权**。

设置持久化在 `cl_settings` 表的 `relay` 键中。

**响应 (200)：**

```json
{
  "ok": true,
  "settings": {
    "corsAllowedOrigins": ["https://app.example.com", "https://admin.example.com"]
  },
  "_env": {
    "CORS_ALLOWED_ORIGINS": null
  }
}
```

- `settings`：数据库中的持久化设置
- `_env.CORS_ALLOWED_ORIGINS`：环境变量的值（调试用）

---

### PUT /api/settings

更新通用 relay 设置。**需要管理鉴权**。

**请求体：**

```json
{
  "corsAllowedOrigins": ["https://app.example.com"]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `corsAllowedOrigins` | `string[]` | CORS 允许源列表，空数组禁用 |

增量合并，仅覆盖提供的字段。

**响应 (200)：**

```json
{
  "ok": true,
  "settings": {
    "corsAllowedOrigins": ["https://app.example.com"]
  }
}
```

**错误响应：**

| HTTP 状态码 | 场景 |
|------------|------|
| 400 | JSON 无效或解析错误 |
| 401 | 鉴权失败 |

---

### GET /api/ai-settings

获取 AI/LLM 配置。**需要管理鉴权**。

API key 始终返回掩码占位符（`***configured***`）以防泄露。

**响应 (200)：**

```json
{
  "ok": true,
  "llmEndpoint": "https://resley-east-us-2-resource.openai.azure.com/openai/v1",
  "llmApiKey": "***configured***",
  "llmModel": "gpt-5.4-mini",
  "suggestionModel": "",
  "replyModel": "",
  "replyPrompt": "",
  "voiceRefineModel": "",
  "suggestionPrompt": "",
  "voiceRefinePrompt": ""
}
```

| 字段 | 说明 |
|------|------|
| `llmEndpoint` | Azure OpenAI 端点 URL |
| `llmApiKey` | 掩码 API key（未配置时为空） |
| `llmModel` | 所有 AI 功能的默认模型 |
| `suggestionModel` | 建议功能的模型覆盖（回退到 `llmModel`） |
| `replyModel` | 回复草稿的模型覆盖 |
| `voiceRefineModel` | 语音优化的模型覆盖 |
| `replyPrompt` | 回复草稿的自定义系统提示词 |
| `suggestionPrompt` | 后续建议的自定义系统提示词 |
| `voiceRefinePrompt` | 语音优化的自定义系统提示词 |

---

### PUT /api/ai-settings

更新 AI/LLM 配置。**需要管理鉴权**。

**请求体：**

```json
{
  "llmEndpoint": "https://your-resource.openai.azure.com/openai/v1",
  "llmApiKey": "your-api-key",
  "llmModel": "gpt-5.4-mini",
  "suggestionModel": "gpt-5.4-mini",
  "replyModel": "gpt-5.4-mini",
  "voiceRefineModel": "gpt-5.4-mini",
  "replyPrompt": "Custom prompt...",
  "suggestionPrompt": "Custom prompt...",
  "voiceRefinePrompt": "Custom prompt..."
}
```

所有字段可选，增量合并。`llmApiKey` 为 `"***configured***"` 时忽略该字段，防止误覆盖。

设置持久化在 `cl_settings` 表的 `ai` 键中。

**响应 (200)：**

```json
{ "ok": true }
```

**错误响应：**

| HTTP 状态码 | 场景 |
|------------|------|
| 400 | JSON 无效或解析错误 |
| 401 | 鉴权失败 |
| 500 | Supabase 未配置或内部错误 |

---

### GET /api/messages

分页查询持久化消息。**需要管理鉴权**。

**Query 参数：**

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `channelId` | 否 | - | 按 channel 过滤 |
| `direction` | 否 | - | 按 `inbound` 或 `outbound` 过滤 |
| `limit` | 否 | `50` | 返回条数（最大 `200`） |
| `offset` | 否 | `0` | 分页偏移 |

按时间倒序返回（最新在前）。

**响应 (200)：**

```json
{
  "ok": true,
  "messages": [
    {
      "id": "uuid",
      "channel_id": "demo",
      "sender_id": "alice",
      "agent_id": "main",
      "message_id": "msg-xxx",
      "content": "Hello",
      "content_type": "text",
      "direction": "inbound",
      "media_url": null,
      "meta": null,
      "timestamp": 1713000000000,
      "created_at": "2025-04-14T00:00:00Z"
    }
  ],
  "total": 42
}
```

未配置 Supabase 时返回空列表（`total: 0`）。

---

### GET /api/messages/stats

消息聚合统计，用于仪表盘图表。**需要管理鉴权**。

返回最近 24 小时按小时统计的消息数、模型使用分布和按 channel 统计。统计基于最近 500 条消息。

**响应 (200)：**

```json
{
  "ok": true,
  "hourly": [
    { "hour": "00:00", "inbound": 5, "outbound": 8 },
    { "hour": "01:00", "inbound": 2, "outbound": 3 }
  ],
  "models": [
    { "name": "gpt-5.4-mini", "count": 42 },
    { "name": "claude-opus-4-6", "count": 15 }
  ],
  "channels": [
    { "name": "demo", "inbound": 20, "outbound": 35 },
    { "name": "support", "inbound": 10, "outbound": 12 }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `hourly` | 24 个条目（每小时一个），含 `hour`（HH:MM）、`inbound` 和 `outbound` 计数 |
| `models` | 出站消息 `meta.model` 的模型使用统计，按数量降序 |
| `channels` | 按 channel 的入站/出站计数，按总数降序 |

未配置 Supabase 时所有数组为空。

---

### POST /api/suggestions

AI 驱动的后续建议或回复草稿生成。**需要管理鉴权或 Channel 用户鉴权**。

两种模式：
- `suggestions`（默认）：从用户角度生成 3-5 个后续建议
- `reply`：为最后一条助手消息生成回复草稿

**请求体：**

```json
{
  "messages": [
    { "role": "user", "text": "How do I deploy this?" },
    { "role": "assistant", "text": "You can deploy using..." }
  ],
  "prompt": "Optional additional instructions",
  "mode": "suggestions"
}
```

| 字段 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `messages` | 否 | `[]` | 对话历史（建议模式取最后 6 条，回复模式取最后 10 条），文本截断到 300 字符 |
| `prompt` | 否 | `""` | 附加到系统提示词的用户指令 |
| `mode` | 否 | `"suggestions"` | `"suggestions"` 或 `"reply"` |

**响应 (200) - suggestions 模式：**

```json
{
  "ok": true,
  "mode": "suggestions",
  "suggestions": ["How do I deploy?", "Any alternatives?", "Tell me more"]
}
```

**响应 (200) - reply 模式：**

```json
{
  "ok": true,
  "mode": "reply",
  "reply": "Got it, I'll deploy it now."
}
```

**错误响应：**

| HTTP 状态码 | 场景 |
|------------|------|
| 401 | 鉴权失败 |
| 500 | LLM API key 未配置、LLM 请求失败或内部错误 |

---

### POST /api/voice-refine

使用 AI 优化语音转写文本。修正识别错误、去除填充词、改善语法同时保留原意。**需要管理鉴权或 Channel 用户鉴权**。

**请求体：**

```json
{
  "text": "嗯那个就是我想问一下怎么怎么部署这个项目",
  "messages": [
    { "role": "user", "text": "Previous message context" },
    { "role": "assistant", "text": "Response context" }
  ],
  "prompt": "Optional additional instructions"
}
```

| 字段 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `text` | 是 | - | 待优化的原始语音转写文本 |
| `messages` | 否 | `[]` | 近期对话历史（取最后 20 条），文本截断到 300 字符 |
| `prompt` | 否 | `""` | 附加到系统提示词的用户指令 |

**响应 (200)：**

```json
{
  "ok": true,
  "refined": "我想问一下怎么部署这个项目"
}
```

**错误响应：**

| HTTP 状态码 | 场景 |
|------------|------|
| 400 | `text` 为空或缺失 |
| 401 | 鉴权失败 |
| 500 | LLM API key 未配置、LLM 请求失败或内部错误 |

---

### GET /api/messages/sync

同步消息历史，支持正向和反向分页。**需要管理鉴权或 Channel 鉴权**。

**Query 参数：**

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `channelId` | ✅ | - | 目标 channel（仅允许 `[a-zA-Z0-9._-]`） |
| `after` | 否 | - | 正向同步：获取此时间戳之后的消息 |
| `before` | 否 | - | 反向同步：获取此时间戳之前的消息 |
| `agentId` | 否 | - | 按 Agent 过滤（仅允许 `[a-zA-Z0-9._-]`） |
| `limit` | 否 | `100` | 返回条数上限，最大 `500` |

**分页行为：**

- `after > 0`：正向分页，按时间升序返回
- `before > 0 && !after`：反向分页，按时间降序查询后翻转为时间升序返回
- 两者都不传：返回最新的 `limit` 条消息

**响应 (200)：**

```json
{
  "ok": true,
  "messages": [
    {
      "id": 1,
      "channel_id": "demo",
      "sender_id": "alice",
      "agent_id": "main",
      "message_id": "msg-xxx",
      "content": "你好",
      "content_type": "text",
      "direction": "inbound",
      "media_url": null,
      "thread_id": "clawline-thread-xxx",
      "meta": "{\"source\":\"api\"}",
      "timestamp": 1713000000000
    }
  ],
  "hasMore": false
}
```

> `hasMore` 为 `true` 时表示还有更多消息，可使用最后一条的 `timestamp` 作为下一次请求的 `after` 或 `before` 参数。

---

### GET /api/relay-nodes

获取 Relay 节点注册表（存储在 Supabase `cl_relay_nodes` 表中）。**需要管理鉴权**。

未配置 Supabase 时返回空列表：

```json
{ "ok": true, "nodes": [], "source": "none" }
```

已配置 Supabase：

```json
{
  "ok": true,
  "nodes": [
    { "id": "sg-1", "name": "relay-sg", "url": "https://relay-sg.example.com", "adminToken": "xxx" }
  ],
  "source": "supabase"
}
```

---

### POST /api/relay-nodes

创建或更新 Relay 节点注册信息。**需要管理鉴权**，需要 Supabase 配置。

**请求体：**

```json
{
  "id": "sg-1",
  "name": "relay-sg",
  "url": "https://relay-sg.example.com",
  "adminToken": "optional-admin-token"
}
```

- `id`、`name`、`url` 为必填

---

### DELETE /api/relay-nodes/:nodeId

删除 Relay 节点注册信息。**需要管理鉴权**，需要 Supabase 配置。

---

### POST /api/media/upload

上传媒体文件。支持三种上传方式：

#### 1. Multipart 表单上传

```
Content-Type: multipart/form-data; boundary=...
```

请求体中包含文件字段。

#### 2. JSON Base64 上传

```json
{
  "data": "base64-encoded-content-or-data-url",
  "filename": "photo.jpg",
  "mimeType": "image/jpeg"
}
```

#### 3. 裸二进制上传

```
Content-Type: image/png
```

可通过 query 参数 `?filename=photo.png` 指定文件名。

**鉴权方式**（任一即可）：

- Admin Token（header 或 query）
- Logto JWT Bearer
- Channel Secret（`X-Channel-Secret` header）
- Channel User Token（Bearer 或 query）

**限制：**

- 最大文件大小：10 MB
- 文件自动过期：7 天

**响应：**

```json
{
  "ok": true,
  "id": "uuid",
  "fileName": "uuid.jpg",
  "url": "https://relay.example.com/api/media/uuid.jpg",
  "mimeType": "image/jpeg",
  "size": 102400
}
```

---

### GET /api/media/:filename

下载已上传的媒体文件，**无需鉴权**。

支持的 MIME 类型：

| 扩展名 | MIME |
|--------|------|
| `.jpg` `.jpeg` | `image/jpeg` |
| `.png` | `image/png` |
| `.gif` | `image/gif` |
| `.webp` | `image/webp` |
| `.svg` | `image/svg+xml` |
| `.mp3` | `audio/mpeg` |
| `.ogg` | `audio/ogg` |
| `.wav` | `audio/wav` |
| `.mp4` | `video/mp4` |
| `.webm` | `video/webm` |
| `.pdf` | `application/pdf` |

响应包含 `Cache-Control: public, max-age=86400` 缓存头。

---

## WebSocket 协议

### /backend — 插件后端连接

OpenClaw 插件作为 backend 连接此端点。

**连接地址：**

```
ws://127.0.0.1:19080/backend
```

#### 握手流程

1. 插件连接 `/backend`
2. 5 秒内必须发送 `relay.backend.hello` 帧
3. 网关验证 channelId + secret
4. 验证通过返回 `relay.backend.ack`
5. 同一 channelId 的旧 backend 连接会被替换断开

#### 消息帧格式

**backend → 网关：**

```json
{
  "type": "relay.backend.hello",
  "channelId": "demo",
  "secret": "channel-secret",
  "instanceId": "openclaw-sg-1"
}
```

```json
{
  "type": "relay.server.event",
  "connectionId": "client-uuid",
  "event": { /* 任意 JSON 事件，转发给客户端 */ }
}
```

```json
{
  "type": "relay.server.reject",
  "connectionId": "client-uuid",
  "code": 1008,
  "message": "reason"
}
```

```json
{
  "type": "relay.server.close",
  "connectionId": "client-uuid",
  "code": 1000,
  "reason": "done"
}
```

**网关 → backend：**

```json
{
  "type": "relay.backend.ack",
  "channelId": "demo",
  "timestamp": 1711100000000
}
```

```json
{
  "type": "relay.backend.error",
  "message": "backend auth failed",
  "timestamp": 1711100000000
}
```

```json
{
  "type": "relay.client.open",
  "connectionId": "client-uuid",
  "query": {
    "rawQuery": "?channelId=demo&token=xxx&chatId=chat1",
    "channelId": "demo",
    "chatId": "chat1",
    "agentId": "agent1",
    "token": "user-token"
  },
  "authUser": {
    "id": "user1",
    "senderId": "user1",
    "chatId": null,
    "token": "xxx",
    "allowAgents": null,
    "enabled": true
  },
  "timestamp": 1711100000000
}
```

```json
{
  "type": "relay.client.event",
  "connectionId": "client-uuid",
  "event": { /* 客户端发送的 JSON 事件 */ },
  "timestamp": 1711100000000
}
```

```json
{
  "type": "relay.client.close",
  "connectionId": "client-uuid",
  "code": 1000,
  "reason": "closed",
  "timestamp": 1711100000000
}
```

---

### /client — 客户端连接

第三方客户端（Web 页面等）连接此端点与 backend 通信。

**连接地址：**

```
wss://relay.example.com/client?channelId=demo&token=user-token&chatId=chat1&agentId=agent1
```

#### Query 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `channelId` | ✅ | 目标 channel |
| `token` | 条件 | 当 channel 配置了用户列表时必填，用于客户端鉴权 |
| `chatId` | 否 | 会话标识，透传给 backend |
| `agentId` | 否 | Agent 标识，透传给 backend |

> 注意：`token` 参数名可以通过 channel 的 `tokenParam` 配置自定义（默认为 `token`）。

#### 连接规则

- `channelId` 不存在 → 立即关闭（code 1008）
- backend 未连接 → 立即关闭（code 1013）
- token 验证失败 → 立即关闭（code 1008）
- 如果 channel 没有配置任何用户，token 不校验，原始 query 透传给 backend

#### 消息格式

客户端和 backend 之间的消息均为 JSON 格式，网关透明转发：

- 客户端发送任意 JSON → 网关包装为 `relay.client.event` 转发给 backend
- backend 发送 `relay.server.event` → 网关提取 `event` 字段转发给客户端

---

## CORS

所有 REST API 端点默认启用 CORS：

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: content-type, authorization, x-relay-admin-token
Access-Control-Max-Age: 86400
```

---

## 错误响应

所有 API 错误返回统一格式：

```json
{
  "ok": false,
  "error": "错误描述"
}
```

| HTTP 状态码 | 场景 |
|------------|------|
| 400 | 参数缺失、JSON 解析失败、payload 过大 |
| 401 | 鉴权失败 |
| 404 | channel/user/文件不存在 |
| 413 | 上传文件超过 10 MB 限制 |
| 500 | 服务器内部错误 |

---

## 运维细节

### 限流

网关所有限流均使用**令牌桶**算法。

| 层级 | 限制 | 窗口 | 维度 |
|------|------|------|------|
| HTTP 请求 | 100 次 | 1 分钟 | 按 IP |
| WebSocket 消息 | 30 条 | 1 分钟 | 按连接 |
| WebSocket 连接 | 50 并发 | - | 按 IP |

**超限行为：**

- HTTP：返回 `429 Too Many Requests`
- WS 消息：静默丢弃并关闭连接（code `1008`）
- WS 连接：拒绝 upgrade 请求

**清理：** 每 5 分钟清理空闲超过 5 分钟的 HTTP 限流桶。

---

### Logto JWT 鉴权

JWT 验证使用 [jose](https://github.com/panva/jose) 库和远程 JWKS 端点。

| 参数 | 值 |
|------|---|
| JWKS 端点 | `${LOGTO_ENDPOINT}/oidc/jwks`（默认: `https://logto.dr.restry.cn/oidc/jwks`） |
| Issuer | `${LOGTO_ENDPOINT}/oidc` |
| Audience | `LOGTO_API_RESOURCE` 环境变量（默认: `https://gateway.clawlines.net/api`） |

**流程：**

1. 提取 `Authorization: Bearer <token>` header
2. 使用远程 JWKS 密钥集验证 JWT 签名（`jose` 缓存密钥）
3. 验证 `iss` 和 `aud` claims
4. 成功则视为完全鉴权（等同 admin token）
5. 失败（过期、签名无效、audience 不匹配）则降级到下一个鉴权方式

鉴权检查顺序：admin token → Logto JWT。`requireAuthAny` 端点最后检查 channel user token。

---

### 媒体文件生命周期

| 阶段 | 详情 |
|------|------|
| 存储目录 | `${CL_DATA_DIR}/media/`（启动时创建） |
| 最大文件大小 | 10 MB (`MEDIA_MAX_BYTES`) |
| TTL | 7 天（基于文件修改时间） |
| 清理间隔 | 每 1 小时 |
| 文件命名 | `<uuid>.<ext>`，不保留原文件名 |
| 公开 URL | `GET /api/media/<filename>`（无需鉴权，`Cache-Control: public, max-age=86400`） |

**支持的 MIME 类型（按扩展名推断）：**

| 类别 | 扩展名 |
|------|--------|
| 图片 | `.jpg` `.jpeg` `.png` `.gif` `.webp` `.svg` |
| 音频 | `.mp3` `.ogg` `.wav` |
| 视频 | `.mp4` `.webm` |
| 文档 | `.pdf` |

**上传方式：** multipart form-data、JSON base64 编码 `data` 字段、或 raw binary body + `Content-Type` header。详见上方 `POST /api/media/upload`。

**清理机制：** `setInterval` 定时器每小时运行，遍历媒体目录，删除 `mtime` 超过 7 天的文件。

---

### 虚拟连接（POST /api/chat 内部机制）

`/api/chat` 端点创建**虚拟 WebSocket 连接**，将 HTTP 请求/响应桥接到现有 WebSocket 消息流。

**生命周期：**

1. 验证鉴权和请求体
2. 生成虚拟连接 ID（`api-<uuid>`）和消息 ID（`api-<timestamp>-<short-uuid>`）
3. 入站消息持久化到 Supabase（`meta.source: "api"`）
4. 广播入站消息到该 channel 所有已连接的 WS 客户端
5. 在 `global._apiCallbacks` 中注册回调
6. 在 `clientConnections` 中插入虚拟条目（`ws: null`、`isApi: true`）
7. 向 backend 发送 `relay.client.open`，等待 50ms，发送 `relay.client.event`
8. 等待 backend 通过 `relay.server.event` 回复 `message.send` 事件
9. 收到回复：清除超时、提取响应内容、返回 HTTP 200
10. **清理（始终执行）：** 删除回调和虚拟连接条目，向 backend 发送 `relay.client.close`

| 参数 | 值 |
|------|---|
| 超时 | 120 秒（超时返回 HTTP 504） |
| 连接 ID 格式 | `api-<uuid>` |
| Backend 通知 | 收到 `relay.client.open` / `relay.client.event` / `relay.client.close`，与真实客户端相同 |
| 消息持久化 | 入站和出站消息均持久化，带 `meta.source: "api"` |
