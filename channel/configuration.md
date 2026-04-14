# 配置参考

所有配置位于 `channels.clawline`（配置文件 `~/.openclaw/openclaw.json`）。Schema 由 [`config-schema.ts`](https://github.com/clawline/channel/blob/main/src/generic/config-schema.ts) 使用 Zod 定义，启动时校验。

---

## 配置 Schema

### 顶层选项

| 选项 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| `enabled` | `boolean` | `false` | 否 | 总开关 |
| `connectionMode` | `"websocket" \| "relay" \| "webhook"` | `"websocket"` | 否 | 连接模式 |
| `wsPort` | `integer` | `8080` | 否 | WebSocket 监听端口 |
| `wsPath` | `string` | `"/ws"` | 否 | WebSocket 路径 |
| `webhookPath` | `string` | `"/generic/events"` | 否 | Webhook 路径 |
| `webhookPort` | `integer` | `3000` | 否 | Webhook 端口 |
| `webhookSecret` | `string` | -- | 否 | Webhook HMAC 签名密钥 |
| `dmPolicy` | `"open" \| "pairing" \| "allowlist"` | `"open"` | 否 | 私聊权限策略 |
| `allowFrom` | `string[]` | -- | 否 | 允许的发送者 ID（仅 `allowlist` 模式有效） |
| `historyLimit` | `integer` | `10` | 否 | 每会话服务端历史消息数 |
| `textChunkLimit` | `integer` | `4000` | 否 | 单条出站消息最大字符数 |
| `mediaMaxMb` | `number` | `30` | 否 | 入站媒体文件最大体积 (MB) |
| `auth` | `object` | -- | 否 | 认证配置 |
| `relay` | `object` | -- | 否 | Relay 模式配置 |
| `transcription` | `object` | -- | 否 | 语音转写配置 |

### 认证 (`auth`)

| 选项 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| `auth.enabled` | `boolean` | `false` | 否 | 启用 Token 认证 |
| `auth.tokenParam` | `string` | `"token"` | 否 | URL 查询参数名 |
| `auth.users` | `AuthUser[]` | `[]` | 否 | 授权用户列表 |

#### AuthUser 条目

| 字段 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| `id` | `string` | -- | 否 | 用户 ID，缺省取 `senderId` |
| `senderId` | `string` | -- | **是** | 强制绑定的发送者身份 |
| `chatId` | `string` | -- | 否 | 限定会话（旧版兼容） |
| `token` | `string` | -- | **是** | 认证令牌（时间安全比较） |
| `allowAgents` | `string[]` | -- | 否 | 限定可用 Agent，含 `"*"` 表示全部 |
| `enabled` | `boolean` | `true` | 否 | 是否启用 |

### Relay (`relay`)

| 选项 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| `relay.url` | `string` | -- | **是** | Relay 网关 `/backend` 端点 URL |
| `relay.channelId` | `string` | -- | **是** | 频道 ID，需与网关匹配 |
| `relay.secret` | `string` | -- | **是** | 共享密钥 |
| `relay.instanceId` | `string` | -- | 否 | 实例标识（调试用） |
| `relay.reconnectIntervalMs` | `integer` | `3000` | 否 | 重连间隔 (ms) |
| `relay.connectTimeoutMs` | `integer` | `10000` | 否 | 连接超时 (ms) |

### 转写 (`transcription`)

| 选项 | 类型 | 默认值 | 必填 | 说明 |
|------|------|--------|------|------|
| `transcription.enabled` | `boolean` | `false` | 否 | 启用语音转写 |
| `transcription.provider` | `"faster-whisper"` | `"faster-whisper"` | 否 | 转写后端 |
| `transcription.applyToVoice` | `boolean` | `true` | 否 | 转写语音消息 |
| `transcription.applyToAudio` | `boolean` | `true` | 否 | 转写音频消息 |
| `transcription.pythonPath` | `string` | -- | 否 | Python 路径 |
| `transcription.model` | `string` | `"tiny"` | 否 | 模型大小 |
| `transcription.language` | `string` | -- | 否 | ISO 639-1 语言码（留空自动检测） |
| `transcription.device` | `string` | `"cpu"` | 否 | `"cpu"` 或 `"cuda"` |
| `transcription.computeType` | `string` | `"int8"` | 否 | 量化类型 |
| `transcription.timeoutMs` | `integer` | `120000` | 否 | 单次转写超时 (ms) |

---

## 连接模式

### WebSocket 模式

插件启动独立 WebSocket 服务器，客户端直连。适合本地开发和内网。

```yaml
channels:
  clawline:
    enabled: true
    connectionMode: "websocket"
    wsPort: 8080
    wsPath: "/ws"
```

客户端连接：`ws://<host>:8080/ws`

带认证：

```yaml
channels:
  clawline:
    enabled: true
    connectionMode: "websocket"
    wsPort: 18080
    auth:
      enabled: true
      users:
        - senderId: "alice"
          token: "gc_alice_secret123"
```

客户端连接：`ws://<host>:18080/ws?token=gc_alice_secret123`

### Relay 模式

插件作为后端客户端连接到 [Clawline Relay Gateway](https://github.com/clawline/gateway)。适合 NAT/防火墙后的公网部署。

```yaml
channels:
  clawline:
    enabled: true
    connectionMode: "relay"
    relay:
      url: "ws://relay.example.com:19080/backend"
      channelId: "production"
      secret: "a-strong-shared-secret"
      instanceId: "openclaw-sg-1"
    auth:
      enabled: true
      users:
        - senderId: "user-42"
          token: "gc_user42_xxxxxxxxx"
```

用户连接网关：`ws://relay.example.com:19080/client?channelId=production&token=gc_user42_xxxxxxxxx`

### Webhook 模式

插件启动 HTTP 服务器接收 POST 请求。适合 HTTP 回调集成，不推荐作为主交互通道。

```yaml
channels:
  clawline:
    enabled: true
    connectionMode: "webhook"
    webhookPath: "/generic/events"
    webhookPort: 3000
    webhookSecret: "hmac-signature-secret"
```

---

## 认证机制

1. 客户端连接时在查询参数带上 Token：`ws://host/ws?token=gc_xxx`
2. 服务端使用时间安全比较匹配 `auth.users` 中的条目
3. 匹配成功后，连接的 `senderId` 被强制覆盖为用户条目配置值
4. 设置了 `chatId` 的条目只能访问该会话
5. 设置了 `allowAgents` 的条目只能使用指定 Agent
6. 无匹配返回 HTTP 401

### 多用户配置示例

```yaml
auth:
  enabled: true
  users:
    - id: "alex"
      senderId: "alex"
      token: "gc_alex_xxxxxxxxx"
      allowAgents: ["main", "writer"]
    - id: "bob"
      senderId: "bob"
      token: "gc_bob_xxxxxxxxx"
      allowAgents: ["main"]
    - id: "viewer"
      senderId: "viewer"
      token: "gc_viewer_xxxxxxxxx"
      enabled: false          # 已禁用
```

### DM 策略

| 值 | 行为 |
|---|---|
| `"open"` | 任何人可发起私聊 |
| `"pairing"` | 需先配对审批 |
| `"allowlist"` | 仅 `allowFrom` 列表中的 ID 可发消息 |

---

## 转写配置

使用 [faster-whisper](https://github.com/SYSTRAN/faster-whisper) 转写语音/音频消息。需要 **ffmpeg** 和安装了 `faster-whisper` 的 **Python**。

### Python 解析顺序

1. `transcription.pythonPath`
2. `GENERIC_CHANNEL_TRANSCRIBE_PYTHON` 环境变量
3. `$HOME/.openclaw/workspace/.venv/bin/python`
4. `python3` (PATH)
5. `python` (PATH)

### 模型选择

| 模型 | 参数量 | 速度 | 英文质量 | 多语言质量 |
|------|--------|------|----------|-----------|
| `tiny` | 39M | 最快 | 一般 | 基础 |
| `base` | 74M | 快 | 良好 | 一般 |
| `small` | 244M | 中等 | 很好 | 良好 |
| `medium` | 769M | 慢 | 优秀 | 很好 |
| `large-v2` | 1550M | 最慢 | 接近人类 | 优秀 |
| `large-v3` | 1550M | 最慢 | 接近人类 | 优秀 |

低延迟场景推荐 `tiny`，对准确性有要求时选 `small` 及以上。

### 完整示例

```yaml
channels:
  clawline:
    enabled: true
    connectionMode: "websocket"
    wsPort: 18080
    transcription:
      enabled: true
      pythonPath: "/home/user/.venv/bin/python"
      model: "small"
      language: "zh"
      device: "cuda"
      computeType: "float16"
      timeoutMs: 60000
      applyToVoice: true
      applyToAudio: true
```

---

## 限制与调优

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `historyLimit` | `10` | 每会话历史消息数。设 `0` 禁用。值越大内存占用越高 |
| `textChunkLimit` | `4000` | 超长回复自动分片 |
| `mediaMaxMb` | `30` MB | 入站媒体大小限制 |

---

## 环境变量

| 变量 | 用途 |
|------|------|
| `GENERIC_CHANNEL_TRANSCRIBE_PYTHON` | 覆盖转写 Python 路径（优先级低于配置文件的 `pythonPath`） |
| `HOME` | 构建默认 Python venv 路径 |

---

## 配置校验

Schema 使用 `.strict()` 模式，未知字段会被拒绝。

| 规则 | 说明 |
|------|------|
| 严格对象 | 字段名拼错（如 `wsport`）会报错 |
| 正整数 | 端口、超时必须为正整数 |
| URL 格式 | `relay.url` 必须为有效 URL |
| 非空字符串 | `relay.channelId` 和 `relay.secret` |
| 枚举值 | `connectionMode`、`dmPolicy` 仅接受文档中的值 |

校验命令：

```bash
openclaw config validate
```

---

## 完整配置示例

```yaml
channels:
  clawline:
    enabled: true
    connectionMode: "websocket"
    wsPort: 18080
    wsPath: "/ws"
    webhookPath: "/generic/events"
    webhookPort: 3000
    webhookSecret: "hmac-secret"
    relay:
      url: "ws://relay.example.com:19080/backend"
      channelId: "production"
      secret: "shared-secret"
      instanceId: "openclaw-sg-1"
      reconnectIntervalMs: 5000
      connectTimeoutMs: 15000
    auth:
      enabled: true
      tokenParam: "token"
      users:
        - id: "alex"
          senderId: "alex"
          token: "gc_alex_xxxxxxxxx"
          allowAgents: ["main", "writer"]
          enabled: true
        - id: "bob"
          senderId: "bob"
          token: "gc_bob_xxxxxxxxx"
          allowAgents: ["main"]
    dmPolicy: "allowlist"
    allowFrom: ["alex", "bob"]
    historyLimit: 20
    textChunkLimit: 4000
    mediaMaxMb: 30
    transcription:
      enabled: true
      provider: "faster-whisper"
      pythonPath: "/home/user/.venv/bin/python"
      model: "small"
      language: "en"
      device: "cpu"
      computeType: "int8"
      timeoutMs: 120000
      applyToVoice: true
      applyToAudio: true
```

---

## 参考

- [安装指南](/channel/setup)
- [配置示例](/channel/CONFIG_EXAMPLES_ZH)
- [集成指南](/channel/INTEGRATION_GUIDE)
- [事件参考](/channel/events-reference)
- [Relay 网关](/gateway/)
