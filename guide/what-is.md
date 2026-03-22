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

Clawline 是 OpenClaw 的 **Web 接入方案**。核心只需要一个插件，按需叠加组件：

### 两种部署模式

#### 🚀 简单模式：直连

**只装一个插件，零额外服务。**

```
用户浏览器                    内网 Agent
┌──────────┐   ws://直连   ┌──────────────┐
│Client Web │ ───────────→ │Channel Plugin│
│           │ ←─────────── │ (OpenClaw)   │
└──────────┘               └──────────────┘
```

Channel Plugin 以 `connectionMode: "websocket"` 启动，直接在本地开 WebSocket 端口。**内网、局域网、本机开发——开箱即用。** 不需要任何额外服务。

适用：内网部署、个人使用、开发调试、局域网团队。

#### 🌐 Relay 模式：跨网络

**加一个 Relay Gateway，穿透任何网络。**

```
用户浏览器                  公网服务器                内网 Agent
┌──────────┐    wss://    ┌──────────────┐   wss://  ┌──────────────┐
│Client Web │ ──────────→ │Relay Gateway │ ←──────── │Channel Plugin│
│(React PWA)│ ←────────── │ (中转+鉴权)  │ ────────→ │ (OpenClaw)   │
└──────────┘              └──────────────┘           └──────────────┘
```

Channel Plugin 以 `connectionMode: "relay"` **主动连出**到 Relay——无需开端口、无需公网 IP。Relay 负责中转、鉴权、文件上传。

适用：公网暴露、多用户共享、多节点管理、企业部署。

### 三个组件

| 组件 | 说明 | 必须？ |
|------|------|--------|
| 📡 **Channel Plugin** | OpenClaw 插件，让 Agent 能通过 WebSocket 收发消息 | ✅ 核心 |
| 💬 **Client Web** | 开箱即用的聊天前端（React + Vite，PWA 支持） | 可选（你也可以自己写前端） |
| 🌐 **Relay Gateway** | WebSocket 中转网关 + 鉴权 + 文件上传 + 管理后台 | 可选（仅跨网络时需要） |

**关键设计：** Relay 模式下，Channel Plugin 主动连接 Relay（箭头方向是 `←`），而不是 Relay 回调 Agent。Agent 可以在任何网络环境运行——内网、VPN、防火墙后面——只要能访问 Relay 的地址。

## 下一步

- [架构概览](./architecture) — 深入了解三端协作机制
- [快速开始](./quickstart) — 5 分钟跑起来
