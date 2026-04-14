# Relay Gateway

WebSocket 中转网关 -- Clawline 的核心枢纽。

## 它做什么

- 管理客户端（用户浏览器）和后端（OpenClaw 节点）的 WebSocket 连接
- Channel 配置管理（用户、Token、Secret）
- JSON 消息帧双向转发
- 文件上传中转
- 消息持久化（Supabase）
- AI 辅助端点（建议、语音优化、同步聊天）
- Admin API + Admin UI

## 快速链接

- [部署指南](./deploy) -- 从开发到生产
- [API 参考](./api) -- REST API + WebSocket 协议
- [管理后台](./admin-ui) -- Admin UI 功能与操作
- [数据库](./database) -- Supabase 表结构、持久化流程与 schema 说明

## 认证体系

| 层级 | 方式 | 用途 |
|------|------|------|
| 管理员 | `X-Relay-Admin-Token` 请求头 | 所有管理 API |
| Logto JWT | `Authorization: Bearer <JWT>` | 替代管理员 Token |
| 频道用户 | `?token=<token>` 查询参数 | 客户端 WebSocket、消息同步 |

## 安全机制

- HTTP 限流：每 IP 100 请求/分钟
- WebSocket 限流：每连接 30 消息/分钟
- 连接数限制：每 IP 最多 50 个 WebSocket 连接
- 时序安全比较：所有 Token 比较使用 `timingSafeEqual`
- CSP 安全头 + HSTS

## 相关文档

- [产品功能全景](/PRODUCT_OVERVIEW) -- 网关在整体架构中的位置
- [问题分析报告](/ISSUE_ANALYSIS) -- 已知安全与架构问题
