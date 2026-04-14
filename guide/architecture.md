# 架构概览

## 整体架构

Clawline 采用 **Relay 中转架构**，三个组件各司其职：

```
┌─────────────────────────────────────────────────────┐
│                    公网 (Relay)                       │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │            Relay Gateway                      │   │
│  │                                               │   │
│  │  /client  ← 客户端 WebSocket 连接             │   │
│  │  /backend ← Agent 后端 WebSocket 连接         │   │
│  │                                               │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐      │   │
│  │  │Channel A│  │Channel B│  │Channel C│      │   │
│  │  │(鉴权配置)│  │(鉴权配置)│  │(鉴权配置)│      │   │
│  │  └─────────┘  └─────────┘  └─────────┘      │   │
│  └──────────────────────────────────────────────┘   │
│          ↑                           ↑               │
│          │ wss://                     │ wss://        │
│          │                           │               │
│  ┌───────┴───────┐          ┌───────┴──────────┐   │
│  │  Client Web   │          │  OpenClaw Node   │   │
│  │  (用户浏览器)  │          │  + Channel Plugin│   │
│  │               │          │  (可在内网)       │   │
│  └───────────────┘          └──────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## 系统架构全景

以下展示 Clawline 所有组件及其通信协议：

```
                         ┌─────────────────────────────────────────────────────────────────┐
                         │                      Relay Gateway (公网)                        │
                         │                                                                  │
                         │   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
                         │   │  Channel A   │    │  Channel B   │    │  Channel C   │      │
                         │   │  (鉴权/路由)  │    │  (鉴权/路由)  │    │  (鉴权/路由)  │      │
                         │   └──────────────┘    └──────────────┘    └──────────────┘      │
                         │          │                    │                   │               │
                         │     /client (WSS)        /backend (WSS)    REST API (HTTPS)     │
                         └─────┬──────┬──────┬──────────┬──────────────┬────────────────────┘
                               │      │      │          │              │
          WSS ─────────────────┤      │      │          │              │
          (token auth)         │      │      │          │              │
                               │      │      │          │              │
┌──────────────────┐           │      │      │          │              │
│  Client Web      │───────────┘      │      │          │              │
│  (React PWA)     │                  │      │          │              │
│  浏览器 / 桌面    │                  │      │          │              │
└──────────────────┘                  │      │          │              │
                          WSS ────────┘      │          │              │
                          (token auth)       │          │              │
┌──────────────────┐                         │          │              │
│  Client WeChat   │─────────────────────────┘          │              │
│  (Mini Program)  │    WSS (token auth)                │              │
│  微信小程序       │                                    │              │
└──────────────────┘                                    │              │
                                                        │              │
┌──────────────────┐                                    │              │
│  Browser Agent   │   HTTP (127.0.0.1:4821)            │              │
│  (Chrome Ext.)   │──── local automation ──────────────│              │
└──────────────────┘                                    │              │
                                                        │              │
┌──────────────────┐       WSS (secret auth)            │              │
│  Custom Client   │─── via @clawlines/sdk ─────────────│              │
│  (Node / Deno)   │                                    │              │
└──────────────────┘                                    │              │
                                                        │              │
                                              WSS ──────┘              │
                                              (secret auth)            │
                                                                       │
                         ┌─────────────────────────────┐               │
                         │  Channel Plugin (OpenClaw)   │               │
                         │  + OpenClaw Agent            │               │
                         │  (可运行在内网)               │               │
                         └──────────────┬──────────────┘               │
                                        │                              │
                                   内部调用                             │
                                        │                              │
                         ┌──────────────▼──────────────┐               │
                         │  OpenClaw Runtime            │               │
                         │  (LLM / Tools / RAG)         │               │
                         └─────────────────────────────┘               │
                                                                       │
                         ┌─────────────────────────────┐               │
                         │  Supabase                    │◄──────────────┘
                         │  ┌─────────┐  ┌───────────┐ │   PostgREST
                         │  │PostgreSQL│  │  Storage  │ │   (HTTPS)
                         │  │(消息持久化)│  │ (媒体文件) │ │
                         │  └─────────┘  └───────────┘ │
                         └─────────────────────────────┘
```

## 连接方向

这是 Clawline 和传统 Webhook 方案的**根本区别**：

| | 传统 Webhook | Clawline Relay |
|---|---|---|
| 连接发起方 | 平台 → Agent（回调） | Agent → Relay（主动连出） |
| Agent 网络要求 | 必须有公网 IP | 只需能访问 Relay 地址 |
| 防火墙 | 必须开入站端口 | 仅出站连接 |
| 内网部署 | 需要 ngrok 等穿透 | 原生支持 |

## 消息流转

### 用户发送消息

```
Client Web → Relay (/client) → 路由到对应 Channel → Relay (/backend) → Channel Plugin → OpenClaw Agent
```

1. Client Web 通过 WebSocket 发送 `message.receive` 事件
2. Relay 根据 `channelId` 找到对应后端连接
3. Channel Plugin 接收消息，转换为 OpenClaw 内部格式
4. Agent 处理消息

### Agent 回复

```
OpenClaw Agent → Channel Plugin → Relay (/backend) → 路由到用户连接 → Relay (/client) → Client Web
```

1. Agent 生成回复（支持流式）
2. Channel Plugin 发送 `text.delta`（流式）或 `message.send`（完整）
3. Relay 根据 `connectionId` 路由到对应客户端
4. Client Web 实时渲染

### 完整消息生命周期

下图展示一条消息从用户输入到屏幕渲染的完整路径，包含所有中间事件：

```
 用户键入消息
      │
      ▼
 ┌────────────────────┐
 │  SDK / clawChannel  │  构造 message.receive 事件
 │  (客户端)           │  生成 messageId, senderId
 └─────────┬──────────┘
           │ WSS  ───  发送 JSON frame
           ▼
 ┌────────────────────┐
 │  Gateway /client    │  验证 token, 检查限流 (30 msg/min)
 │  (Relay)           │  持久化消息到 Supabase
 └─────────┬──────────┘
           │ 内部路由  ───  根据 channelId 查找后端连接
           │ 触发 relay.client.event
           ▼
 ┌────────────────────┐
 │  Gateway /backend   │  转发给匹配的 Channel Plugin
 │  (Relay)           │
 └─────────┬──────────┘
           │ WSS  ───  relay.client.event frame
           ▼
 ┌────────────────────┐
 │  Channel Plugin     │  解析消息, 转换为 OpenClaw 内部格式
 │  (OpenClaw)        │  调用 Agent 处理
 └─────────┬──────────┘
           │ 内部调用
           ▼
 ┌────────────────────┐
 │  OpenClaw Agent     │  LLM 推理, 工具调用, RAG 检索
 │  (LLM Runtime)     │  生成流式回复
 └─────────┬──────────┘
           │ streaming tokens
           ▼
 ┌────────────────────┐
 │  Channel Plugin     │  将 token 流包装为 text.delta 事件
 │  (OpenClaw)        │  最终发送 message.send 完成事件
 └─────────┬──────────┘
           │ WSS  ───  text.delta / message.send frames
           ▼
 ┌────────────────────┐
 │  Gateway /backend   │  接收后端消息
 │  (Relay)           │  持久化回复到 Supabase
 └─────────┬──────────┘
           │ 内部路由  ───  根据 connectionId 路由到客户端
           ▼
 ┌────────────────────┐
 │  Gateway /client    │  转发给对应的客户端 WebSocket
 │  (Relay)           │
 └─────────┬──────────┘
           │ WSS  ───  text.delta / message.send frames
           ▼
 ┌────────────────────┐
 │  SDK / clawChannel  │  逐 token 渲染 (text.delta)
 │  (客户端)           │  message.send 时标记完成
 └────────────────────┘
           │
           ▼
      用户看到回复
```

**关键事件类型**：

| 事件 | 方向 | 说明 |
|------|------|------|
| `message.receive` | Client -> Gateway | 用户发送的消息 |
| `relay.client.event` | Gateway -> Backend | Gateway 转发给后端的客户端事件 |
| `text.delta` | Backend -> Client | 流式回复的增量文本 |
| `message.send` | Backend -> Client | 完整回复 / 流式结束信号 |
| `ping` / `pong` | Client <-> Gateway | 心跳保活 |

### 文件上传

```
Client Web → Relay /api/media/upload → 返回 URL → 在消息中引用 URL
```

- 小文件（<100KB）：Base64 内嵌在消息中
- 大文件（≥100KB）：先上传到 Relay，消息中携带 URL
- 鉴权：Channel User Token 或 JWT

## 多节点

一个 Relay 可以管理多个 Channel（Agent 节点）：

- 每个 Channel 有独立的 ID、Secret、用户列表
- 多个 Agent 节点可以同时连接
- 客户端通过 `channelId` 参数选择连接哪个 Agent

适用场景：一个 Relay 对接多个业务场景的 Agent。

### 部署拓扑

#### 单节点本地开发

所有组件运行在同一台机器上，使用 `ws://` 明文连接：

```
┌─────────────────────────────────────────────────────────────┐
│                     localhost                                │
│                                                              │
│  ┌──────────────┐   ws://localhost:19080/client              │
│  │  Client Web  │◄──────────────────────────────┐            │
│  │  (dev server)│                               │            │
│  │  :5173       │                               │            │
│  └──────────────┘                               │            │
│                                          ┌──────┴─────────┐ │
│                                          │  Gateway       │ │
│  ┌──────────────┐                        │  (Relay)       │ │
│  │  OpenClaw    │  ws://localhost:19080   │  :19080        │ │
│  │  + Channel   │◄──────/backend─────────│                │ │
│  │  Plugin      │                        │  Supabase 连接: │ │
│  │  :4819       │                        │  HTTPS →云端   │ │
│  └──────────────┘                        └────────────────┘ │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

启动命令：
```bash
# Terminal 1: Gateway
cd gateway && node server.js

# Terminal 2: OpenClaw + Channel Plugin
cd openclaw && npm start

# Terminal 3: Client Web
cd client-web && npm run dev
```

#### 生产环境多节点部署

Gateway 部署在公网，Agent 节点可以在内网：

```
                    ┌─────── 互联网 ────────┐
                    │                        │
┌───────────┐      │   ┌────────────────┐   │      ┌────────────────────┐
│  用户 A   │─WSS──┼──▶│                │   │      │  内网 Node 1       │
│  (浏览器)  │      │   │  反向代理       │   │      │                    │
└───────────┘      │   │  Caddy/Nginx   │   │      │  ┌──────────────┐  │
                    │   │  :443 (HTTPS)  │   │      │  │  OpenClaw    │  │
┌───────────┐      │   │       │        │   │      │  │  Agent A     │  │
│  用户 B   │─WSS──┼──▶│       │        │   │ WSS  │  │  + Channel   │  │
│  (小程序)  │      │   │       ▼        │   │◄─────│  │  Plugin      │──┤
└───────────┘      │   │  ┌──────────┐  │   │      │  └──────────────┘  │
                    │   │  │ Gateway  │  │   │      └────────────────────┘
┌───────────┐      │   │  │ (Relay)  │  │   │
│  用户 C   │─WSS──┼──▶│  │ :19080   │  │   │      ┌────────────────────┐
│  (SDK)    │      │   │  │          │  │   │      │  内网 Node 2       │
└───────────┘      │   │  │    │     │  │   │      │                    │
                    │   │  └────┼─────┘  │   │      │  ┌──────────────┐  │
                    │   │       │        │   │ WSS  │  │  OpenClaw    │  │
                    │   └───────┼────────┘   │◄─────│  │  Agent B     │  │
                    │           │            │      │  │  + Channel   │  │
                    │      PostgREST (HTTPS) │      │  │  Plugin      │──┤
                    │           │            │      │  └──────────────┘  │
                    │    ┌──────▼──────┐     │      └────────────────────┘
                    │    │  Supabase   │     │
                    │    │  (Cloud)    │     │
                    │    └─────────────┘     │
                    └────────────────────────┘
```

**要点**：
- 反向代理 (Caddy/Nginx) 负责 TLS 终止，将 `wss://` 转为内部 `ws://`
- Agent 节点主动连出到 Gateway，无需公网 IP 或开放入站端口
- 多个 Agent 节点可同时连接同一 Gateway，每个绑定不同 Channel
- Supabase 通过 HTTPS PostgREST API 访问，Gateway 使用 `service_role_key` 鉴权

## 鉴权体系

```
Client Web → token=xxx → Relay 校验 → 通过后建立连接 → Plugin 信任 Relay 下发的身份
```

- Relay 管理 Channel 用户列表（token + senderId）
- 也支持 Logto JWT 认证
- Channel Plugin 信任 Relay 的鉴权结果，不再二次校验
- Admin API 使用独立的 API Key 或 Logto JWT

## 下一步

- [快速开始](./quickstart) — 动手跑起来
