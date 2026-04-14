# 故障排查

本文档整理了 Clawline 开发和部署中的常见问题及解决方法。

## 连接问题

### WebSocket 连接失败

**现象**：客户端一直处于 "connecting" 状态，或立即报错断开。

**排查步骤**：

1. **检查 URL 格式**
   - SDK 默认连接地址：`wss://gateway.clawlines.net/client`
   - 本地开发应使用 `ws://localhost:19080/client`（注意是 `ws://` 而非 `wss://`）
   - 路径必须以 `/client` 结尾（客户端）或 `/backend` 结尾（Channel Plugin）
   - URL 中不要遗漏端口号

2. **检查协议匹配**
   - `https://` 页面只能使用 `wss://` 连接（浏览器安全策略）
   - `http://localhost` 页面可以使用 `ws://` 连接
   - 如果使用反向代理，确认代理已正确配置 WebSocket upgrade

3. **检查 Gateway 是否启动**
   ```bash
   curl http://localhost:19080/healthz
   # 正常返回: {"status":"ok","uptime":...}
   ```

### Gateway 返回 1008 (Policy Violation)

**含义**：Gateway 主动关闭连接，原因为鉴权失败或请求格式错误。

**常见原因**：

| 场景 | close reason | 解决方法 |
|------|-------------|---------|
| 未传 token 或 token 无效 | `auth failed` | 检查 URL 中的 `?token=xxx` 参数，确认 token 已在 Channel 用户列表中注册 |
| 缺少 channelId | `missing channelId` | 连接 URL 必须包含 `?channelId=xxx` 参数 |
| channelId 不存在 | `unknown channelId` | 检查 Gateway 管理后台确认 Channel 已创建 |
| 后端连接鉴权失败 | `backend auth failed` | Channel Plugin 的 secret 与 Gateway 中配置的不匹配 |
| 后端未发送 hello | `missing relay.backend.hello` | Channel Plugin 连接后必须在限定时间内发送 hello 帧 |
| 限流触发 | `rate limit exceeded` | 客户端发送消息超过 30 条/分钟 |

### Gateway 返回 1013 (Try Again Later)

**含义**：`backend unavailable` -- 客户端对应的 Channel 没有活跃的后端连接。

**排查步骤**：

1. 确认 Channel Plugin / OpenClaw Agent 进程正在运行
2. 检查 Channel Plugin 日志，确认其已成功连接到 Gateway `/backend`
3. 通过 Gateway 状态 API 查看后端连接：
   ```bash
   curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
     http://localhost:19080/api/state
   ```
   在返回结果中检查对应 Channel 的 `backends` 数组是否非空。

### 频繁断线重连

**可能原因**：

1. **空闲超时**：SDK 默认 5 分钟无消息收发后会断开连接（`IDLE_TIMEOUT_MS: 300000`）。可以通过配置 `idleTimeoutMs` 调整或设为 `0` 禁用。

2. **心跳配置**：客户端应定期发送 `ping` 事件保活，Gateway 会回复 `pong`。如果网络中间设备（如负载均衡器）有自己的空闲超时，需确保心跳间隔小于该超时值。

3. **网络不稳定**：SDK 内置自动重连，最多尝试 6 次（`MAX_RECONNECT_ATTEMPTS: 6`），使用指数退避。如果持续断连，检查网络质量。

4. **反向代理超时**：Nginx 默认 WebSocket 连接 60 秒超时。需配置：
   ```nginx
   proxy_read_timeout 3600s;
   proxy_send_timeout 3600s;
   ```

---

## 消息问题

### 消息发送后无回复

**排查步骤**：

1. **确认消息已送达 Gateway**：在 Gateway 日志中查找对应的 `message.receive` 事件。
2. **确认后端已连接**：使用 `/api/state` 检查 Channel 是否有活跃的 backend 连接。
3. **确认 Agent 正在运行**：检查 OpenClaw Agent 进程日志，确认其收到了消息并开始处理。
4. **检查 LLM API 调用**：如果 Agent 使用外部 LLM API（如 Azure OpenAI），检查 API key 是否有效，配额是否充足。

### 消息重复

**可能原因**：

- 网络抖动导致客户端重发同一消息
- 多个 WebSocket 连接同时活跃（SDK 限制最多 `MAX_ACTIVE_CONNECTIONS: 3` 个并发连接）

**解决方法**：
- 利用 `messageId` 进行去重。每条消息都有唯一的 ID（格式：`{prefix}-{timestamp}-{random}`），Gateway 和客户端可基于此过滤重复消息。

### 流式消息中断

**现象**：Agent 回复到一半突然停止，没有收到 `message.send` 完成事件。

**排查步骤**：

1. 检查 Agent 端日志，确认 LLM 流式输出是否正常完成
2. 检查 Gateway 与 Agent 之间的 WebSocket 连接是否断开
3. 如果是 LLM API 超时，检查超时配置
4. 客户端应对流式消息设置超时，超时后展示已收到的部分内容

### 限流被断开

**现象**：连接被关闭，close code 为 `1008`，reason 为 `rate limit exceeded`。

**详情**：
- Gateway 对每个客户端 WebSocket 连接限制 **30 条消息/分钟**
- HTTP API 限制 **100 请求/分钟/IP**
- 每个 IP 最多 **50 个并发连接**

**解决方法**：
- 控制消息发送频率，避免短时间内大量发送
- 如果业务确实需要更高限额，修改 Gateway 的 `WS_MSG_RATE_LIMIT` 配置

---

## 部署问题

### Supabase 连接失败

**现象**：Gateway 启动后无法持久化消息，或 `/api/messages/sync` 返回错误。

**排查步骤**：

1. 检查环境变量是否正确设置：
   ```bash
   # 必须配置
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
   ```

2. 验证 `service_role_key` 是否有效（注意不是 `anon` key）：
   ```bash
   curl -H "apikey: YOUR_SERVICE_ROLE_KEY" \
     -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
     https://xxxxx.supabase.co/rest/v1/
   ```

3. 检查 Supabase 项目是否处于暂停状态（免费层项目 7 天无活动会暂停）

### 媒体上传失败

**限制**：
- 单个文件最大 **10MB**（Gateway `maxPayload` 配置）
- 小于 100KB 的文件通过 Base64 内嵌在消息中
- 大于等于 100KB 的文件需通过 `/api/media/upload` 上传

**常见错误**：
- `413 Payload Too Large`：文件超过大小限制
- `401 Unauthorized`：上传时未携带有效的 Channel User Token

### CORS 错误

**现象**：浏览器控制台报 `Access-Control-Allow-Origin` 错误。

**原因**：Gateway 默认允许所有来源（`isOriginAllowed()` 无白名单时返回 `true`）。如果配置了白名单但未包含当前域名，请求会被拒绝。

**解决方法**：

在 Gateway 配置中添加允许的来源：
```bash
RELAY_CORS_ORIGINS=https://your-domain.com,https://another-domain.com
```

### HTTPS / WSS 配置

生产环境必须使用 HTTPS 和 WSS。推荐使用 Caddy（自动 HTTPS）或 Nginx 反向代理。

**Caddy 配置示例**：
```caddyfile
relay.yourdomain.com {
    reverse_proxy localhost:19080
}
```

Caddy 会自动处理 TLS 证书和 WebSocket upgrade。

**Nginx 配置示例**：
```nginx
server {
    listen 443 ssl;
    server_name relay.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:19080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

> **注意**：使用反向代理时，`X-Forwarded-For` 头会被信任用于限流。务必确保只有受信代理能设置此头部，否则攻击者可伪造 IP 绕过限流。

---

## 开发调试

### 如何查看 Gateway 日志

Gateway 使用 `console.log` / `console.warn` 输出日志，前缀为 `[relay]`。

```bash
# 启动并查看日志
node gateway/server.js 2>&1 | tee gateway.log

# 过滤关键事件
node gateway/server.js 2>&1 | grep -E "\[relay\]"
```

如果使用 PM2 管理进程：
```bash
pm2 logs gateway
```

### 如何测试 WebSocket 连接

使用 [wscat](https://github.com/websockets/wscat) 工具：

```bash
# 安装
npm install -g wscat

# 测试客户端连接
wscat -c "ws://localhost:19080/client?channelId=YOUR_CHANNEL_ID&token=YOUR_TOKEN"

# 连接成功后发送测试消息
> {"type":"message.receive","data":{"content":"hello","messageId":"test-001"}}
```

在浏览器开发者工具中调试：
```javascript
const ws = new WebSocket('ws://localhost:19080/client?channelId=xxx&token=yyy');
ws.onopen = () => console.log('connected');
ws.onmessage = (e) => console.log('received:', JSON.parse(e.data));
ws.onclose = (e) => console.log('closed:', e.code, e.reason);
ws.onerror = (e) => console.error('error:', e);
```

### 如何验证 Admin Token

Gateway 启动时，如果未设置 `RELAY_ADMIN_TOKEN` 环境变量，会自动生成一个随机 token 并输出到日志：

```
[relay] RELAY_ADMIN_TOKEN not set, generated random admin token:
[relay]    a1b2c3d4e5f6...
```

使用 Admin Token 调用管理 API：
```bash
# 通过 Authorization header（推荐）
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  http://localhost:19080/api/state

# 通过查询参数（不推荐，token 会记录在日志中）
curl "http://localhost:19080/api/state?adminToken=YOUR_ADMIN_TOKEN"
```

### 常用诊断 API

| 端点 | 鉴权 | 用途 |
|------|------|------|
| `GET /healthz` | 无需鉴权 | 健康检查，返回运行状态和 uptime |
| `GET /api/state` | Admin Token | 查看所有 Channel、活跃连接、后端状态 |
| `GET /api/meta` | Admin Token | 查看 Gateway 元信息和配置 |

**健康检查示例**：
```bash
$ curl http://localhost:19080/healthz
{"status":"ok","uptime":3600,"connections":5,"channels":2}
```

**查看系统状态**：
```bash
$ curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
    http://localhost:19080/api/state | jq .

# 重点关注：
# - channels[].backends: 后端连接列表（空 = Agent 未连接）
# - channels[].clients: 客户端连接数
```

---

## 下一步

- [架构概览](./architecture) -- 理解系统组件和消息流转
- [快速开始](./quickstart) -- 动手跑起来
