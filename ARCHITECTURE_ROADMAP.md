# Clawline 架构成熟度评估与改进路线图

> 评估日期: 2026-04-14
> 基于: 全项目源码审计 + ISSUE_ANALYSIS.md (30 项问题)

---

## 一、架构成熟度评分

| 领域 | 评分 | 依据 |
|------|------|------|
| 代码模块化 | 3/10 | Gateway 是 2131 行单文件 (`server.js`)，HTTP 路由、WebSocket、认证、媒体、LLM 代理、限流全部耦合。Channel 层模块化良好 (36 个 `.ts` 文件，职责清晰)。 |
| API 设计一致性 | 5/10 | REST 端点命名规范 (`/api/messages/sync`, `/api/media/:filename`)，但认证层级混乱 --- JWT 验证、adminToken 请求头、adminToken 查询参数、无认证四种方式混用，且缺少 API 版本化。 |
| 错误处理模式 | 4/10 | 有重试机制和死信队列设计，但 Web 端错误提示不统一 (toast / banner / console.log 混用)，空 catch 块散布于多个模块。 |
| 安全架构 | 3/10 | 存在 3 个致命漏洞: CORS 默认全开 (`isOriginAllowed` 无白名单时返回 true)、`service_role_key` 用于所有数据库操作绕过 RLS、`/api/messages/sync` 无频道级授权允许跨频道读取。 |
| 测试基础设施 | 1/10 | 全项目零单元测试。Gateway 无测试框架。SDK 无测试。Web 端仅 2 个 E2E 测试且引用了不存在的 IndexedDB 存储名，实质失效。 |
| 部署就绪度 | 5/10 | 具备 Docker 容器化和 CI/CD 流水线，有健康检查端点。但单进程单线程无集群模式，无结构化日志，无监控告警体系。 |
| SDK 采用率 | 2/10 | `@clawlines/sdk` 提供了完整的 WebSocket 客户端 (`ClawlineClient`)，但 Web 端完全未使用，`clawChannel.ts` (1465 行) 独立重复实现了协议处理、重连、消息队列等逻辑。 |
| 文档完整度 | 7/10 | 经过本轮整理，覆盖率从约 50% 提升到 76%。产品概述、问题分析、功能差距分析均已到位，但部分子项目文档与根目录 `docs/` 存在重复。 |
| **综合** | **3.8/10** | **处于"原型可演示，不可上线"阶段** |

**评分标准**: 1-3 原型阶段 / 4-6 内测可用 / 7-8 生产就绪 / 9-10 工程卓越

---

## 二、生产上线最短路径 (10 项硬性门槛)

以下 10 项为最小可行安全/可靠性基线，不满足任何一项均不应对外开放服务。

### P0 安全封堵 (阻断攻击面)

| # | 措施 | 对应问题 | 具体动作 |
|---|------|----------|----------|
| 1 | CORS 默认策略改为拒绝 | C-3 | `isOriginAllowed()` 无白名单时返回 `false`，配置 `RELAY_CORS_ORIGINS` 环境变量 |
| 2 | `/api/messages/sync` 增加频道级授权 | H-3 | 认证后校验 token 所属 `channelId` 与请求参数匹配 |
| 3 | 移除 `?adminToken=` 查询参数支持 | H-2 | 仅接受 `Authorization` 请求头，避免凭据泄露到日志和 Referer |
| 4 | 轮换 `.env` 中所有密钥 | C-1 | 轮换 Supabase service_role_key、Azure OpenAI key、admin token，检查 git 历史 |

### P1 可靠性基线 (防止生产事故)

| # | 措施 | 对应问题 | 具体动作 |
|---|------|----------|----------|
| 5 | Gateway 核心路径增加 20+ 测试 | H-5 | 覆盖认证中间件、限流逻辑、消息路由、WebSocket 握手 |
| 6 | 限流器 Map 增加 TTL 清理 | M-1 | `httpRateLimits` 和 `connectionsPerIp` 增加定期清理，或替换为 LRU 缓存 |
| 7 | `X-Forwarded-For` 增加可信代理配置 | H-1 | 新增 `RELAY_TRUSTED_PROXIES` 环境变量，仅在反向代理部署时信任该头部 |

### P2 运维可观测 (出问题能发现)

| # | 措施 | 对应问题 | 具体动作 |
|---|------|----------|----------|
| 8 | 结构化日志替换 `console.log` | -- | 引入 pino/winston，统一日志格式 `{level, timestamp, requestId, message}` |
| 9 | `/healthz` 深度检查 | -- | 除进程存活外，检测 Supabase 连通性、WebSocket Server 状态、磁盘空间 |
| 10 | PM2/systemd 守护 + 优雅关闭 | P-1 | 捕获 SIGTERM，等待现有连接关闭，排空消息队列后退出 |

---

## 三、架构改进路线图

### P0: Gateway 拆分

**现状**: `server.js` 2131 行，包含 HTTP 路由、WebSocket 管理、认证、媒体处理、LLM 代理、配置持久化、限流等全部职责。

**目标结构**:

```
gateway/
  server.js                  # 入口: 创建 HTTP server，挂载路由，启动监听 (~80 行)
  middleware/
    cors.js                  # CORS 策略 (带白名单配置)
    auth.js                  # 认证中间件: JWT 验证 / admin token
    rate-limit.js            # 限流 (含 TTL 清理)
    trusted-proxy.js         # X-Forwarded-For 可信代理
  routes/
    channels.js              # /api/channels CRUD
    messages.js              # /api/messages/sync
    media.js                 # /api/media 上传/下载
    ai-settings.js           # /api/ai-settings
    health.js                # /healthz
    state.js                 # /api/state (管理端点)
  ws/
    handler.js               # WebSocket 连接管理、消息分发
    heartbeat.js             # 心跳检测
  services/
    supabase.js              # Supabase 客户端封装 (区分 anon/service_role)
    llm-proxy.js             # LLM API 代理
    media-store.js           # 媒体文件存储与清理
  lib/
    relay-config-store.js    # (已存在)
    relay-config.js          # (已存在)
    logger.js                # 结构化日志
```

**拆分原则**:
- 每个文件职责单一，不超过 300 行
- 中间件可独立测试
- 路由文件仅负责请求解析和响应格式化，业务逻辑下沉到 `services/`

### P1: Web 端迁移至 SDK

**现状**: `client-web/src/services/clawChannel.ts` (1465 行) 独立实现了 WebSocket 连接管理、协议编解码、消息队列、重连策略，与 `@clawlines/sdk` 的 `ClawlineClient` 功能高度重复。

**迁移策略**:

```
迁移前:
  clawChannel.ts (1465 行)
    ├── WebSocket 连接管理        ← 与 SDK 重复
    ├── 协议编解码               ← 与 SDK 重复
    ├── 消息队列/重试             ← 与 SDK 重复
    ├── 重连策略                 ← 与 SDK 重复
    └── UI 状态管理 / React 集成  ← Web 特有

迁移后:
  @clawlines/sdk (ClawlineClient)
    ├── WebSocket 连接管理
    ├── 协议编解码
    ├── 消息队列/重试
    └── 重连策略

  channelManager.ts (~300 行, 保留)
    ├── ClawlineClient 实例管理
    ├── React 状态适配 (hooks)
    └── UI 通知集成
```

**关键约束**:
- SDK 不应依赖任何浏览器 API，保持环境中立
- `ChannelManager` 作为 UI 适配层，桥接 SDK 事件到 React 状态
- 迁移期间保持双轨运行，通过 feature flag 切换

### P2: 测试金字塔搭建

**目标覆盖率**: 核心路径 80%+，整体 60%+

```
测试层级                    工具                      覆盖范围
──────────────────────────────────────────────────────────────
单元测试 (底层)             Vitest                    Gateway: 认证/限流/消息路由
                                                      SDK: 协议编解码/重连逻辑
                                                      Channel: 消息格式化/事件处理

集成测试 (中层)             Vitest + supertest        Gateway: HTTP 端点完整请求链
                                                      WebSocket: 握手/消息收发/断线

E2E 测试 (顶层)             Playwright                Web 端: 配对→发消息→收消息
                                                      修复现有 2 个失效测试

CI 门禁                     GitHub Actions            PR 合并前必须通过全部测试
                                                      覆盖率不低于阈值
```

**Gateway 优先测试清单**:

| 测试场景 | 类型 | 优先级 |
|----------|------|--------|
| JWT 验证 (有效/过期/伪造) | 单元 | P0 |
| admin token 认证 (请求头/拒绝查询参数) | 单元 | P0 |
| CORS 白名单匹配 | 单元 | P0 |
| 限流器计数与重置 | 单元 | P0 |
| `/api/messages/sync` 频道授权 | 集成 | P0 |
| WebSocket 握手与消息分发 | 集成 | P1 |
| 媒体上传大小限制 | 集成 | P1 |
| 配置持久化读写 | 单元 | P1 |
| 健康检查端点 | 集成 | P2 |
| LLM 代理转发 | 集成 | P2 |

### P3: 认证架构统一

**现状**: 四种认证方式散布在路由处理函数中，缺乏统一入口。

```javascript
// 当前: 每个路由自行处理认证 (散布在 server.js 各处)
if (url === '/api/messages/sync') {
  const token = headers['authorization']?.split(' ')[1];
  // ... 内联验证逻辑
}

// 目标: 中间件链
const router = createRouter();

router.use('/api/admin/*', authenticate('admin'));   // admin token
router.use('/api/messages/*', authenticate('jwt'));   // JWT 验证
router.use('/api/media/*', authenticate('channel'));  // 频道 token

// authenticate() 返回标准化的 req.auth 对象
// { type: 'admin' | 'jwt' | 'channel', userId?, channelId?, roles: [] }
```

**统一认证中间件接口**:

```typescript
interface AuthContext {
  type: 'admin' | 'jwt' | 'channel';
  userId?: string;
  channelId?: string;
  roles: string[];
}

function authenticate(strategy: AuthContext['type']): Middleware;
function requireRole(...roles: string[]): Middleware;
```

### P4: Channel 死代码清理

**现状**: Channel 层导出 36 个模块，包含群组管理、消息搜索、消息转发、文件传输等高级功能，但部分功能在上层 (`monitor.ts`, Web 端, 小程序) 中可能未接线。

**清理步骤**:

1. 审计每个导出的实际引用关系 (静态分析 + 运行时覆盖)
2. 标记无调用方的模块为 `@experimental`，添加 JSDoc 警告
3. 将实验性模块移至 `channel/src/experimental/` 子目录
4. 在 `channel/src/index.ts` 中分离稳定导出和实验性导出
5. CI 中增加 dead code 检测 (如 `ts-prune`)

---

## 四、里程碑计划

| 阶段 | 内容 | 关键交付物 | 预估工时 | 验收标准 |
|------|------|-----------|----------|----------|
| **M1: 安全封堵** | P0 四项安全修复 | CORS 白名单、频道授权、移除查询参数 token、密钥轮换 | 1 周 | 通过安全检查清单，无致命/高危漏洞 |
| **M2: 可测试** | Gateway 拆分 + 测试基础设施 | 模块化目录结构、20+ 单元测试、CI 门禁 | 2 周 | 核心认证/限流路径 80% 覆盖率 |
| **M3: SDK 统一** | Web 端迁移至 SDK | `clawChannel.ts` 替换为 SDK + 适配层 | 1 周 | Web 端功能回归测试全部通过 |
| **M4: 生产就绪** | 监控/日志/部署加固 | 结构化日志、深度健康检查、PM2 守护、优雅关闭 | 1 周 | 可承受 100 并发连接，无内存泄漏 |

**总计: 5 周** (假设 1 名全栈开发全职投入)

```
时间线:

Week 1       Week 2       Week 3       Week 4       Week 5
├── M1 ──────┤                                              安全封堵
             ├── M2 ──────────────────┤                     Gateway 拆分 + 测试
                                      ├── M3 ──────┤        SDK 统一
                                                   ├── M4 ──┤ 生产就绪
```

**风险提示**:
- M1 密钥轮换需要协调所有已部署的客户端更新配置
- M2 Gateway 拆分可能暴露隐式依赖，需要充分的集成测试覆盖
- M3 SDK 迁移期间需保持向后兼容，建议通过 feature flag 灰度切换

---

## 五、参考文档

| 文档 | 路径 | 说明 |
|------|------|------|
| 问题分析报告 | `docs/ISSUE_ANALYSIS.md` | 30 项问题的详细描述与修复建议 |
| 功能差距分析 | `docs/FEATURE_GAP_ANALYSIS.md` | Web 端与小程序功能对比 |
| 产品概述 | `docs/PRODUCT_OVERVIEW.md` | 产品定位与架构总览 |
| Gateway 文档 | `docs/gateway/` | Gateway 配置与 API 说明 |
| SDK 文档 | `docs/sdk/` | SDK 使用指南 |
| Channel 文档 | `docs/channel/` | Channel 层模块说明 |
