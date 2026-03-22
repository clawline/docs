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
