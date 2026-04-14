# Clawline 产品问题分析报告

> 生成日期: 2026-04-14  
> 分析范围: 安全、性能、用户体验、架构

---

## 一、严重等级说明

| 等级 | 含义 |
|------|------|
| **致命 (Critical)** | 可被利用的安全漏洞，需立即修复 |
| **高 (High)** | 重大安全风险或架构问题，需短期修复 |
| **中 (Medium)** | 有潜在风险或体验问题，需计划修复 |
| **低 (Low)** | 改进建议，可在后续迭代中处理 |

---

## 二、安全问题

### 致命 (Critical)

#### C-1. `.env` 文件包含生产级密钥
**位置**: `gateway/.env`  
**描述**: 包含 Supabase service_role_key (JWT, 到期 2026)、Azure OpenAI API key、admin token 等明文密钥。service_role_key 可绕过所有 RLS 策略获得数据库完全访问权限。  
**修复**: 立即轮换所有密钥。使用密钥管理器 (Vault/Doppler/云 KMS)。检查 git 历史确认未曾提交。

#### C-2. Supabase service_role_key 用于所有数据库操作
**位置**: `gateway/server.js` (多处)  
**描述**: 所有 Supabase API 调用使用 service_role_key，绕过行级安全策略。任何端点的 bug 都可能读写任意表。  
**修复**: 用户级读端点 (`/api/messages/sync`) 改用 anon key + RLS 策略。

#### C-3. CORS 默认允许所有来源
**位置**: `gateway/server.js:97-101`  
**描述**: 未配置白名单时 `isOriginAllowed()` 返回 true，允许任意跨域请求。
```javascript
if (!allowed) return true; // no allowlist = allow all
```
**修复**: 默认拒绝跨域请求，必须显式配置白名单。

---

### 高 (High)

#### H-1. IP 可通过 X-Forwarded-For 伪造
**位置**: `gateway/server.js:1334`  
**描述**: 无条件信任 `X-Forwarded-For` 请求头，攻击者可伪造 IP 绕过限流 (100 req/min) 和连接数限制 (50/IP)。  
**修复**: 仅在反向代理后信任此头部。增加可信代理配置。

#### H-2. Admin Token 可通过 URL 查询参数传递
**位置**: `gateway/server.js:571, 731`  
**描述**: `?adminToken=...` 会被记录在访问日志、浏览器历史、Referer 头和代理日志中，造成凭据泄露。  
**修复**: 仅通过 HTTP 请求头接受 admin token。

#### H-3. 消息同步端点无频道级授权
**位置**: `gateway/server.js:1552-1602`  
**描述**: `/api/messages/sync` 仅验证 token 有效性，不验证 token 是否属于目标频道。频道 A 的用户可通过修改 `channelId` 参数读取频道 B 的所有消息。  
**修复**: 认证后验证 token 所属频道与请求频道匹配。

#### H-4. 网关代码为 2,131 行单文件
**位置**: `gateway/server.js`  
**描述**: 全部功能 (HTTP 路由、WebSocket、认证、媒体、LLM 代理、持久化、限流) 在一个文件中，无测试。  
**影响**: 可维护性差、难以审计、无法独立测试各模块。  
**修复**: 拆分为 `routes/`、`middleware/`、`services/`、`ws/` 模块。

#### H-5. 全部子项目零测试覆盖
**描述**: 
- **Gateway**: 无测试文件、无测试框架
- **SDK**: 无测试
- **Channel**: 1 个手动测试脚本
- **Client Web**: 2 个 E2E 冒烟测试，其中引用了不存在的 IndexedDB 存储
- **Client WeChat**: 无测试  
**修复**: 优先为 Gateway 认证、限流、消息路由增加单元测试。修复过期的 E2E 测试。

---

### 中 (Medium)

#### M-1. 限流器内存泄漏
**位置**: `gateway/server.js:118-184`  
**描述**: `httpRateLimits` Map 和 `connectionsPerIp` Map 持续增长。`connectionsPerIp` 在 socket 异常断开时条目不会被清理。  
**修复**: 增加定期清理。使用 LRU 缓存设置上限。

#### M-2. 媒体文件无认证下载
**位置**: `gateway/server.js:2038-2063`  
**描述**: `GET /api/media/:filename` 对所有人开放，仅靠 UUID 文件名保护。URL 泄露即可访问文件。  
**修复**: 增加认证或使用签名 URL + 过期机制。

#### M-3. API 响应返回原始 secret
**位置**: `gateway/server.js:860`  
**描述**: `serializeChannel()` 返回完整的 `secret` 字段。虽然 `/api/state` 需要管理员权限，但 API 响应不应包含原始密钥。  
**修复**: 仅返回已脱敏的 `secretMasked`。

#### M-4. Web 端 Token 存储在 localStorage
**位置**: `client-web/src/services/connectionStore.ts`  
**描述**: 认证 token 存储在 localStorage，可被同源的 XSS 攻击或第三方脚本访问。  
**修复**: 配合 DOMPurify 加强 XSS 防护；考虑 httpOnly cookie。

#### M-5. Browser Agent 无认证本地连接
**位置**: `browser-agent/sidepanel.js:9`  
**描述**: 连接 `http://127.0.0.1:4819` 无认证，任何本地进程可交互。  
**修复**: 增加共享密钥认证。

#### M-6. Web 端与 SDK 重复实现 WebSocket 逻辑
**位置**: `client-web/src/services/clawChannel.ts` vs `sdk/src/client.ts`  
**描述**: Web 端有独立的 `ChannelManager` 类，与 SDK 的 `ClawlineClient` 功能重复。Bug 修复和协议变更需在两处同步。  
**修复**: 迁移 Web 端使用 `@clawlines/sdk`。

#### M-7. Logto 配置硬编码
**位置**: `client-web/src/main.tsx:36-39`  
**描述**: Logto endpoint 和 appId 硬编码在源码中。  
**修复**: 改为环境变量。

---

### 低 (Low)

#### L-1. WebSocket 消息载荷 10MB 无额外校验
**位置**: `gateway/server.js:187-188`  
**描述**: maxPayload 设为 10MB，30 条/分钟 = 可推送 300MB/分钟数据。  

#### L-2. 使用 global 存储 API 回调
**位置**: `gateway/server.js:1715`  
**描述**: `/api/chat` 端点将回调函数存储在 `global._apiCallbacks`，可能导致命名冲突。

#### L-3. Chrome 扩展请求 `<all_urls>` 权限
**位置**: `browser-agent/manifest.json:38`  
**描述**: 内容脚本在所有页面运行，包括银行、邮箱等敏感页面。

#### L-4. E2E 测试引用不存在的 IndexedDB
**位置**: `client-web/tests/e2e/clawline.spec.ts:165-199`  
**描述**: 测试检查 `clawline-messages` 和 `clawline-outbox` IndexedDB，但实际代码使用 Supabase + sessionStorage。

#### L-5. Web 端缺少无障碍属性
**位置**: `client-web/src/components/chat/MessageItem.tsx`  
**描述**: 交互元素缺少 `aria-label`，消息列表缺少 `role="log"` 和 `aria-live`。

#### L-6. Service Worker 仅预缓存 2 个 URL
**位置**: `client-web/public/sw.js:4-7`  
**描述**: 只预缓存 `/` 和 `/index.html`，首次离线访问会白屏。

#### L-7. AI 设置更新无输入验证
**位置**: `gateway/server.js:1437-1449`  
**描述**: `PUT /api/ai-settings` 直接存储请求体，无字段类型/长度验证。

---

## 三、性能问题

### P-1. Gateway 单进程单线程
**描述**: 整个 Gateway 运行在单个 Node.js 进程中，无集群模式。高并发时成为瓶颈。  
**修复**: 使用 `cluster` 模块或 PM2 cluster mode。

### P-2. 消息持久化阻塞主循环
**描述**: 虽然持久化是异步的，但 Supabase HTTP 请求在高负载时可能积压，影响事件循环。  
**修复**: 使用消息队列 (如 BullMQ) 解耦写入。

### P-3. Web 端无虚拟滚动
**描述**: ChatRoom 直接渲染所有消息 DOM 节点，大量消息时影响性能。  
**修复**: 引入虚拟滚动 (如 react-window)。

### P-4. 小程序 setData 大量消息
**描述**: Chat Room 可能一次 setData 整个消息数组 (最多 300 条)，微信渲染层可能卡顿。  
**修复**: 使用增量 setData，只更新变化的消息。

### P-5. Markdown 渲染未 memo 化
**位置**: `client-web/src/components/chat/MarkdownRenderer.tsx`  
**描述**: 每次渲染重新解析 Markdown，重复的长内容消息造成不必要的计算。  
**修复**: 使用 `useMemo` 缓存解析结果。

---

## 四、用户体验问题

### UX-1. 错误提示不统一
**描述**: 部分使用 toast、部分使用 banner、部分仅 console.log。缺乏统一的错误反馈机制。  
**修复**: 建立统一的通知系统，区分 error/warning/info/success。

### UX-2. 小程序无多语言支持
**描述**: 小程序界面全中文，Web 端混合中英文，缺乏 i18n 框架。  
**修复**: 引入 i18n 方案 (Web: react-i18next, 小程序: 自定义)。

### UX-3. 配对流程缺乏引导
**描述**: 新用户需要知道 WebSocket URL 格式，缺少扫码后的教程或默认连接。  
**修复**: 提供默认演示服务器，添加引导步骤。

### UX-4. 消息加载无骨架屏
**描述**: 消息历史加载时显示空白或 spinner，缺少骨架屏过渡。  
**修复**: 添加消息气泡骨架屏。

### UX-5. Web 与小程序功能不对等
**描述**: Web 端有 Agent Inbox、分屏视图、配置导出等功能，小程序端没有。虽然不必完全对等，但应有功能差异说明。  
**修复**: 更新 PARITY_CHECKLIST.md，明确标注有意差异。

---

## 五、架构问题

### A-1. Web 端未使用 SDK
**描述**: `@clawlines/sdk` 提供了完整的 WebSocket 客户端，但 Web 端自行实现了一套 (clawChannel.ts)，造成代码重复和维护负担。  
**修复**: 迁移 Web 端使用 SDK，保留 Web 特定的 UI 逻辑层。

### A-2. docs 目录与子项目 docs 重复
**描述**: `docs/channel/` vs `channel/docs/`、`docs/gateway/` vs `gateway/docs/` 内容重复或不一致。  
**修复**: 确定单一信息源，用符号链接或构建脚本同步。

### A-3. Channel 高级功能缺少实际调用
**描述**: Channel 导出了大量高级功能 (群组、搜索、转发、文件传输等)，但在 monitor.ts 中部分事件处理可能未完全接线。  
**修复**: 审计每个导出功能的实际使用情况，清理死代码。

### A-4. 无统一的消息 ID 生成策略
**描述**: SDK 用 `prefix-timestamp-random`，Web 端用 `msg-timestamp-random`，小程序用 `wx-timestamp-random`。虽然格式兼容，但缺乏统一规范。  
**修复**: 在 SDK 或 Channel 层统一 ID 生成规范。

---

## 六、优先修复建议

### 立即行动 (本周)
1. **轮换所有暴露的密钥** (C-1)
2. **修复 CORS 默认策略** (C-3)
3. **修复消息同步频道授权** (H-3)
4. **移除 admin token 查询参数** (H-2)

### 短期计划 (2 周内)
5. **限制 Supabase service_role_key 使用范围** (C-2)
6. **修复 X-Forwarded-For 信任** (H-1)
7. **增加 Gateway 核心逻辑单元测试** (H-5)
8. **拆分 server.js 为模块** (H-4)

### 中期计划 (1 个月内)
9. **迁移 Web 端使用 SDK** (M-6)
10. **增加媒体下载认证** (M-2)
11. **修复限流器内存泄漏** (M-1)
12. **Web 端虚拟滚动** (P-3)
13. **统一文档结构，消除重复** (A-2)

### 长期改进
14. Gateway 集群化 (P-1)
15. 完整 i18n (UX-2)
16. 无障碍改进 (L-5)
17. Service Worker 预缓存策略 (L-6)

---

## 七、问题统计

| 类别 | 致命 | 高 | 中 | 低 | 合计 |
|------|------|-----|-----|-----|------|
| 安全 | 3 | 5 | 5 | 3 | 16 |
| 性能 | 0 | 0 | 5 | 0 | 5 |
| 用户体验 | 0 | 0 | 5 | 0 | 5 |
| 架构 | 0 | 0 | 4 | 0 | 4 |
| **合计** | **3** | **5** | **19** | **3** | **30** |
