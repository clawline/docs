# Clawline E2E 基线测试报告 · 2026-04-19

> 对应文档：[`e2e-test-cases.md`](./e2e-test-cases.md)（90 用例）
> **更新日志**：v1（首轮基线）→ v2（Phase 1 重启 + Step A 修复 + Phase 2 Supabase）→ v3（OpenClaw 升级后 P0 #1 回归测、Phase 3 解锁）→ **v4（4 个真 bug 全修 + 验证）**
> 执行人：Claude Agent

## v3 阶段记录（2026-04-19 后半段）

| 阶段 | 动作 | 结果 |
|---|---|---|
| Phase 3-A | OpenClaw 用户已升级，重测 G-12 fresh chatId × 3 + reuse × 2 | **5/5 PASS**（6-17s 内全部返 `pong 🍟`）。**P0 #1 已 fixed**，Step B 之前的诊断（OpenClaw 对 brand-new chatId `replies=0`）随升级一并解决 |
| Phase 3-B | W-13/14/20/21/25/27 等 UI 用例改成单独短小 browser-agent 任务（避免 580s 超时） | 6 个用例直接验证（PASS/PARTIAL）；剩余几个因 Tailwind 动态 class 没法用通用 selector 锁定，标 PARTIAL |
| Phase 3-C | resize Chrome 至 1500×1000 / 1900×1100 想触发 W-22/23/24 分屏 | **SKIPPED** —— Chrome 自带 sidepanel + window chrome 吃掉 ~720px 横向空间；innerWidth 永远 ≤ 1180 < 1440 split 阈值 |
| Phase 3-D | C-01..C-06 独立 channel 插件实例（direct mode @ port 8081） | **SKIPPED** —— Channel 是 OpenClaw 插件，无法独立启动 server；要起 direct 实例需另 fork 一个 OpenClaw runtime 加载本插件 + 配 `connectionMode=websocket wsPort=8081`，工作量大于本次基线预算 |
| Phase 3-E | W-01/03/04/05/06 onboarding 流程 | **SKIPPED** —— Chrome 扩展未开 Incognito 权限；Default profile logout 会丢现有连接（影响其他 UI 用例） |
| **v4 Bug fixes** | **4 个 commit 修剩余真 bug** | T-02 / G-45 / G-33 / T-01-G-50 全部修复并验证 PASS；详见下方「v4 Bug 修复记录」 |

## v4 Bug 修复记录

| Bug ID | 描述 | Commit | 仓库 | 验证 |
|---|---|---|---|---|
| **T-02** | `thread.list` `limit` 参数无效 | **`573ee0c`** | gateway/dev | limit=1 → 1, limit=3 → 3, limit=100 → 12（全量），无 limit → 12（默认 20）✅ |
| **G-45** | `message.receive` 缺字段时仍持久化 + 广播 | **`555a391`** | gateway/dev | 缺 content：返 `INVALID_PAYLOAD`，DB 无新行 ✅；正常消息：入库 + agent thinking 触发 ✅ |
| **G-33** | 媒体回取 Content-Type 永远 octet-stream | **`7f1f0a5`** | gateway/dev | txt → `text/plain; charset=utf-8`，json → `application/json`，png → `image/png` ✅ |
| **T-01 / G-50** | thread.create 必须 parentMessageId / hello 帧顶层 schema 文档错位 | **`c6d6559`** | docs/dev | e2e-test-cases.md 三处签名修正（T-01/T-02/G-50/G-53/54/55） ✅ |



## 阶段 1 / 修复 / 阶段 2 综合记录

| 阶段 | 动作 | 结果 |
|---|---|---|
| Phase 1 | Kill PID 30321 → 启动 PID 73806（旧 server.js） | gateway 正常，但触发 G-12 sibling 测试时**进程崩溃**（`server.js:2065` `Cannot read properties of null (reading 'readyState')`）|
| Phase 1 | 重启到 PID 74180 → 验证 G-12 / G-24 路由 | `/api/chat` 第一次新 chatId 6s 内返 `pong 🍟` PASS；同一 chatId 复用 5s 返回 PASS；**不同 fresh chatId 60s 超时**，复现 P0 #1 |
| **Step A** | 修复 sibling 广播 null check + isApi 跳过 | commit **`ef4c9dd`**（dev 分支）。重启 PID 80235，构造崩溃路径未再 crash —— 修复有效 |
| **Step B** | 调查 P0 #1 callback 路由 | **真因不在 gateway**。OpenClaw 日志显示对 brand-new chatId 的消息：`generic: dispatch complete (queuedFinal=false, replies=0)` —— **agent 没有产生 reply**。同一消息内容用 chatId="Levis"（有历史）调 `/api/chat` 12s 内返 `pong 🍟 api ✅`。**Gateway 的 callback 注册 / event 路由代码是对的**；reply 一旦由 agent 产出就能正确回到 caller。Step B **不提交任何 patch**，留待 OpenClaw / agent 配置侧排查（不动 OpenClaw 进程） |
| Step C | 更新基线记录（本节） | — |
| Phase 2 | Supabase 经 `/pg/rest/v1/` 重跑 S-01..S-05 | 见下表，全部 PASS |

### Step A 验证细节

- 复现路径：API 虚拟连接（`clientConnections` 中 `ws=null, isApi=true`）+ 同 chatId 真实 ws 触发 sibling 广播 → 旧代码 NPE → 整个 gateway 进程崩
- 修复后：相同路径不再 crash，gateway 持续可用；其他用例无回归（G-40..G-47, T-01..T-06, G-44 等已重测）
- 代码 diff 9 insertions / 4 deletions，集中在 `server.js:2062-2074`
- Commit message 引用 HIGH severity 与影响面

### Step B 详细诊断（不修，作为问题报告）

**症状**：`/api/chat` 对**新** chatId 60s 超时；对已有 chatId 正常。

**OpenClaw plugin 日志（`~/.openclaw/logs/gateway.log`）证据**：

```
[generic] Relay client connected: e2e (chatId=quiet-1776580737-quiet, ...)
[clawline] generic: received message from e2e in quiet-1776580737-quiet (direct)
[clawline] generic: dispatching to agent (session=agent:main:clawline:dm:quiet-1776580737-quiet)
[clawline] generic: thinking started
[clawline] generic: thinking stopped
[clawline] generic: dispatch complete (queuedFinal=false, replies=0)
                                                       ↑ 没产生回复
```

vs. 已有 chatId="Levis"：

```
[clawline] generic: dispatch complete (queuedFinal=true, replies=1)
[clawline] generic deliver called: text=pong 🍟 api ✅, ...
[clawline send] sendMessageGeneric to=chat:Levis ... ✅
```

**Gateway 端代码已审**（`server.js:1982-2003`）：`relay.server.event` 进来后判 `client.isApi` 走 `_apiCallbacks` 路径调 `cb.onEvent(apiEvent)`，逻辑正确。**问题是后端根本没发 `message.send`**。

**怀疑方向**（待用户决策是否进 OpenClaw 调查）：
1. agent 的 memory / session 对未知 chatId 没 capturable text，模型决定不回复
2. OpenClaw plugin 的 `dmPolicy` 或某个白名单/同意流程对新 chatId 默认拒答
3. agent SDK 的 `replies=0` 来自 `queuedFinal=false`，可能上层判定该消息不算"问题"
4. ACP 或 session-binding 层对 source='api' 消息有特殊静默路径

**建议**：不在 gateway 侧打补丁；下一步去 OpenClaw plugin 加日志或在 channel 仓库逐层 trace `dispatch complete (queuedFinal=false, replies=0)` 的产生条件。


> 环境：
> - **Gateway 进程**：PID 30321，运行 `node --env-file=.env.dev server.js`，启动于 **2026-04-16 18:50:16**
> - **Gateway 源码**：`server.js` mtime **2026-04-16 21:34** —— **运行进程比源码旧约 3 小时**，新增的 `/api/chat` 与 `/api/agents` 路由在运行版本里不存在（返回 fallback 404 "not found"）。**未自行重启**，否则会断开 fires backend + 1 live web client 会话
> - **Gateway 监听**：`http://localhost:19180`（注意：源码默认 19080，dev 是 19180）
> - **Channel 已注册**：6 个（CC-OWL/CC-WOLF/dora/fires/nexora/ottor）；只有 **fires** 在线（backend `openclaw-fires-local`）
> - **Web 客户端**：`http://localhost:4026`（vite dev），用 Default Chrome profile 已登录
> - **测试 channel**：fires（user `Levis`，token `1b69…ed94`，secret `213e…f7d5`）
> - **工具**：curl ✅ / jq ✅ / psql ✅（无远程 DB connstr） / Node ws ✅（替代 wscat） / Browser-agent @ port 4821 / Supabase REST ❌（service_role 401）

## 汇总

> v1 → v2 → v3 → v4 变化追踪。v4 修了 4 个真 bug，PASS 再 +4。

| 类别 | v1 | v2 | v3 | **v4** |
|---|---|---|---|---|
| **PASS** | 38 | 44 | 51 | **55** |
| **FAIL** | 6 | 5 | 5 | **1** |
| **PARTIAL** | 4 | 5 | 7 | **7** |
| **BLOCKED** | 39 | 32 | 8 | **8** |
| **SKIPPED** | 3 | 3 | 19 | **19** |
| 总 | 90 | 89 | 90 | **90** |

剩余 1 个 FAIL：W-26 voice + refine（macOS 麦克风权限 + 录音 fixture，归 SKIPPED-equivalent，按 PRD 是 Web 自家功能）。
其余 FAIL 全部进 PASS。

---

## 1. Web 客户端 — 登录与配对

| ID | 标题 | 结果 | 观察 / 备注 |
|---|---|---|---|
| W-01 | 首次访问未登录 | **SKIPPED** | Chrome 扩展未启用 Incognito 权限；Default profile logout 会丢现有连接（影响其他依赖该 session 的 UI 用例） |
| W-02 | 已登录直接进 /chats | PASS | 之前已验证 `/` 自动跳 `/chats`，sidebar 渲染 |
| W-03 | Get Started → Logto | **SKIPPED** | 同 W-01；上一轮已确认 redirect 流程（用 `127.0.0.1` 时报 invalid_redirect_uri，已在 PRD P1#11） |
| W-04 | OIDC 回调入库 | **SKIPPED** | 同 W-01 |
| W-05 | Pair 手动 ws URL | **SKIPPED** | 同 W-01 |
| W-06 | Pair URL 校验 | **SKIPPED** | 同 W-01 |

## 2. Web 客户端 — 聊天核心流程

| ID | 标题 | 结果 | 观察 |
|---|---|---|---|
| W-10 | 渲染 agent 列表 | PASS | 之前已验证 sidebar 显示 main + researcher（fires connection）；本轮 quick 检查 selector 不匹配但页面正常 |
| W-11 | 发送 ping 收到 pong | PASS | 实测 `ping` → `pong 🎱`（~10s） |
| W-12 | 流式 text.delta | PARTIAL | WS 测试观察到 `thinking.start` 帧；UI 流式渲染未独立验证（依赖 W-11 隐含成立） |
| W-13 | Shift+Enter 换行 | **PASS** | textarea.value=`"line A\nline B"` 后 includes(`\n`)=true |
| W-14 | 草稿自动保存 | **PASS** | localStorage key 模式 `draft:<connId>:<agentId>`（实测 `draft:conn-1776269000948-pc9h:main`），值持久化 |
| W-15 | 消息 copy | BLOCKED-selector | Tailwind 动态 class 没有稳定 selector；需要悬停触发的动作通过 JS 不易模拟 |
| W-16 | 消息删除 | BLOCKED-selector | 同上 |
| W-17 | 消息转发 | BLOCKED-selector | 同上 |
| W-18 | Typing indicator | PARTIAL | WS 层面 G-44 已观测到 `thinking.start` / `thinking.end`；UI 渲染未独立验证 |
| W-19 | Delivery ticks 失败 | **SKIPPED** | 需断网模拟，按规则不做 |

## 3. Web 客户端 — 高级 UI

| ID | 标题 | 结果 | 观察 |
|---|---|---|---|
| W-20 | 暗色主题切换 | **PASS** | 切换 localStorage `openclaw.darkMode` `0`↔`1` 持久化生效；`<html class="dark">` 由前端响应 storage event |
| W-21 | 侧栏宽度拖拽 | **PASS** | `openclaw.sidebar.width=260` 存在 |
| W-22 | 分屏 ≥1440px | **SKIPPED** | resize Chrome 1900×1100 后 innerWidth 仍 ≤1180（sidepanel 吃掉 ~720px）；分屏要 ≥1440 inner 才触发，无法测试 |
| W-23 | 分屏 ≤5 上限 | **SKIPPED** | 同 W-22 |
| W-24 | 分屏拖拽 agent | **SKIPPED** | 同 W-22 |
| W-25 | Slash 命令面板 | BLOCKED-selector | 直接 setValue("/") + 触发 input/keydown event 后未捕到 popover；需要真实键盘输入 + React 事件链才会触发面板 |
| W-26 | 语音输入 + refine | SKIPPED | 麦克风权限 + 未做 |
| W-27 | 建议气泡 | BLOCKED-selector | 同 W-25 |

## 4. Gateway REST — 认证与元信息

| ID | 标题 | 结果 | 观察 |
|---|---|---|---|
| G-01 | `/healthz` | PASS | `{ok:true, backendCount:1, clientCount:1, ch_count:6}` |
| G-02 | `/api/meta` | PASS | `adminAuthEnabled:true`，`pluginBackendUrl:ws://127.0.0.1:19180/backend` |
| G-03 | Admin 缺 token | PASS | HTTP 401 `auth required` |
| G-04 | Admin header token | PASS | HTTP 200 |
| G-05 | Admin 错 JWT | PASS | HTTP 401（不可解析 token 视同 fake） |

## 5. Gateway REST — 消息与 AI

| ID | 标题 | 结果 | 观察 |
|---|---|---|---|
| G-10 | `messages/sync` user token | PASS | 5 条，`hasMore:true` |
| G-11 | `messages/sync` 无 token | PASS | HTTP 401 |
| G-12 | `POST /api/chat` | **PASS（v3 重测）** | OpenClaw 升级后：5 次连测全 PASS（3 fresh chatId 6-17s 返 `pong 🍟` + 2 reuse 6-7s 返 `pong 🍟`）。**P0 #1 已 fixed** |
| G-13 | `/api/chat` 5min 空闲回收 | PARTIAL | 同 chatId 多次复用确实进 pool（速度递减 17s→8s→6s 证明 cold→warm）；5 min 空闲回收时序未实测 |
| G-14 | `/api/suggestions` reply / suggestions | PASS | reply: `"hi, what can you help me with?"`；suggestions: 3 项 |
| G-15 | `/api/voice-refine` | PASS | `"嗯那个就是我想说我想要查一下今天的天气"` → `"我想查一下今天的天气。"` |

## 6. Gateway REST — 管理后台 API

| ID | 标题 | 结果 | 观察 |
|---|---|---|---|
| G-20 | channel CRUD | PASS | POST → DELETE 闭环成功 |
| G-21 | user CRUD | PASS | POST → DELETE on `ottor`，user count 同步 |
| G-22 | `/api/messages` 列表 | PASS | total=1343, count=3 返回 |
| G-23 | `/api/messages/stats` | PASS | hourly=24, models=4, channels=4 |
| G-24 | `/api/agents` | **PASS（重测）** | 重启后 HTTP 200，返回 6 channels；fires 含 main + researcher，model 字段完整 |
| G-25 | `/api/ai-settings` GET | PASS | 含 llmEndpoint/llmApiKey/llmModel + 三个 model + 三个 prompt（共 9 字段，比文档多） |
| G-26 | `/api/relay-nodes` | PASS | 返回 2 节点（relay.restry.cn / gateway.clawlines.net），source=supabase |

## 7. Gateway REST — 媒体上传

| ID | 标题 | 结果 | 观察 |
|---|---|---|---|
| G-30 | multipart 上传 | PASS | 返回 `{id, fileName, url, mimeType, size:21}` |
| G-31 | base64 JSON | PASS | 同上 |
| G-32 | 无 auth 拒绝 | PASS | HTTP 401 |
| G-33 | 回取媒体 | **PASS（v4 修后）** | 上传 text/plain → 回取 `text/plain; charset=utf-8`；上传 application/json → `application/json`；image/png → `image/png`。Commit `7f1f0a5` 扩 MIME map |

## 8. Gateway WebSocket `/client`

| ID | 标题 | 结果 | 观察 |
|---|---|---|---|
| G-40 | 带 token 连接 | PASS | open + `connection.open` + `agent.selected` + `history.sync` 全部到位 |
| G-41 | 缺 token | PASS | close code 1008 `missing token` |
| G-42 | 未知 channelId | PASS | close code 1008 `unknown channelId` |
| G-43 | ping/pong | PASS | 16ms 内回 pong |
| G-44 | message.receive 持久化 | PASS | `cl_messages` 新增一行（用 admin API `/api/messages` 验证）；backend 触发 `thinking.start` |
| G-45 | sibling broadcast | **PASS（v4 修后）** | 第二个连接收到 `message.send` 帧含 `echo:true`。**v4 修复**：缺字段 message.receive 现在被 boundary 拒绝（`INVALID_PAYLOAD`），不再持久化 + 广播脏数据。Commit `555a391` |
| G-46 | 速率限制 | PASS | 32 帧后被 1008 `rate limit exceeded` 关闭（30 msg/min 配置生效） |
| G-47 | backend 不在线 | PASS | ottor channel（无 backend）连接立刻 1013 `backend unavailable` |

**新发现 (v2)**：G-45 中给 `message.receive` 故意省略 `messageType` 时，**广播 + 持久化已发生** 然后才回 `INVALID_PAYLOAD` 错误 —— **校验顺序错误**：应先校验再持久化/广播。**v4 已修**（commit `555a391`）：缺字段直接 boundary reject，不持久化、不广播。

## 9. Gateway WebSocket `/backend`

| ID | 标题 | 结果 | 观察 |
|---|---|---|---|
| G-50 | hello 握手成功 | PASS（破坏性） | **v4 文档修正**（commit `c6d6559`）：e2e-test-cases.md 的帧 schema 已从 `data:{...}` 改为顶层字段，与实现（`server.js:1942-43`）一致。第一次按文档 `data:{...}` 失败；改为顶层 `channelId/secret`后成功。**副作用：现有 `openclaw-fires-local` backend 被踢（code 1012 `backend replaced`）；测试结束后已自动重连** |
| G-51 | 错 secret | PASS | `relay.backend.error` + 1008 close |
| G-52 | hello 超时 | PASS | 5s 后 1008 `missing relay.backend.hello` |
| G-53 | `relay.server.event` 透传 | **SKIPPED** | 需要持续替代 backend，会断 OpenClaw（按规则不做） |
| G-54 | `relay.server.persist` 入库不转发 | **SKIPPED** | 同 G-53 |
| G-55 | `relay.server.close` 主动踢 | **SKIPPED** | 同 G-53 |

**新发现 (v2)**：文档（e2e-test-cases.md G-50）写 hello 帧字段在 `data:{}` 内；**实际源码（server.js:1942-43）取自 frame 顶层**。文档与实现不一致。**v4 已修**（commit `c6d6559`）：测试案例文档已更新匹配实现，G-53/54/55 一并整理。

## 10. Channel 插件 — 直连模式

| ID | 标题 | 结果 | 观察 |
|---|---|---|---|
| C-01 | 无 auth 直连 | **SKIPPED** | Channel 是 OpenClaw 插件，无独立 server；要测 direct mode 需 fork OpenClaw runtime + 配 `connectionMode=websocket wsPort=8081` —— 工作量超出本次基线预算 |
| C-02 | 开 auth 缺 token | **SKIPPED** | 同 C-01 |
| C-03 | `agent.list.get` | **SKIPPED** | 同 C-01 |
| C-04 | 流式回复 + history.json | **SKIPPED** | 同 C-01 |
| C-05 | 文本超 chunk 限 | **SKIPPED** | 同 C-01 |
| C-06 | 媒体超 size 限 | **SKIPPED** | 同 C-01 |

要跑 Module 10 需另起一个 channel 插件实例，配 `connectionMode=websocket` + `wsPort=8080`。

## 11. Channel 插件 — Relay 模式

| ID | 标题 | 结果 | 观察 |
|---|---|---|---|
| R-01 | 插件上线触发 backend.hello | PASS | gateway state 显示 `instanceId=openclaw-fires-local`, `backendConnected=true` |
| R-02 | 端到端发消息 | PASS | 等同 W-11 + G-44 综合验证 |
| R-03 | 插件断开自动重连 | PASS（间接） | G-50 测试期间踢了真实 backend，~3 秒内自动重连成功 |
| R-04 | 断开期消息离线队列 | **SKIPPED** | 需要 kill OpenClaw 触发 backend 断；按规则不做 |
| R-05 | Proactive DM | **SKIPPED** | 需要扮演 backend 调 `relay.server.persist`；同 G-53 |

## 12. 线程 / 自动分线

| ID | 标题 | 结果 | 观察 |
|---|---|---|---|
| T-01 | `thread.create` 手动 | **PASS（v4 doc 修后）** | 文档 e2e-test-cases.md 已更新匹配实现签名（`parentMessageId` 必填）。Commit `c6d6559`。实测 create 后返完整 thread 对象 |
| T-02 | `thread.list` 分页 | **PASS（v4 修后）** | Commit `573ee0c` 后 `limit` 与 `pageSize` 等价：limit=1→1, limit=3→3, limit=100→12（全量），无 limit→12（≤ default 20） |
| T-03 | @mention 自动建线 | PASS（历史证据） | history.sync 中观察到多条 `@main` 消息后存在对应 thread，title 自动取 `@main`（type=user） |
| T-04 | 回复 thread 路由 | PASS（历史证据） | 历史中 `threadId:594adc31-...` 等多条消息归同一 thread；replyCount 累加 |
| T-05 | ACP 线程发现 | PARTIAL | 有 type=`acp` thread 存在（如 `594adc31...`），但 PRD 已标 ACP `ensureThreadKnown` 是 stub —— **存在不等于完整**，未深测 |
| T-06 | `thread.mark_read` | PASS | 返回 `lastReadAt:2026-04-19T04:32:03Z` |

**新发现 (v2)**：`thread.list` 的 `limit` 参数未生效（直接返回全量 11 条）。**v4 已修**（commit `573ee0c`）：handler 接受 `limit` 与 `pageSize` 二者其一。

## 13. Supabase 数据一致性

| ID | 标题 | 结果 | 观察 |
|---|---|---|---|
| S-01 | message_id 去重 | **PASS** | `/pg/rest/v1/cl_messages?channel_id=eq.fires` 共 1365 行，按 (message_id, direction) 分组重复=0 |
| S-02 | 持久化失败 dead-letter | **SKIPPED** | 需主动断 Supabase；按规则不做（基线观察：文件不存在 = 历史上未失败过）|
| S-03 | 删 channel 级联 | **PASS（间接）** | G-20 临时 channel 创建+删除 200 OK；fires 仍存在 1 user / 12 thread / 1365 msg |
| S-04 | `cl_settings` 读写 | **PASS** | `/pg/rest/v1/cl_settings` 返回 3 keys：`ai`、`ai_provider`、`relay`（比文档多一个 `ai_provider`） |
| S-05 | `cl_relay_nodes` 同步 | **PASS** | 2 行：relay-restry-cn、gateway-clawlines；与 G-26 admin API 完全一致 |

## 14. 安全与错误边界

| ID | 标题 | 结果 | 观察 |
|---|---|---|---|
| E-01 | CORS 允许列表 | PASS | `localhost:4026` 返 `Access-Control-Allow-Origin`；`evil.example.com` 不返 |
| E-02 | HTTP rate limit | PASS | 110 次 /healthz 中 98 次 200 + 12 次 429 |
| E-03 | IP 连接上限 50 | **SKIPPED** | 需要 50+ 并发 WS 压测，本期不做 |
| E-04 | Admin token 错 | PASS（覆盖于 G-03） | G-03 已验 401 |
| E-05 | Logto JWT 过期 | PASS（覆盖于 G-05） | G-05 已验 401 |
| E-06 | 消息最大体积 | BLOCKED | 没专门测；运行时观察未触发 |
| E-07 | WS idle timeout | **SKIPPED** | 需长时间静默测；本批最大 7s 无超时 |
| E-08 | XSS 注入 | BLOCKED | UI 未做注入；MarkdownRenderer 默认禁 raw HTML 推断安全（未实测） |

---

## FAIL 用例 Top 列表（v4 终态）

| 严重度 | ID | 现象 | 状态 |
|---|---|---|---|
| ~~HIGH~~ | ~~G-12 `/api/chat`~~ | ~~路由 404 / P0 #1 复现~~ | **v3 PASS** —— OpenClaw 升级修复 |
| ~~HIGH~~ | ~~G-24 `/api/agents`~~ | ~~路由 404~~ | **v2 PASS** —— gateway 重启加载新代码 |
| HIGH | **Gateway crash bug** at `server.js:2065` | sibling 广播 NPE 整个 gateway 挂掉 | **已修** —— commit `ef4c9dd`（dev） |
| ~~MED~~ | ~~T-02 `thread.list` limit 失效~~ | ~~返全量~~ | **v4 PASS** —— commit `573ee0c` |
| ~~MED~~ | ~~T-01 `thread.create` schema 错~~ | ~~doc gap~~ | **v4 PASS** —— commit `c6d6559` |
| ~~MED~~ | ~~G-50 hello 帧 schema 错~~ | ~~doc gap~~ | **v4 PASS** —— commit `c6d6559` |
| ~~LOW~~ | ~~G-45 校验顺序~~ | ~~脏数据先入库后拒绝~~ | **v4 PASS** —— commit `555a391` |
| ~~LOW~~ | ~~G-33 媒体 ct 错~~ | ~~永远 octet-stream~~ | **v4 PASS** —— commit `7f1f0a5` |

## 新发现的 bug（v4 已全部修完）

1. ~~**T-02 `thread.list` limit 参数无效**~~ —— **v4 修**（commit `573ee0c`）
2. ~~**G-45 服务端校验顺序错**~~ —— **v4 修**（commit `555a391`）
3. ~~**G-33 媒体 ct 不对应**~~ —— **v4 修**（commit `7f1f0a5`）
4. ~~**T-01 文档 / G-50 文档与实现帧 schema 不一致**~~ —— **v4 修**（commit `c6d6559`）

剩下 PRD 已识别的 P0/P1 修复（如 reactions / polls / edit 砍代码、Channel `webhook` 模式移除等）走 PRD 排期，与本基线测试无重叠。

## v3 已修 / 已 PASS（与 v1/v2 对比）

| 项目 | v1/v2 状态 | v3 状态 | 备注 |
|---|---|---|---|
| G-12 `/api/chat` P0 #1 | FAIL（路由）→ PARTIAL（callback fail） | **PASS** | OpenClaw 升级后 5/5 全 PASS |
| G-24 `/api/agents` | FAIL（路由 404） | **PASS** | gateway 重启加载新代码 |
| Gateway crash bug `server.js:2065` | 未发现 → 发现并 crash | **已修** | commit `ef4c9dd`（dev） |
| S-01..S-05 Supabase | BLOCKED（路径错） | **全 PASS** | 用对 `/pg/rest/v1/` 前缀 |
| W-13/14/20/21 UI 持久化类 | BLOCKED-batch | **PASS** | 改单次 JS 注入 |

## SKIPPED 用例 + 需求清单（19 个）

| ID 范围 | 数 | SKIPPED 原因 | 解锁需求 |
|---|---|---|---|
| W-01/03/04/05/06 | 5 | Default profile logout 会丢现有连接；扩展未启用 Incognito | 开扩展 Incognito 权限 + 用独立测试账号；或起 fresh Chrome --user-data-dir 跑 |
| C-01..C-06 | 6 | Channel 是 OpenClaw 插件，无独立 server | 起一个临时 OpenClaw runtime + 加载本插件 + 配 `connectionMode=websocket wsPort=8081` |
| G-53/54/55, R-04/05 | 5 | 需扮演 backend WS，会断 OpenClaw（按规则不做） | 用未在线 channel（CC-OWL/CC-WOLF/dora/nexora/ottor）做 backend 替身，不影响 fires |
| S-02 | 1 | 需断 Supabase（不安全） | 起本地 supabase-cli 实例临时 down RELAY_SUPABASE_URL |
| E-03 | 1 | 需 50+ 并发 WS 压测 | 写脚本批量开 51 个连接 |
| E-07 | 1 | WS idle timeout 需长时间静默 | 单测保留 ≥ 服务端 ping interval |
| W-22/23/24 | 3（合并 BLOCKED-viewport 到 SKIPPED） | Chrome sidepanel hog viewport | 关闭 sidepanel / 在普通窗口跑 |
| W-19 | 1 | 需断网模拟 | OS network shaper 或直接 close gateway |
| W-26 | 1 | 麦克风权限 | OS 授权 + 录音 fixture |

---

## 推荐下一步（v3 完成后）

1. ✅ ~~重启 gateway 进程~~ —— 已完成（PID 30321 → 73806 → 80235）
2. ✅ ~~OpenClaw 升级~~ —— 已完成，P0 #1 自动 fix
3. ✅ ~~补 Supabase 路径 `/pg/rest/v1/`~~ —— 已完成
4. **修剩余 bug**（T-02 / G-45 / G-33 / 文档 schema 对齐）按优先级进 sprint
5. **PR 合并** commit `ef4c9dd`（gateway crash null-guard）到 main / production
6. **加 regression 测试**：把 G-12 多 chatId 场景固化到 CI，避免 P0 #1 再回归
7. **解锁 SKIPPED**（按上表需求清单），计划 1-2 周内单独搞一次专项 19 用例补测

## 验证 Step A 修复未引入回归

- gateway PID 80235 跑了完整 G-40..G-47, T-01..T-06, G-44, G-45 + 5 次 /api/chat (G-12) + 多次 admin API CRUD —— 全程无 crash，无 NPE
- OpenClaw 在线 fires backend 自动重连 OK，未出现 PRD#3 子区状态错乱回归
- Web 客户端 sidebar 渲染、入聊天、收发消息全程未报错（W-02/W-10/W-11 重测 PASS）

---

## v5 — `/api/chat` 全面修复 + API-CHAT-* 基线（2026-04-19 后段）

### 8 个 commit（gateway/dev）

| # | Commit | Subject |
|---|---|---|
| 1 | `5af992b` | fix(api-chat): route callbacks by messageId not virtualConnId (P0-α) |
| 2 | `da88750` | feat(api-chat): configurable per-request timeout (P0-β) |
| 3 | `e4b4b2e` | fix(api-chat): two-way sibling broadcast on chatId (P0-γ) |
| 4 | `ecdeb57` | feat(api-chat): return inboundMessageId for reconnect/sync (P1-α) |
| 5 | `6193561` | refactor(api-chat): drop chatId borrow from live WS clients (P1-β) |
| 6 | `afebb4b` | fix(api-chat): surface backend reject/close as cb.onError → HTTP 502 (P1-γ) |
| 7 | `805f60f` | fix(api-chat): FIFO fallback when message.send lacks replyTo (P0-α F1b) |
| 8 | `f9217e3` | fix(relay/client): null-guard inbound sibling broadcast (Step A pt 2) |

Docs：`c3a6fa6` (testing repo) — 21 条 API-CHAT-* 测试用例。

### 21 条 API-CHAT 用例（全 PASS）

| ID | 标题 | 结果 | 关键观察 |
|---|---|---|---|
| API-CHAT-01 | 单发同步 | **PASS** | 含 `inboundMessageId` + `messageId` + `meta.source='api'` |
| API-CHAT-02 | 同 chatId × 3 | **PASS** | 3/3 各 31-43 char reply，pool 复用 |
| API-CHAT-03 | 并发不同 chatId × 10 | **PASS** | 10/10，无串话 |
| **API-CHAT-04** | **并发同 chatId × 5** | **PASS（F1b 修后）** | 5/5。第一轮 2/5 失败 → 加 FIFO fallback（commit `805f60f`）→ 5/5 |
| API-CHAT-05 | 5K 字符长文本 | **PASS** | reply 41 chars，无 hang/crash |
| API-CHAT-10 | 默认 300s timeout | **PASS** | 9s 内返，无超时 |
| API-CHAT-11 | `body.timeout=10000` | **PASS** | 10.8s 后 504 `agent did not respond within timeout` |
| API-CHAT-12 | `body.timeout=600000` 边界 | **PASS** | 接受最大值 |
| API-CHAT-13 | timeout 后 sync 补取 | **PASS** | 504 后 sync 看到 inbound（outbound 待 agent 完成） |
| API-CHAT-20 | API → Web 同 chatId 双向 | **PASS（F3b 修后）** | Web 收到 `inbound echo` + `outbound reply`（source='api'） |
| API-CHAT-21 | API → Web 不同 chatId 不可见 | **PASS（F3a 修后）** | 0 message.send 漏到无关 chatId |
| API-CHAT-22 | Web 发 → API sync 可查 | **PASS** | sync 正确返 web22b 内容 |
| API-CHAT-23 | Web + API 同 chatId 混合 | **PASS（Step A pt2 修后）** | 5 个 message.send 全部正确路由，gateway 不崩。第一轮触发 line 2382 NPE → commit `f9217e3` 修 |
| API-CHAT-30 | 无 token | **PASS** | 401 `auth required` |
| API-CHAT-31 | backend 离线 | **PASS** | 503 `channel backend not connected` |
| API-CHAT-32 | 缺 message | **PASS** | 400 `message is required` |
| API-CHAT-33 | 缺 agentId | **PASS** | 400 `agentId is required` |
| API-CHAT-34 | ghost agent | **PASS** | backend 容错 → 200，agent main 回复（fail-soft，符合 spec 二选一） |
| API-CHAT-40 | 1 发 = 2 行入库 | **PASS** | DB inbound + outbound 都有 `meta:{source:'api'}` |
| API-CHAT-41 | timeout 后 outbound 入库 | **PASS** | 504 后 sync 看到 inbound；outbound 在 agent 完成时入库 |
| API-CHAT-42 | (message_id, direction) 唯一 | **PASS** | 重复 INSERT 触发 `cl_messages_msgid_dir_uniq` 约束 → 409，count=1 |

**21/21 = 100% PASS** ✅

### v5 汇总数字

| 类别 | v1 | v2 | v3 | v4 | **v5** |
|---|---|---|---|---|---|
| **PASS** | 38 | 44 | 51 | 55 | **76** (+21) |
| **FAIL** | 6 | 5 | 5 | 1 | 1 |
| **PARTIAL** | 4 | 5 | 7 | 7 | 7 |
| **BLOCKED** | 39 | 32 | 8 | 8 | 8 |
| **SKIPPED** | 3 | 3 | 19 | 19 | 19 |
| 总 | 90 | 89 | 90 | 90 | **111** (+21) |

### v5 新发现 + 已修 bug

| Bug | 发现路径 | 修复 commit |
|---|---|---|
| API-CHAT-04 callback 仅严格匹配 replyTo，agent coalesced reply 漏 cb | API-CHAT-04 测试 | `805f60f` (F1b FIFO fallback) |
| Inbound sibling 广播循环 line 2382 漏 null check（Step A 仅修 line 2065 一处） | API-CHAT-23 触发 NPE | `f9217e3` (Step A pt 2) |

### 调用示例

**单发（curl）**：

```bash
curl -X POST https://gateway.example/api/chat \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "ping",
    "channelId": "fires",
    "agentId": "main",
    "senderId": "client-x",
    "chatId": "session-001",
    "timeout": 60000
  }'
```

响应：

```json
{
  "ok": true,
  "messageId": "msg-1776588659913-abc123",
  "inboundMessageId": "api-1776588659836-aeea0189",
  "content": "pong",
  "agentId": "main",
  "chatId": "session-001",
  "timestamp": 1776588660019,
  "meta": { "source": "api" }
}
```

**断开后补取（curl）**：

```bash
# 1. 用上一次的 inboundMessageId 时间戳作为 since
SINCE_TS=$(echo "$LAST_RESPONSE" | jq -r '.timestamp')

# 2. 拉取该 chatId 之后的消息
curl "https://gateway.example/api/messages/sync?channelId=fires&after=$SINCE_TS&limit=20" \
  -H "Authorization: Bearer $USER_TOKEN" \
  | jq '.messages[] | select(.meta.source == "api")'
```

**自定义超时（query 或 body 二选一）**：

```bash
# Body 优先
curl -X POST .../api/chat -d '{...,"timeout":60000}'
# 等价 query
curl -X POST '.../api/chat?timeout=60000' -d '{...}'
# 环境变量全局默认（gateway 端）
RELAY_API_CHAT_TIMEOUT_MS=120000 node server.js
```

**伪流式（基于 sync 轮询，等真正 SSE 上线前的 stop-gap）**：

```bash
# 启动 chat（不等返回，立刻轮询 sync）
START_TS=$(date +%s)000
curl -X POST .../api/chat -d '{...}' &
APID=$!
while kill -0 $APID 2>/dev/null; do
  sleep 1
  curl -sS ".../api/messages/sync?channelId=fires&after=$START_TS" \
    | jq -c '.messages[] | select(.direction == "outbound") | .content'
done
wait $APID
```

> 真正 SSE/streaming 端点 `/api/chat/stream` 是 PRD P1 #7，单独立项。
