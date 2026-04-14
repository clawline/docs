# 文档导航

本页汇总 Clawline 全部文档入口。

## 入门指南

- [什么是 Clawline](/guide/what-is) — 产品简介与核心概念
- [架构概览](/guide/architecture) — 系统组件关系与数据流
- [快速开始](/guide/quickstart) — 从零开始运行第一次对话
- [Browser Agent](/guide/browser-agent) — Chrome 扩展测试工具

## 客户端 SDK

`@clawlines/sdk` — 纯 TypeScript WebSocket 客户端库，浏览器与 Node.js 双平台支持。

- [概述](/sdk/) — 功能介绍与安装
- [快速开始](/sdk/quickstart) — 基础用法与代码示例
- [API 参考](/sdk/api) — 完整方法、事件与类型定义

## 中继网关

云端 WebSocket 中继服务，连接客户端与 OpenClaw 节点，提供认证、持久化和管理功能。

- [概述](/gateway/) — 网关功能与快速链接
- [API 参考](/gateway/api) — REST API + WebSocket 协议
- [部署指南](/gateway/deploy) — 本地开发到生产部署
- [管理后台](/gateway/admin-ui) — Admin UI 功能说明
- [数据库](/gateway/database) — Supabase 表结构与持久化

## 频道插件

OpenClaw 插件 (`@restry/clawline`)，处理消息路由、Agent 管理和高级通信功能。

- [概述](/channel/) — 插件功能与连接模式
- [安装配置](/channel/setup) — 安装与配置指南
- [接入指南](/channel/INTEGRATION_GUIDE) — 第三方接入协议
- [配置示例](/channel/CONFIG_EXAMPLES_ZH) — 常见场景配置
- [高级功能](/channel/advanced-features) — 群组、搜索、转发、状态追踪等
- [事件参考](/channel/events-reference) — 全部 38 种 WebSocket 事件
- [主动 DM](/channel/PROACTIVE_DM) — 主动推送消息
- [ACP 线程](/channel/acp-threads) — Agent 子会话支持

## Web 客户端

基于 React 19 的 Progressive Web App，提供完整聊天界面。

- [概述](/client-web/) — 功能概览与技术栈
- [功能说明](/client-web/features) — 详细功能文档
- [部署指南](/client-web/deploy) — 开发与生产部署
- [定制指南](/client-web/customize) — 主题、PWA、嵌入

## 微信小程序

微信原生小程序客户端，提供与 Web 端对等的聊天体验。

- [概述](/client-wechat/) — 功能介绍与开发指南

---

## 项目报告

以下文档由源码分析生成，覆盖产品全貌和改进方向：

- [产品功能全景](/PRODUCT_OVERVIEW) — 全部组件的功能清单与架构图
- [功能差异分析](/FEATURE_GAP_ANALYSIS) — 源码实现 vs 文档覆盖情况
- [问题分析报告](/ISSUE_ANALYSIS) — 安全、性能、体验和架构问题
