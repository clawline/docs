# 什么是 Clawline

## 问题

你在用 [OpenClaw](https://github.com/openclaw/openclaw) 构建 AI Agent。Agent 运行得很好，但用户怎么用它？

**现有方案的困境：**

| 方案 | 问题 |
|------|------|
| 依赖 Telegram / Discord | 用户必须安装特定 App；国内访问不友好；UI 不可控；数据在别人手里 |
| 依赖微信公众号 | 审核周期长；接口限制多；被封号直接断联 |
| 自己从零搭建 | WebSocket 连接管理、鉴权、消息路由、文件上传、断线重连、流式渲染……工程量巨大 |
| 暴露 Webhook 端口 | Agent 需要公网 IP，内网部署直接不可用 |

核心矛盾：**Agent 很强大，但用户触达很困难。**

## 方案

Clawline 是 OpenClaw 的 **Web 接入方案**，由三个独立组件组成：

### 🌐 Relay Gateway

**WebSocket 中转网关。** 它是 Agent 和用户之间的桥梁。

- 管理所有 WebSocket 连接（客户端 + Agent 后端）
- Token 鉴权，用户管理
- JSON 消息帧转发
- 文件上传中转（10MB 限制，7 天 TTL）
- 可部署在任意有公网 IP 的机器上

### 📡 Channel Plugin

**OpenClaw 插件。** 安装到 OpenClaw 节点后，Agent 就能通过 Relay 收发消息。

- `connectionMode: "relay"` —— Agent **主动连出**到 Relay，无需开端口
- 消息格式转换（Relay 帧 ↔ OpenClaw 事件）
- 流式输出转发
- 文件/媒体消息处理
- 支持多节点同时连接同一个 Relay

### 💬 Client Web

**开箱即用的聊天前端。** React + Vite 构建，PWA 支持。

- 连接 Relay Gateway 的 WebSocket 端点
- 流式消息渲染
- 文件发送和接收
- 聊天历史 + 断线续传
- 移动端自适应
- 可定制主题和 UI

## 数据流

```
用户浏览器                  公网服务器                内网 Agent
┌──────────┐    wss://    ┌──────────────┐   wss://  ┌──────────────┐
│Client Web │ ──────────→ │Relay Gateway │ ←──────── │Channel Plugin│
│(React PWA)│ ←────────── │ (中转+鉴权)  │ ────────→ │ (OpenClaw)   │
└──────────┘              └──────────────┘           └──────────────┘
                               │
                          文件上传/下载
                          用户 Token 管理
                          连接状态监控
```

**关键设计：** Channel Plugin 主动连接 Relay（箭头方向是 `←`），而不是 Relay 回调 Agent。这意味着 Agent 可以在任何网络环境运行——内网、VPN、防火墙后面——只要能访问 Relay 的地址。

## 下一步

- [架构概览](./architecture) — 深入了解三端协作机制
- [快速开始](./quickstart) — 5 分钟跑起来
