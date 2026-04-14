# Client Web

开箱即用的聊天前端 -- React 19 + Vite 6 构建，PWA 支持。

## 它做什么

- 连接 Relay Gateway 的 WebSocket 端点
- 流式消息渲染（text.delta、thinking 阶段分离）
- 文件发送和接收
- 聊天历史 + 跨设备消息同步
- 移动端自适应（含超宽屏分屏视图）
- 可定制主题和 UI
- Agent Inbox 统一通知中心
- 全局消息搜索
- 24+ 斜杠命令
- Logto OAuth 登录（可选）

## 技术栈

React 19 + TypeScript 5.8 + Vite 6 + Tailwind CSS v4 + React Router v7

## 快速链接

- [功能说明](./features) -- 消息类型、流式输出、历史同步、PWA 等
- [部署指南](./deploy) -- 开发环境和生产部署
- [定制指南](./customize) -- 主题、嵌入、品牌、连接配置

## 核心页面

| 页面 | 功能 |
|------|------|
| Onboarding | 首次使用引导、Logto OAuth 登录 |
| ChatList | Agent 列表、收藏排序、消息预览 |
| ChatRoom | 主聊天界面、斜杠命令、流式渲染 |
| Dashboard | 服务器状态监控、内存指标 |
| AgentInbox | 统一通知中心、未读计数 |
| Search | 全局消息搜索、多条件过滤 |
| Profile | 用户信息、服务器管理 |
| Preferences | 高级设置、配置导出/导入 |
| Pairing | 添加服务器、QR 扫描 |

## 关键特性

- **连接池**: 最多 6 个并发 WebSocket 连接
- **离线队列**: 最多 200 条待发消息
- **PWA**: Service Worker 缓存、离线访问、安装引导
- **深色模式**: 自动/手动切换
- **响应式**: 移动端 / 桌面端 / 超宽屏分屏

## 相关文档

- [产品功能全景](/PRODUCT_OVERVIEW) -- Web 端在整体架构中的位置
- [功能差异分析](/FEATURE_GAP_ANALYSIS) -- Web 端文档覆盖情况
