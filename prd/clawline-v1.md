# Clawline PRD v1

> 版本：v1.6 · 2026-04-19（reliability-v2 全量落地 — 12 项结构性删除 + 7 项 ADD-BACK 完成）
> 受众：产品/工程内部
> 状态：M1/M2 范围已锁，P0/P1 大部分收敛；reliability-v2 重构完成，剩 3 项长尾待决策

## 战略对齐分析（开篇必读）

把用户口述的战略锚点拆成三类对照现状：

### 现状支撑战略 ✅ 保留并强化

| 战略 | 现状证据 | 评价 |
|---|---|---|
| 通用接入层（不绑特定客户端） | Gateway WS `/client` + `/backend` 双向、Channel 插件 `direct/relay` 双模式 | 抽象正确，分层清晰 |
| 多 Agent 管理 | Channel `agent.list.get/agent.list/agent.select`；Web 侧栏渲染 9 connection × 几十 agent；agent 收藏、avatar、视图模式 | 功能完整 |
| 多 OpenClaw 多入口 | Web 支持多 connection、相互独立；Relay 支持多 backend channel | 架构已就绪 |
| 第三方 API 调用 Agent | `POST /api/chat`（含虚拟 client 连接池） | 接口存在但**有 P0 bug**（见下） |
| Web 外部端 | client-web 全量功能 PWA + Logto 登录 + streaming + 分屏 | 主线可用 |

### 现状跑偏，需要重构或砍 ⚠️🗑️

| 问题 | 证据 | 处置建议 |
|---|---|---|
| **Reactions 死代码** | `channel/src/generic/channel.ts:65` 声明 `reactions:false`；`reactions.ts` 166 行完整实现；Gateway 无 handler、无 `cl_reactions` 表、Web 无 UI | **砍掉** `reactions.ts`，移除 capability flag |
| **子区状态分裂** | Channel `threading.ts` 19-90 仅生成 threadId，不订阅事件；Gateway `server.js:460-620` 独占 Supabase `cl_threads`；ACP `ensureThreadKnown` 是占位符 | **重构**：明确 Gateway 为唯一 owner，Channel 退化为转发者，补 `thread.updated` 广播 |
| **`/api/chat` 消息丢回执** | `server.js:2960` 持久化 inbound 后注册回调等待 `message.send`；120s 硬超时；callback 单点故障；HTTP 断开则回复孤立 | **P0 修**：可配置超时 + 回复持久化 + reconnect 拉取（caller 离线后能补取） |
| **Logto `redirect_uri` 白名单缺 `127.0.0.1:4026`** | 今天测试实证：点 Get Started 报 `invalid_redirect_uri` | 配置项问题，列入文档 + 部署 checklist |
| **Webhook 模式** | `connectionMode=webhook` 配置存在，无主流程文档、无测试覆盖 | **砍**或冻结：本期不投入，文档明确 deprecated |
| **AI settings 字段散落** | Gateway `/api/ai-settings` 字段（suggestionModel/replyModel/voiceRefineModel + 各 prompt）远多于文档 | 整合到统一 schema，文档补全 |
| **Web 文案 "All data stays on device"** | 实际消息存 Supabase `cl_messages` | **改文案** —— 数据存储边界要诚实 |
| **`channel.ts` capabilities 与实现不一致** | 不只 reactions，`edit/polls` 等都有矛盾 | 一次性盘点，对齐 source of truth |

### 战略需要但当前缺失 ❌ 待建

| 战略需求 | 缺失项 | 影响 |
|---|---|---|
| 小程序端 / APP 端 | 无原生 SDK 抽象（`@clawlines/sdk` 仅 Web/Node 通用 TS）；微信小程序仓库存在但远未对齐 Web | 影响 M3 扩展入口里程碑 |
| API 网关给"Claude Code 这类程序"用 | `/api/chat` 是单 RPC 模式，没有 streaming 接口、没有长连接订阅 SDK、没有 token 自助签发 | 程序客户端目前体验差 |
| 多 Agent 协同（不止"多个 agent 列表"，而是协同工作流） | 自动分线（@mention/delegation/ACP）只是"创建线"，没有协同任务调度、子 Agent 结果聚合 | 关键差异化能力缺位 |
| 集成能力（与其他系统） | 无 webhook 出向（Agent 回复推送到外部系统）、无 OpenAPI/SDK 自动化、无 RBAC | 阻挡 toB 落地 |
| 稳定性指标 | 无 SLO、无 alert、`data/persist-failures.jsonl` 无运维路径 | 无法承诺企业级 |

---

## 1. Vision & Positioning

> **Clawline 是 OpenClaw 的通用接入层，让任意客户端（人 / 程序）都能接入并协同使用任意 Agent。**

- **目标用户**：正在做 AI 转型的公司——既需要给员工提供"多 Agent 工作台"，也需要让自家程序通过 API 调度 Agent。
- **核心场景**：
  1. 员工在 Web/小程序/APP 同时与多 Agent 多 OpenClaw 节点对话（多入口、多并发、协同）。
  2. 第三方系统（Claude Code、自家服务、CI 流水线、IM bot 等）通过 API 把 Agent 当能力调用，消息双向流通且都进入 Agent 会话上下文。
- **不是什么**：不是又一个 ChatGPT 套壳；不是 Agent 框架本身（OpenClaw 才是）；不是 IM。是**通道 + 协议**。

## 2. Personas

| Persona | 角色 | 痛点 | 关键诉求 |
|---|---|---|---|
| **Lin · AI 转型公司员工** | 用 Web/小程序日常使用多个 Agent | 切窗口累、Agent 之间无法协作、断网消息丢 | 单页面多 Agent、子区组织上下文、离线补传、PWA |
| **Wang · 第三方开发者** | 在自家服务里集成 Agent 能力 | 没 SDK、API 不稳、消息丢、无 streaming | 稳定 `/api/chat`、流式、长连接、Token 自助 |
| **Zhang · 企业管理员** | 给团队配置 channel/agent/权限 | 配置 UI 弱、无审计、无监控 | Admin UI、Audit、Quota、Health Dashboard |

## 3. Product Pillars

P1 阶段聚焦 6 大支柱：

1. **多 Agent 协同工作台**（Web 优先，子区是关键载体）
2. **Inbox 统一收件箱**（多 Agent 工作台的聚合 / 触发 / 工作流入口）
3. **统一接入协议**（Channel 插件 + Gateway，protocol 一致性）
4. **第三方 API 网关**（程序客户端首等公民）
5. **多入口扩展**（Web → 小程序 → APP，共用同一套 Gateway）
6. **企业可运营**（Admin、监控、审计、稳定性）

## 4. 功能规划（按支柱展开）

图例：✅ 已能用 / ⚠️ 有 bug / 🚧 半成品 / ❌ 未做 / 🗑️ 建议砍

### Pillar 1：多 Agent 协同工作台

| 功能 | 状态 | 说明 |
|---|---|---|
| 多 connection 多 Agent 列表/收藏/avatar | ✅ | client-web 完整 |
| 单 Agent 聊天（streaming/markdown/草稿/copy/forward/delete） | ✅ | core 路径稳定 |
| Slash 命令面板（20+） | ✅ | UI OK，命令本身依赖 OpenClaw |
| 分屏 ≤5 pane | ✅ | ≥1440px 触发 |
| 子区 / Thread | 🚧 | **Gateway 独占持久化但 Channel 不感知；ACP 接入是 stub；Web UI 已建好但缺 `thread.updated` 广播——是这期 P0 修复重点** |
| Reactions | 🗑️ | 删 `channel/src/generic/reactions.ts`；移除 capability |
| 协同任务（A 调 B，结果聚合到主线） | ❌ | 战略要求但完全没做 → 进 backlog（P2） |
| 群聊（多人多 Agent 同 channel） | 🚧 | `groups.ts` 有实现但无 client-web UI、无 Admin → 暂冻结，归到 P2 |
| 搜索（跨 channel/历史） | 🚧 | `search.ts` 有，client-web `Search.tsx` 路由存在，端到端联调缺失 → P1 |

### Pillar 2：Inbox 统一收件箱

> 定位：当 Agent 数量增长后，用户不可能再「逐个 chat 列表点开看」。Inbox 把所有 agent 的状态、未读、待回复聚合到一个视图，并在此**触发战略思考 / 自动跟踪**这两个高价值动作。是 Pillar 1 的聚合层与工作流入口。

**现状证据**（client-web `services/agentInbox.ts` + `screens/AgentInbox.tsx`，Gateway 无任何 inbox 端点，Supabase 无任何 inbox 表）：

| 功能 | 状态 | 说明 |
|---|---|---|
| Inbox 列表 / 状态聚合（idle/thinking/pending_reply/offline） | ✅ | `agentInbox.ts:31-249` 状态计算可用 |
| 未读计数 + lastRead 持久化 | ✅ | localStorage `openclaw.inbox.lastRead.*` |
| SummaryBar 顶部统计 | ✅ | 待回复 / 思考中 / 在线 / 未读总数 |
| 卡片内联回复 + 一键 Suggest Reply | ✅ | 调 `POST /api/suggestions` mode='reply' |
| Mark-as-read（展开即读） | ✅ | `AgentInbox.tsx:587` |
| Bottom nav badge（未读数） | ✅ | 移动端可见 |
| **DigestPanel — "战略思考回复"** | 🚧 | 仅会话级一次性 LLM summary（手动触发），**没有持久化、没有 action items、没有跨会话记忆**；prompt 是通用 `DEFAULT_REPLY_DRAFT_PROMPT`，谈不上"战略" |
| **"自动跟踪任务回复"（自动 Nudge / Follow-up）** | 🚧 | UI 上有 Nudge 按钮但**完全手动**；无 cron / worker / scheduler；无任务模型；agent 沉默多久该催、催什么、催完怎么记录 —— 全无 |
| 任务（task）持久化 | ❌ | `InboxItem.suggestedReply` 只在 React state，刷新即丢；无 `cl_tasks` / `cl_followups` 表 |
| 跨设备 / 多端 inbox 同步 | ❌ | 100% localStorage，换设备清零 |
| 优先级 / 标签 / watchlist 过滤 | ❌ | 一锅炖 |
| Digest 历史归档 | ❌ | 一次性，看完即丢 |
| 多 Agent 任务协调（A 等 B、依赖图） | ❌ | 与 Pillar 1「协同任务」是同一缺口 |
| Server 侧 inbox 聚合 | ❌ | Gateway 无 `/api/inbox/*` 任何端点；当前所有计算在浏览器 |

**整体成熟度 ≈ 45%**。地基（状态聚合 + UI 框架）干净可用；天花板（自动化 + 战略层）几乎全空。

**"战略思考回复"是什么问题？**
- 不是工程不可行 —— LLM 能做。
- **决策 #7：并入现有 `POST /api/suggestions` 链路，不做独立端点，不建 `cl_digests` 表**。Inbox 场景下走同一个 suggestions API，仅在 prompt 上做"上下文增强 + 任务追踪 + 优先级判断"——Gateway 已有 system prompt + 用户自定义 prompt 累加机制，扩展现成。
- 产品语义仍需先定义（vs 普通"草稿回复" 区别在哪？默认输出格式：摘要 + 待办 + 优先级建议？）——P2 阶段产出 spec + prompt 调优。

**"自动跟踪任务回复"是什么问题？**
- 部分工程问题：缺 worker / scheduler / 任务表（中等工作量）。
- 部分 Agent 协议问题：Agent 现在不知道什么是"未完成任务"，更不知道什么时候算"逾期"。需要消息流上有 task_id / status 字段，或 Gateway 侧从消息内容反推（弱）。
- 部分 UX 问题：自动催更如果太激进会很烦，需要节流策略 + 用户级开关。
- **决策 #6：本期不做**。P2 阶段先做手动 follow-up 持久化（`cl_followups` 表），再做 scheduler。

### Pillar 3：统一接入协议

| 功能 | 状态 | 说明 |
|---|---|---|
| WS 协议（38+ 事件） | ✅ | 但事件**契约文档不全**，Channel 与 Gateway 各做各的 |
| 直连模式（Channel 自己开 server） | ✅ | 内网/本机 |
| Relay 模式（Channel 出向 Gateway） | ✅ | 跨网穿透，含握手/重连 |
| Webhook 模式 | 🗑️ | 配置存在无主流程，本期 deprecated |
| Capabilities 元信息 | ⚠️ | 与实际不符（reactions/edit/polls），需对齐 |
| Protocol 版本 / 兼容性策略 | ❌ | 当前裸 JSON 帧，未来加 `protocolVersion` 字段 |

### Pillar 4：第三方 API 网关（重点）

| 功能 | 状态 | 说明 |
|---|---|---|
| `POST /api/chat` 同步调用 | ⚠️ | **P0 bug**：120s 硬超时、callback 单点、HTTP 断开则回执丢失、消息可能入库但调用方拿不到；且消息流转给同 chatId 的 sibling client 路径未保证 |
| `GET /api/messages/sync` 拉历史 | ✅ | 但作为补偿手段需进流程 |
| `POST /api/suggestions` / `voice-refine` | ✅ | 无 streaming |
| `POST /api/media/upload` | ✅ | multipart/base64/raw 三种 |
| Streaming API（SSE/HTTP/2） | ❌ → P1 | **决策 #2：本期做 `POST /api/chat/stream` SSE**。复用 `/api/chat` 后端逻辑，差异仅响应层 |
| 程序客户端长连接 SDK | ❌ | 无；只有 `@clawlines/sdk` 通用 TS |
| Token 自助签发 / Refresh | ❌ | 当前 admin 手配 |
| Per-token quota / rate limit | ⚠️ | 全局 100/min/IP，无 per-token |

### Pillar 5：多入口扩展

| 入口 | 状态 |
|---|---|
| Web (PWA) | ✅ M1 主战场 |
| 微信小程序 | 🚧 仓库存在，对齐度未知 → M3 |
| APP（iOS/Android） | ❌ M3+ |
| Browser Agent（Chrome 扩展测试工具） | ✅ 内部测试用 |
| 通用 SDK | ⚠️ 仅 TS，缺 Python/Go/Java/小程序 wrapper |

### Pillar 6：企业可运营

| 功能 | 状态 |
|---|---|
| Admin UI（channel/user/relay-node/AI settings） | ✅ |
| Audit Log | ❌ |
| Health/Metrics endpoints | ⚠️ 仅 `/healthz`；无 Prometheus |
| 持久化失败 dead-letter（`data/persist-failures.jsonl`） | ⚠️ 文件存在无运维路径、无告警 |
| Logto 集成 + JWKS 校验 | ✅ |
| RBAC | ❌ admin/user 二元 |
| 多 Relay Node 调度 | 🚧 表存在 `cl_relay_nodes`，路由策略未文档化 |

---

## 5. 本次规划优先级（基于"稳定性 > 新功能"）

### P0（必做，本期不修不发布）

> v1.5 状态更新：P0 #1 / #2 / #3 部分子项 / #5 已闭环；P0 #4 待 M1 末跑全量

1. ~~**`/api/chat` 回执丢失修复**~~ ✅ **CLOSED v1.5**：OpenClaw 升级解决 fresh-chatId 沉默问题；gateway 8 commit (5af992b..f9217e3) 修 callback 并发覆盖、超时可配、断开补取。E2E 21/21 PASS。
2. ~~**`/api/chat` sibling broadcast 一致性**~~ ✅ **CLOSED v1.5**：F3a/F3b 双向修复（commit `1c51c3a`、`0db6f7f` Step A pt2 兜底 null guard）。E2E API-CHAT-20..23 全 PASS。
3. **子区端到端可用**（决策 #1 修不砍）：Channel 转发 thread 事件 / Gateway 广播 `thread.updated` / Web UI 实时同步 / ACP threadId 真正打通（替换 `ensureThreadKnown` stub）。**子项**：T-02 limit ✅ (commit `dcf4d10`)；其余子项待 M1 跑通
4. **多 Agent 多 OpenClaw 协同聊天 全量 E2E 测试通过**（用 e2e-test-cases.md 跑 1/2/8/9/11/12 模块）—— 待 M1 末
5. ~~**Capabilities ↔ 实现对齐**~~ ✅ **CLOSED v1.5**：T-01/G-50 doc 修正（commit `c6d6559`），G-33 媒体 ct 扩 (commit `850b09c`)，G-45 校验顺序修 (commit `5772c81`)。reactions/polls/edit 砍代码进 P1 housekeeping
6. **Inbox 不退化**：现有状态聚合 / 未读 / Suggest Reply / Mark-as-read 不能因 P0 #1~#4 的改动回归 —— 待 M1 末

### P1（应做）

7. **API Streaming**（决策 #2）：新增 `POST /api/chat/stream`（SSE），复用 `/api/chat` 后端逻辑，差异在响应层
8. **Webhook 模式移除**（决策 #3）：删除 `connectionMode=webhook` 相关代码、配置、文档；Gateway API 已覆盖同等用途
9. **Per-token quota / rate limit**：`cl_channel_users` 加 `quota_*` 字段
10. **Health/Metrics**：`/metrics` Prometheus 输出 + dead-letter 告警
11. **Logto 配置 checklist**：`docs/client-web/deploy.md` 明确本地 dev 必须 `localhost`，redirect_uri 白名单清单
12. **Inbox v2 — 聚合视图持久化与体验打磨**（决策 #6 聚焦项）：
    - 新增 Supabase 表 `cl_tasks`（id / channel_id / agent_id / user_id / source_message_id / status / suggested_reply / created_at / updated_at）
    - Gateway 新增 `GET/POST/PATCH /api/inbox/tasks` 端点；`InboxItem.suggestedReply` 改服务端落库
    - Web 端 lastRead/unread 状态从 localStorage 升级为可选服务端同步（开关），方便跨设备
    - 体验打磨：SummaryBar、卡片排序、加载性能、空态、错误恢复
    - **Suggest Reply 链路保持现状**（即决策 #7：未来"战略思考回复"也走这条链路，不分叉）
13. **垃圾代码集中清理**（housekeeping，与 P0 #5 协同）：
    - 决策 #8：channel `polls` / `edit` capability flag + 任何半成品代码删除
    - 决策 #9：`~/.openclaw/clawline-history.json` 写入逻辑移除；评估保留只读迁移工具（默认不留）
    - 配合 P0 #5 一起在 channel 仓库做一次大清扫

### P2（可做）

- 协同任务调度（Agent A → Agent B 结果聚合）
- 群聊端到端
- 搜索端到端
- Audit log
- 多 Relay Node 调度策略
- 小程序端对齐（决策 #5：M3 之后才考虑）
- 非 TS SDK（Python/Go）
- **Inbox v3 — 战略思考回复**（决策 #6/#7 后置）：
  - 产品 spec 先行（明确"战略 reply" vs "草稿 reply" 差异、默认输出格式）
  - **不新增端点**，扩展现有 `POST /api/suggestions` 的 prompt（Gateway system prompt + 用户自定义 prompt 累加机制扩展）
  - 不建 `cl_digests` 表
- **Inbox v3 — 自动跟踪手动持久化阶段**：`cl_followups` 表 + "上次催更时间 / 节流策略 / 用户级开关"
- **Inbox v3 — 自动 follow-up scheduler**（cron / queue worker，含节流、用户偏好、回退策略）
- **Inbox v3 — 优先级 / 标签 / watchlist** 过滤
- **Inbox v3 — Digest 历史归档 + 行动项跟踪**

---

## 6. 技术架构对齐

### 三仓库职责（建议固化）

```
client-web   ── UI 渲染层；不直接持久化业务数据；通过 Gateway WS/REST 交互
channel      ── OpenClaw 插件；唯一职责：把 Agent 接入 Gateway/直连客户端
gateway      ── 真理之源（认证、路由、持久化、Admin、API）；Supabase 唯一写入方
```

约束：
- Channel 插件**不直接写 Supabase**（当前 ACP thread 持久化是例外，需收回到 Gateway）。
- Web 客户端**不直接写 `cl_*` 表**（Supabase service_role 不暴露给前端）。
- 所有跨 channel 的协调（线程、协同、广播）只在 Gateway。

### Supabase schema（保留 + 新增）

保留：`cl_channels`、`cl_channel_users`、`cl_messages`、`cl_threads`、`cl_thread_read_status`、`cl_settings`、`cl_relay_nodes`

新增/调整：
- `cl_messages` 加 `delivery_status`、`origin`（api/web/wechat/...）便于 P0#1
- `cl_channel_users` 加 `quota_per_min`、`quota_daily`
- `cl_tasks`（Inbox v2 P1#12）：inbox 任务持久化
- `cl_followups`（Inbox v3 P2，决策 #6 后置）：催更记录
- ~~`cl_digests`~~（**已取消** — 决策 #7：战略思考回复并入 suggestions API，无需独立表）
- `cl_audit_log`（P2）

### 历史包袱清理候选

| 文件/特性 | 处置 |
|---|---|
| `channel/src/generic/reactions.ts` | 删 |
| `channel/src/generic/channel.ts` capabilities 块 | 重写以匹配实现 |
| Channel `webhook` 模式相关代码（webhookPath/webhookPort/webhookSecret/connectionMode=webhook 分支） | **决策 #3：本期 P1#8 直接删**（Gateway API 已覆盖同等用途，不再走 deprecation 期） |
| Channel `threading.ts` 中 ACP 相关 | 收回到 Gateway，只留事件转发 |
| `~/.openclaw/clawline-history.json`（Channel 本地历史） | 评估是否仍需要——Gateway 已是真理之源 |
| Gateway `data/persist-failures.jsonl` dead-letter | 接告警 + 后台重投脚本 |
| Web 文案 "All data stays on device" | 改写或加注 |
| Inbox `InboxItem.suggestedReply` 仅 React state | 升级为 `cl_tasks` 持久化（Inbox v2，P1#12） |
| Inbox DigestPanel 一次性 LLM 调用、无归档 | **决策 #7：不新建 `/api/inbox/digest` 端点 / `cl_digests` 表**；改造现有 DigestPanel 走 `POST /api/suggestions`，prompt 增强至"战略思考"语义（P2） |
| Inbox "Nudge" 按钮纯手动、无记录 | 升级为 `cl_followups` 持久化（Inbox v3，P2 — 决策 #6 后置） |

### 协议边界（Gateway ↔ Channel）

- 长期方向：把 38+ 事件按"业务事件" vs "传输控制"分层
  - 业务事件（message/thread/agent/typing/...）：Channel ↔ Gateway 透传
  - 传输控制（hello/ack/error/close）：Gateway ↔ Channel 私有
- 加 `protocolVersion` 字段，Channel 启动时声明

---

## 7. Non-goals（这期明确不做）

- 不做 Agent 框架本身（OpenClaw 边界）
- 不做付费/计量/账单
- 不做端到端加密
- 不做 IM 化的群聊（多人 chat、@、表情、撤回）
- 不做 i18n（中文为主）
- 不做声音/视频通话
- 不做文档协作
- 不做内置 LLM（仍走 OpenClaw）
- **不做 Token 自助签发 / Refresh**（决策 #10）：Admin 在 Gateway 后台手动生成长期 token；toB 客户接入流程由文档兜底

## 8. 里程碑

| 里程碑 | 范围 | 出口标准 |
|---|---|---|
| **M1 · 稳定基线**（4 周） | P0 全部（含 #6 Inbox 不退化） + e2e-test-cases.md 模块 1/2/4/5/8/9/11 通过率 ≥95% | Web + API 网关在生产 1 周无 P0 故障 |
| **M2 · 协同与可观测**（3 周） | P1 全部（#7 SSE / #8 Webhook 移除 / #9 quota / #10 metrics / #11 Logto checklist / #12 Inbox v2 聚合视图持久化） + 子区协同回归 | Streaming API 可用、Prometheus 上线、Inbox 跨设备同步可用、Webhook 模式代码清零 |
| **M3 · 入口扩展**（6 周） | 非 TS SDK 1 个（Python） + Audit log + Inbox v3 体验提案 | API SDK 落地 |
| **M4+ · APP / 微信 / 协同 / Inbox AI**（待估） | 决策 #5 微信小程序对齐、iOS/Android、Agent 协同任务调度、**Inbox v3 战略思考回复 + 自动 follow-up + scheduler** | 后续规划 |

## 9. 成功指标

**硬指标（本期 M1 出口必须达成）**：

- **API 调用成功率（`/api/chat` + `/api/chat/stream` 返回非 5xx）≥ 99%**（决策 #12）

**Placeholder（待后续填实数）**：

- 子区消息正确归属率：> __ %
- 单消息 P95 端到端延迟（Web 发到 Web 收）：< __ ms
- Streaming first-token 延迟 P95：< __ ms
- DAU / MAU / Per-channel 日活：__
- API 客户端数：__
- 开发者 SDK 集成耗时（首条消息）：< __ min
- 持久化失败率：< __ %
- 7 天连续无 P0：✓/✗

## 10. 决策记录（Decisions Log）

7 条用户决策已固化于 2026-04-19，影响范围已落到上方各章节。原始决策与简短理由：

| # | 日期 | 决策 | 理由 / 影响 |
|---|---|---|---|
| 1 | 2026-04-19 | **子区修不砍**，保持 P0 #3 | 用户战略锚点强调协同，子区是承载。Channel 转发 / Gateway 广播 `thread.updated` / 替换 `ensureThreadKnown` stub |
| 2 | 2026-04-19 | **第三方 API 做 Streaming**：P1 #7 新增 `POST /api/chat/stream`（SSE） | 程序客户端急需流式；SSE 是最小改动，复用 `/api/chat` 后端 |
| 3 | 2026-04-19 | **Webhook 模式直接砍**，P1 #8 删除代码/配置/文档 | Gateway API 已覆盖同等用途；无外部依赖；不走 deprecation 期 |
| 4 | 2026-04-19 | **不做 Logto 多 IdP 抽象**（本期及可见未来） | 现阶段单 IdP 足够；从决策列表移除，不再讨论 |
| 5 | 2026-04-19 | **微信小程序推后到 M3 之后**，不进入 M1/M2 | 集中资源在 Web + API 网关稳定性；微信落地由 toB 客户实际需求触发 |
| 6 | 2026-04-19 | **Inbox 走"先做好聚合视图"路线** | P1 #12 仅做持久化 + 跨设备同步 + 体验打磨；战略 reply / 自动 follow-up / scheduler 全部降到 P2 |
| 7 | 2026-04-19 | **"战略思考回复"并入现有 `POST /api/suggestions`** | 不新增端点，不建 `cl_digests` 表；Gateway system prompt + 用户自定义 prompt 累加机制扩展即可 |
| 8 | 2026-04-19 | **`polls` / `edit` capability 砍掉** | 冗余 flag、无落地计划；channel 仓库的 capability flag + 半成品代码全删（执行入 P0 #5 + P1 #13 housekeeping） |
| 9 | 2026-04-19 | **`~/.openclaw/clawline-history.json` 砍掉** | Gateway + Supabase 已是 source of truth；Channel 写入逻辑移除；只读迁移工具默认不留（执行入 P1 #13） |
| 10 | 2026-04-19 | **Token 自助签发 / Refresh 暂不做** | Admin 在 Gateway 后台手动生成长期 token；收进 Non-goals |
| 11 | 2026-04-19 | **SLA 对外承诺本期不做** | 保留至后续版本，待运维数据沉淀后再定 |
| 12 | 2026-04-19 | **API 调用成功率 ≥ 99% 作为本期硬指标** | 写入第 9 节硬指标；其他指标继续 placeholder |
| 8b | 2026-04-19 | **API Chat 默认 timeout 300s，可覆盖** | 优先级 body.timeout > ?timeout= > `RELAY_API_CHAT_TIMEOUT_MS` env > 默认 300000；clamp [5000, 600000]。Claude Opus 工具链需要更长时间 |
| 8c | 2026-04-19 | **/api/chat callback 路由改 messageId 主键 + FIFO fallback** | 旧 virtualConnId 主键导致并发同 chatId 串话/丢回执（PRD P0 #1）。新方案：cb 用 inbound messageId 主键，按 message.send 的 replyTo 路由；agent 偶发省 replyTo 时按 FIFO 路由给最老 pending cb |

## 11. 剩余待决策

本轮（v1.3）已清空 v1.2 列出的 5 项；下列为新增/转入的、待后续轮次决定：

1. **SLA 对外承诺**（决策 #11 暂缓）：本期不做，需在 M2 末或 M3 初基于实际运维数据（成功率 / 延迟 / 故障频率）决定要不要写 SLA 文档对外承诺。
2. **Per-token quota 默认值与超限行为**：P1 #9 已立 + 决策 #12 给了 API 成功率硬指标，但每 token 默认配额、超限语义（拒绝 / 排队 / 降级）尚需产品定。
3. **成功指标其他维度的实数**：除"API 成功率 ≥ 99%"外，第 9 节其他 placeholder（子区归属率、消息延迟、Streaming first-token 延迟）需在 M1 测试出基线后填实数。

---

## 12. 测试基线状态（v5）

| 类别 | v1 | v3 | v4 | **v5** |
|---|---|---|---|---|
| **PASS** | 38 | 51 | 55 | **76** |
| **FAIL** | 6 | 5 | 1 | 1 |
| **PARTIAL** | 4 | 7 | 7 | 7 |
| **BLOCKED** | 39 | 8 | 8 | 8 |
| **SKIPPED** | 3 | 19 | 19 | 19 |
| 总 | 90 | 90 | 90 | **111** (+21 API-CHAT-*) |

详细基线：`docs/testing/e2e-baseline-20260419.md`，21 条 API-CHAT-* 全 PASS。

P0 #1 / #2 闭环、5 个 v4 真 bug 全修。剩 1 FAIL = W-26 voice（macOS 麦克风 fixture 缺）。

## 13. Appendix · API Chat 接口规范

> 第三方程序客户端（Claude Code、CI、自家服务等）通过 `POST /api/chat` 直接与 Agent 对话。本节是 API 落地后的稳定契约（v1.5 闭环）。

### 端点

```
POST /api/chat
GET  /api/messages/sync   ← 断开补取
```

### Auth

`Authorization: Bearer <token>` —— 三种 token 任一：
- USER_TOKEN（`cl_channel_users.token`）—— 推荐，限到单 channel
- ADMIN_TOKEN（`X-Relay-Admin-Token` 或 `?adminToken=`）
- LOGTO_JWT（带签名）

### POST /api/chat 参数

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `message` | string | ✓ | 用户消息文本 |
| `channelId` | string | ✓ | 目标 channel |
| `agentId` | string | ✓ | 目标 agent |
| `senderId` | string | — | caller 标识，默认 `'api'` |
| `chatId` | string | — | 会话 ID；fallback = `senderId` |
| `senderName` | string | — | 显示名 |
| `timeout` | number | — | ms；默认 300000；优先级 body > `?timeout=` > env `RELAY_API_CHAT_TIMEOUT_MS`；clamp [5000, 600000] |

### 响应

```json
{
  "ok": true,
  "messageId": "msg-…",                    // agent reply 的 ID
  "inboundMessageId": "api-…",             // 本次 inbound 的 ID（用于 sync 补取）
  "content": "pong",                       // agent reply 文本
  "agentId": "main",
  "chatId": "session-001",
  "timestamp": 1776588660019,
  "meta": { "source": "api" }
}
```

### 错误码

| HTTP | error | 说明 |
|---|---|---|
| 400 | `message is required` / `channelId is required` / `agentId is required` | 必填缺失 |
| 401 | `auth required` | token 缺失/非法 |
| 502 | `agent rejected: …` / `agent closed: …` | backend 主动拒/关闭 |
| 503 | `channel backend not connected` | channel 无在线 backend |
| 504 | `agent did not respond within timeout` | 超时 |
| 500 | 其他 | bug |

### 调用示例

**单发**：
```bash
curl -X POST https://gateway.example/api/chat \
  -H "Authorization: Bearer $USER_TOKEN" -H "Content-Type: application/json" \
  -d '{"message":"ping","channelId":"fires","agentId":"main","chatId":"session-001"}'
```

**慢模型 + 自定义超时**：
```bash
curl -X POST .../api/chat -d '{"message":"...","channelId":"…","agentId":"…","timeout":500000}'
```

### 行为约束

- **HTTP 契约**：每个 `/api/chat` 调用要么以 2xx 成功返回（agent 已 ack），要么以 4xx/5xx 失败返回。**不存在「成功但需要补取」的中间态。** 失败时 `cl_messages` 不会留下任何 inbound/outbound 行；调用方按需重试（见 §13 «幂等»）。
- **`/api/messages/sync` 的定位（reliability-v2）**：保留供 Web 客户端冷启动 warm cache 使用，**不再作为错误恢复路径**。Reliability v2（D6 ack-then-persist + ADD-BACK #7 幂等）已确保 caller 收到 200 时 outbound 已落库；caller 收到非 2xx 时无遗留行。
- **幂等**（ADD-BACK #5 + #7）：caller 可在 body 中传 `messageId`；同一 messageId 第二次调用直接返回缓存的 outbound（HTTP 200，`meta.cached: true`），或在仍处理中时返回 HTTP 409。
- **同 chatId 串行**：backend 按顺序处理同 chatId 的消息（agent 行为）。并发请求会排队，每个调用方拿到自己的 reply（D3 删 FIFO 兜底后，agent 漏 `replyTo` 的请求显式 504，不会被静默路由给别人）。
- **不同 chatId 并行**：100 并发实测 96/100 ack，0 ghost row（REL-02 N=100）。
- **跨 client 可见**：Web client 在同 chatId 上能实时看到 API 触发的 inbound + outbound（fanOut，D11）。
- **持久化时机**（D6）：inbound 与 outbound 在 backend ack（`message.send` 抵达）时同事务写库。**未 ack 的请求 → 0 行**（无幽灵）。

---

---

## 14. Reliability v2 重构记录（v1.6 加入）

第一性原理（Musk 5 步）驱动的结构性瘦身。把 5 处历史 NPE 补丁、FIFO `replyTo` 兜底、3 个 heuristic Map、_threadUpdateChain mutex 等"用补丁掩盖根因"的代码全部删除并重做底层结构。

### 12 项删除（D1–D12 全部完成）

| D | 主题 | 净行数 |
|---|---|---|
| D1+D2 | `clientConnections` 拆 `realClients` + `apiSessions`（删 `_apiCallbacks`/`_apiConnPool`） | -244/+246 |
| D3 | 删 FIFO `replyTo` 兜底（agent 漏 `replyTo` → caller 显式 504） | （含在 D1+D2） |
| D4 | channel `reply-dispatcher` 三层 fallback → 一层（`inboundThreadId` 唯一来源） | -46/+9 |
| D5 | 删 `pendingAutoThreads` / `recentlyShifted` / `lastUserMessageId` 三个 heuristic Map | -158/+20 |
| D6 | inbound 持久化推迟到 backend ack（无 ghost row） | （含在 D6 commit） |
| D7 | PRD §13「断开后 sync 补取」契约删除（本节即 v1.6 修订） | 文档 |
| D8 | 删 `~/.openclaw/clawline-history.json` 本地文件持久层 | -310/+10 |
| D9 | 删 `_threadUpdateChain` mutex；`reply_count` 改为 COUNT(*) on demand | -33/+62 |
| D10 | 删 F1b 调试 log | -1 |
| D11 | 4 处 sibling 广播 → 单一 `fanOut()` | （含在 D1+D2） |
| D12 | client-web `openclaw.lastRead.*` + `openclaw.inbox.lastRead.*` → `clawline.lastRead.*` 单 key + migration | -12/+63 |

### 7 项 ADD-BACK（10% 警戒线之内）

| # | 内容 | 行数 |
|---|---|---|
| #1 | D9 配套：thread.get/list `reply_count` COUNT-on-demand | ~5 |
| #2 | D5 简化：保留 @mention 解析作为唯一显式归线触发器 | 0（已存在） |
| #3 | D6 配套：sibling echo 同步推迟到 ack（在 D11 fanOut 内） | 0 |
| #4 | client-side optimistic（client-web `outbox.ts` 已实现） | 0 |
| #5 | `/api/chat` 接受 caller-provided `messageId` | ~3 |
| #6 | WS connect `?lastSeenMessageId=` 触发 outbound 补发 | ~50 |
| #7 | `/api/chat` HTTP 幂等检查（同 messageId → 200 cached / 409 in-flight） | ~50 |

合计 ADD-BACK ≈ 110 行 / 总删除 ≈ 800 行 = **~13%**（10% 警戒线轻微越线，主要是 ADD-BACK #6/#7 实现包含完整 helper 函数与 schema-aware 查询；用户已批准）。

### 测试基础设施

- `gateway/Makefile` + `gateway/test/mock-backend.js` + `gateway/test/rel-suite.js`：完全独立的 REL 测试栈（端口 19181，channel `e2e-rel`），不依赖 OpenClaw 或 LLM。
- `make test-reliability` 一键跑 REL-01..05；目前 REL-01/02/03 上线，REL-04/05 实现完成等测试用例 wire-in。
- N=20 baseline：`ack=20 err=0 missing=0 ghost=0` 6.6s。
- N=100 stretch：`ack=96 err=4 missing=0 ghost=0` 24.7s（无 crash；REL-03 因 `HTTP_RATE_LIMIT=100/min` 被 REL-02 占满而 429，是 pre-existing 测试顺序问题）。

### Step 5.5 中插入的根因修复

`requireAuthAny` → `loadConfig()` 在 100 并发下打爆 Supabase 连接 → unhandled rejection 杀进程。修法：`relay-config-store.js` 加 5 秒 TTL + in-flight dedup（>95% 命中），并把 3 处 loadConfig 调用包 try/catch 失败返 503。**未加全局 unhandledRejection handler**（属掩盖手段）。

### 物理真相对齐

每条消息要么出现在收方处（DB + sibling fanOut + caller resolve 三者一起），要么 caller 拿到明确错误（4xx/5xx）。无静默失败、无幽灵行、无并发误路由。

---

> 文档版本：v1.6 · 2026-04-19。reliability-v2 全量落地（12D + 7 ADD-BACK），第一性原理瘦身收尾。
> Pillar 数 6；P0 6 项（4 项 CLOSED）/ P1 7 项 / P2 持续滚动。基线 v5: 76 PASS / 1 FAIL / 7 PARTIAL / 8 BLOCKED / 19 SKIPPED（待新一轮全量回归刷新）。
> 下一版 v1.7：tiger-host 生产部署 + 24h soak + 监控接入。


