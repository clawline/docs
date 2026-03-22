# 快速开始

用 5 分钟把 Clawline 跑起来，在浏览器中和你的 OpenClaw Agent 对话。

## 前提

- 一台 OpenClaw 节点（已有 Agent 在运行）
- Node.js 18+
- 一台有公网 IP 的服务器（用于 Relay），或本机测试

## 第一步：启动 Relay Gateway

```bash
git clone https://github.com/clawline/gateway.git
cd gateway

npm install

# 最简启动（本地文件存储，适合开发）
RELAY_PORT=19080 npm start
```

Relay 启动后会在 `http://localhost:19080` 提供服务。

::: tip 生产部署
生产环境建议配置 Supabase 作为持久存储，并用 Caddy/Nginx 提供 HTTPS。详见 [Gateway 部署指南](/gateway/deploy)。
:::

## 第二步：创建 Channel

通过 Admin API 创建一个 Channel：

```bash
curl -X POST http://localhost:19080/api/channels \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_ADMIN_KEY" \
  -d '{
    "id": "my-agent",
    "name": "My Agent",
    "secret": "a-random-32-char-secret-string-here",
    "users": [
      { "token": "user-token-001", "senderId": "alice", "name": "Alice" }
    ]
  }'
```

记下 Channel ID（`my-agent`）和用户 Token（`user-token-001`）。

## 第三步：安装 Channel Plugin

在 OpenClaw 节点上：

```bash
openclaw plugins install @restry/clawline
```

编辑 `~/.openclaw/openclaw.json`，添加 Channel 配置：

```json
{
  "channels": {
    "clawline": {
      "enabled": true,
      "connectionMode": "relay",
      "relay": {
        "url": "wss://your-relay-domain.com",
        "channelId": "my-agent",
        "secret": "a-random-32-char-secret-string-here"
      }
    }
  }
}
```

重启 Gateway：

```bash
openclaw gateway restart
```

看到日志中出现 `relay backend connected` 就成功了。

## 第四步：启动 Client Web

```bash
git clone https://github.com/clawline/client-web.git
cd client-web

npm install
npm run dev
```

打开浏览器，在连接配置中填入：

- Relay 地址：`wss://your-relay-domain.com`（本地测试用 `ws://localhost:19080`）
- Channel ID：`my-agent`
- Token：`user-token-001`

发送一条消息，你应该能看到 Agent 的回复。🎉

## 验证清单

| 功能 | 验证方式 |
|------|---------|
| 基本对话 | 发消息，收到 AI 回复 |
| 流式输出 | 回复过程中看到文字逐步出现 |
| 文件发送 | 发送一张图片，Agent 能识别 |
| 断线续传 | 刷新页面，历史消息还在 |

## 下一步

- [Relay Gateway 详细配置](/gateway/) — Supabase 持久化、HTTPS、多 Channel
- [Channel Plugin 配置](/channel/) — 高级选项、多节点
- [Client Web 定制](/client-web/) — 主题、嵌入、小程序
