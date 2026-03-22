# Channel Plugin

OpenClaw 插件 —— 让 Agent 通过 Relay 收发消息。

## 它做什么

- 以 `connectionMode: "relay"` 主动连接 Relay Gateway
- 将 Relay 消息帧转换为 OpenClaw 内部事件
- 流式输出转发（text.delta）
- 文件/媒体消息处理
- 支持多节点同时连接同一个 Relay

## 快速链接

- [安装配置](./setup) — 安装、配置、启动
- [接入指南](./integration) — 第三方接入协议
