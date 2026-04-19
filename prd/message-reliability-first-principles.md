# 消息可靠性 · 第一性原理重构计划

> 触发：resley 强制要求按马斯克 5 步算法重做。
> 范围：clawline 消息从「发送」到「呈现/错误」全链路。
> 状态：Phase 1 计划，**只写文档**，等用户拍板后才动代码。

---

## 1. 物理真相（Step 1：让需求变得不蠢）

> **发送的每一条消息，要么最终在接收端可见，要么明确返回错误。不存在「发出去没反应」的静默失败态。任何 ack 过的消息，刷新/重连/重启后必须仍能看到。**

这是唯一的需求。所有派生需求必须能从这一句反推出来才有资格存在。

### 被这一条**取消资格**的需求

| 旧需求 | 取消原因 |
|---|---|
| P0 #1「`/api/chat` 回执丢失修复」 | 派生需求。物理真相是「调用方必须知道结果」，不限于回执；且我们用 6 个 commit 修出 N 个 bug 还不彻底，是修法本身违反第 1 步 |
| P0 #2「sibling broadcast 一致性」 | 派生需求。真相是「订阅者按订阅 contract 收消息」；当前 sibling 广播是因架构错误（API 虚拟连接和真 WS 在同一个 map）才需要的兜底 |
| P1 #9「Per-token quota / rate limit」 | resley 自用，不需要 |
| P1 #10「Health/Metrics + Prometheus」 | 违反第 5 步，自动化最后做 |
| P0 #5「Capabilities reactions/polls/edit 砍代码」 | 与可靠性无关，独立处理 |

剩下真正服务物理真相的工作：**ack 契约 + 持久化时机 + 客户端幂等订阅**。其余全是杂物。

---

## 2. 现状数据结构全景（gateway/server.js）

```
// 真 WebSocket 连接 + API 虚拟连接，混在同一个 Map
clientConnections: Map<connectionId, {
  ws: WebSocket | null,        // ← null 当 isApi=true
  channelId: string,
  chatId: string,
  userId: string,
  isApi?: boolean,             // ← 区分两种语义
}>

// Backend 连接（每 channel 1 个）
backends: Map<channelId, { ws, instanceId, ... }>
backendPresence: Map<channelId, { lastConnectedAt, lastDisconnectedAt }>

// API 请求路由
global._apiCallbacks: Map<messageId, {
  virtualConnId,
  onEvent(evt),                // 决定是否 resolve HTTP request
  onError(err),
}>
global._apiConnPool: Map<virtualConnId, { idleTimer, channelId, chatId, agentId }>

// 各种「我们不知道怎么处理」补丁
pendingAutoThreads: Map<connectionId, [{ threadId, source, msgId }]>
recentlyShifted: Map<connectionId, { threadId, ts }>
lastUserMessageId: Map<connectionId, msgId>
_threadUpdateChain: Map<threadId, Promise>     // 我自己刚加的并发 mutex

// HTTP / WS 配额
httpRateLimits: Map<ip, { tokens, lastRefill }>
connectionsPerIp: Map<ip, count>
```

**消息持久化**：`persistMessageAsync` 写 `cl_messages`，with `(message_id, direction)` UNIQUE 约束。inbound 在 gateway 收到时立即写；outbound 在 backend `relay.server.event` 透传时立即写。

**广播 4 处**：
- `broadcastToChannel`（全 channel）
- 「客户端 → sibling 同 chatId」（`relay.client.event` 处）
- 「backend → client + sibling」（`relay.server.event` 处）
- 「`/api/chat` 入口处主动广播 inbound」

**已贴的 NPE 补丁**：3 处都是因为 API 虚拟连接 ws=null 混进广播循环。

---

## 3. 每个**可删项**

> 每条都按格式：(a) 是什么 (b) 删了最坏会怎样 (c) 结构性还是功能性。

### D1 · `clientConnections` 把 API 虚拟连接和真 WS 客户端混在一起 ✂️

**(a) 是什么**：API 虚拟连接 (ws=null, isApi=true) 与真 WS 客户端 (ws=WebSocket) 共存于同一 Map。一个广播循环要同时跳过 isApi、判 null、判 readyState ——三个 if 才能正确遍历。

**(b) 删了最坏会怎样**：
- 不会有 NPE（`broadcastToChannel` 不再可能碰到 null.ws）
- 3 个 commit 的 null-guard 补丁可以全删（`acfc307` / `0db6f7f` / `e6a0665`）
- API 虚拟连接和真 WS 客户端各自走各自的代码路径 —— **意图清晰**

**(c) 结构性删除**：拆 Map：
```
realClients:    Map<connectionId, { ws: WebSocket, channelId, chatId, userId }>
apiSessions:    Map<sessionId,    { channelId, chatId, agentId, requests: Map<messageId, ResponseHandle> }>
```

API 调用走 `apiSessions`，永远不进 `realClients`。`broadcastToChannel(channelId, event)` 只迭代 `realClients`。无 null check 必要。

---

### D2 · `_apiCallbacks` + `_apiConnPool` 两个 global Map ✂️

**(a) 是什么**：API 请求要 3 个独立 Map 才能跟踪 (callback / pool / clientConnections 中的虚拟条目)。三个 Map 任何一个失同步就出 bug（F1 当时就是改了 callbacks key，没改 pool key，导致 `/api/agents` 静默坏掉 → commit `6d193d8`）。

**(b) 删了最坏会怎样**：
- 三 Map 同步问题彻底消失
- 不再需要 `cb.virtualConnId` 兜底字段
- F1b FIFO fallback、`virtualConnId` stamping、reject/close 时遍历 cb 找 isApi —— **整段全删**

**(c) 结构性删除**：合并到 D1 的 `apiSessions`：
```
apiSessions: Map<sessionId, {
  channelId, chatId, agentId,
  requests: Map<messageId, { resolve, reject, timer, replyEvents }>,
  idleTimer,
  backendOpen: boolean,    // 是否已 send relay.client.open 给 backend
}>
```

每个 session 一条到 backend 的虚拟连接，多个 in-flight HTTP 请求共享 session 但各自独立的 `requests`，按 messageId 路由 reply。

---

### D3 · FIFO fallback 兜底 (commit `805f60f`) ✂️

**(a) 是什么**：agent 偶尔发 `message.send` 不带 `replyTo` 时，把它路由给最老的 pending callback。

**(b) 删了最坏会怎样**：
- 若 backend / agent 发了无 `replyTo` 的 `message.send`：按新协议视为**协议错误**，gateway 直接丢弃 + log。
- HTTP 请求会 timeout 返 504。caller 看到错误，**不是静默失败**——符合物理真相。
- 实际场景里，OpenClaw agent 几乎永远带 `replyTo`（基线测试只在并发同 chatId 5 条时偶发，是 agent 的协议违规）。修 OpenClaw 比在 gateway 兜底更对路。

**(c) 功能性删除**。同时删 `console.log("[api/chat] message.send replyTo=...")` 调试日志（D1+D2 后路由是 trivial 的，不需要 trace）。

---

### D4 · `resolveThreadId` 三层 fallback（channel/reply-dispatcher.ts）✂️

**(a) 是什么**：
1. session binding by sessionKey
2. binding by conversation ref
3. `findThreadIdByChatId`
4. (我加的 TH-1) inbound message 的 threadId 兜底

**(b) 删了最坏会怎样**：
- 协议契约改为：**inbound message.receive 如果发到 thread 内，必须带 `threadId`**。channel plugin 直接用 `inboundThreadId`。
- session binding 那条路径只在 ACP `--thread auto` 自动绑定时需要——把 ACP 的 threadId 注入 message 的 metadata 即可，不再需要绕一圈查 binding。
- 三层缩成一层：`inbound.data.threadId` 必填或必空，二选一。

**(c) 结构性删除**：reply-dispatcher 的 resolveThreadId 函数整段删，调用处直接用 `params.inboundThreadId`。

---

### D5 · `pendingAutoThreads` + `recentlyShifted` + `lastUserMessageId` 三个 in-memory 路由表 ✂️

**(a) 是什么**：用来在 user 发 `@mention` 后，把 agent 的下一条 reply 也路由进自动建的 thread。三个 Map 协作，逻辑约 100 行。

**(b) 删了最坏会怎样**：
- `@mention` 自动建 thread 这个 UX 还在 —— 父消息留主聊天 ✅
- 但 agent 的 reply 不再被「神奇地」塞进 thread。要让 reply 进 thread，**user 必须显式在 thread 内回复**（点 thread → 在 thread input 里说话）。
- 实际是把「magic」改成「显式」。可见行为更可预测，bug 减少。

**(c) 功能性删除**。如果 PRD 强调「@mention reply 自动归子线」是核心 UX，那这条**不删**，保留。但**至少要承认它是补丁，不是必要项**。

---

### D6 · message 在 backend ack 前持久化 ✂️

**(a) 是什么**：`/api/chat` 入口、`relay.client.event` 入口都在 forward backend 之前 `await persistMessageAsync(inbound)`。如果 backend 挂了/没回 message.send，DB 里仍有 inbound 行——「我说了话但他没听见」状态。

**(b) 删了最坏会怎样**：
- 改为：**只在 backend ack 后才入库**。
- inbound 的 ack = backend 在 `relay.server.event` 里至少回 `message.send` 或 `relay.server.persist`。
- 若超时无 ack：HTTP 返 504，DB 无行 ——「我说了话被拒了」状态。caller 重发即可（幂等键 = 调用方决定的 messageId）。
- 物理真相满足：要么有结果，要么有错误。**没有幽灵状态**。
- 唯一代价：DB inbound 时间戳会比真发送晚几百 ms（agent 处理时长），但 created_at vs message_data.timestamp 已经分开，时间戳不混淆。

**(c) 结构性删除** + 重排时序。`persistMessageAsync(inbound)` 调用点从 4 处合并为 1 处（在 ack 收到时）。

---

### D7 · `/api/messages/sync` 接口 + 客户端「断开后补取」契约 ✂️？

**(a) 是什么**：HTTP 客户端 timeout 后用 `?after=ts` 拉补 outbound。Web 客户端启动时也用它 warm cache。

**(b) 删了最坏会怎样**：
- 如果 WS 层面走「服务端缓存最近 N 条 + 客户端在 connection.open 时声明 `lastSeenMessageId`，服务端补发」，**根本不需要 sync REST 接口**。
- 但 Web client 启动时没有 WS 之前的连续会话状态，仍需要冷启动加载历史 → sync 接口仍有用。
- **结论：不删 `/api/messages/sync`**。但删除「HTTP API timeout 后 caller 必须主动补取」这个契约负担——改为 D6 后，HTTP 永远要么成功要么明确失败，无需补取。

**(c) 功能性删除一半**：保留接口（冷启动/Web 历史），删掉「API caller 必须补取」这条响应文档。

---

### D8 · `~/.openclaw/clawline-history.json` 本地文件 ✂️

**(a) 是什么**：channel plugin 在本地 JSON 文件里维护历史副本。Gateway + Supabase 已经是真理之源。

**(b) 删了最坏会怎样**：磁盘 -1 个文件。无功能损失。

**(c) 功能性删除**。PRD 早已决议（决策 #9），但还没真删。

---

### D9 · `_threadUpdateChain` 自定 mutex（commit `0138b49`）✂️？

**(a) 是什么**：我刚加的 per-threadId Promise 链，避免 reply_count race。

**(b) 删了最坏会怎样**：替代方案是在 PostgREST 用 `Prefer: tx=ours` + RPC 函数做 `reply_count = reply_count + 1` 原子自增。但这要改 schema（按规则不让）。
- 删了 mutex 后并发回复 reply_count 偶尔会少 1。**这是 UI 显示瑕疵，不影响消息可靠性**——消息本身在 cl_messages 都 INSERT 成功。
- 物理真相不破：消息可见。reply_count 是辅助元数据。

**(c) 功能性删除**：如果 resley 接受「reply_count 偶尔少 1，刷新会自愈（重算 GROUP BY count）」，则删。否则保留 mutex（已写好，无副作用）。

---

### D10 · `_apiCallbacks` 的 `console.log("[api/chat] message.send replyTo=…")` 调试日志 ✂️

**(a) 是什么**：F1b 时为调试加的 cb HIT/MISS log。

**(b) 删了最坏会怎样**：log 少一行。日志整洁。

**(c) 功能性删除**：D1+D2 之后无调试价值。

---

### D11 · 删除冗余的 sibling 广播路径 ✂️

**(a) 是什么**：当前消息广播分 4 处：
1. `/api/chat` 入口手动 fan-out inbound
2. `relay.client.event` (真 WS 客户端入口) fan-out inbound
3. `relay.server.event` (backend 入口) fan-out outbound
4. `broadcastToChannel`（thread.updated 等广播）

每处都在写「同 channel 同 chatId 的 sibling」迭代逻辑。

**(b) 删了最坏会怎样**：合并成单一 `fanOut(channelId, chatId, event, excludeRealConnId)`，所有调用走同一函数。
- 不需要 4 处各自检 null/isApi/readyState。
- 行数 -50 +10。

**(c) 结构性删除**（合并）。

---

### D12 · 前端：localStorage 双 key 命名空间 (`openclaw.lastRead.*` vs `openclaw.inbox.lastRead.*`)

**(a) 是什么**：ChatRoom 写一组 lastRead key，Inbox 写另一组。同 (conn, agent) 时间戳常常不同步。

**(b) 删了最坏会怎样**：合并为单一 key 命名空间。删一组写入路径。
- 实际是 client-web 的清理，不影响 gateway。
- 数据迁移：app 启动时检测到两组就 max() 合并。

**(c) 结构性删除**（client-web 单文件改动 ~20 行）。

---

## 4. 删完后的数据结构 / 流程

### 4.1 gateway 数据结构

```ts
// 一种连接，一个语义：真 WebSocket。
realClients: Map<connectionId, {
  ws: WebSocket,                         // 永远非 null（disconnect 即从 map 删除）
  channelId, chatId, userId,
  lastSeenMessageId?: string,            // 客户端 hello 时声明，用于补发
}>

// 一种 backend，一个语义。
backends: Map<channelId, { ws: WebSocket, instanceId }>

// 一种 API 调用聚合。
apiSessions: Map<sessionId, {
  channelId, chatId, agentId, userId,
  backendConnOpened: boolean,
  requests: Map<messageId, {
    resolve, reject, timer,
    deadlineAt: ts,
  }>,
  idleAt: ts | null,
}>

// （删了：_apiCallbacks, _apiConnPool, pendingAutoThreads, recentlyShifted,
//        lastUserMessageId, _threadUpdateChain）
```

### 4.2 inbound 消息流（client → backend → ack → 持久化）

```
client → gateway: relay.client.event { messageId, content, ... }
  ↓ (validate; reject if missing required fields — early return error frame)
gateway → backend: relay.client.event (forward as-is)
  ↓ (start ack timer = 300s default, configurable per request)
backend → gateway: relay.server.event { type: message.send, replyTo: messageId, ... }
  ↓ persistMessageAsync(inbound)   ← only here
  ↓ persistMessageAsync(outbound)
  ↓ fanOut(channelId, chatId, outbound)   ← single broadcast func
  ↓ if request originated from /api/chat: resolve HTTP via apiSessions[sid].requests[messageId]
  ↓ if from real WS client: send to that ws (already in fanOut)
```

时间窗口内若无 ack：
- `relay.server.reject` → DB 不写 + 调用方收 502/error
- timeout → DB 不写 + 调用方收 504

### 4.3 单一 fanOut 函数

```js
function fanOut(channelId, chatId, event, excludeConnectionId) {
  // realClients 里只有真 ws 连接，construction-time 保证。无 null check。
  for (const [id, c] of realClients) {
    if (id === excludeConnectionId) continue;
    if (c.channelId !== channelId) continue;
    if (c.chatId !== chatId) continue;
    if (c.ws.readyState !== WebSocket.OPEN) continue;  // 唯一防御性检查
    sendJson(c.ws, event);
  }
}
```

API session **不参与** fanOut（按构造排除）。HTTP 调用方通过 `apiSessions[sid].requests[messageId].resolve` 拿到结果，是同一事件的另一种递送方式。

---

## 5. Step 3 简化：删完后还能合并的路径

| 路径 | 合并方向 |
|---|---|
| 4 处 sibling 广播 | → `fanOut()` 单函数 |
| 持久化 4 处入口 | → `persistOnAck()` 单函数（只在 ack 时调） |
| API 入口 vs WS 入口的 inbound 处理 | → 共用同一 `processInbound(channelId, chatId, agentId, message)` 函数；区别仅在 source meta + 谁拿 reply（`Promise<reply>` vs `sendJson`） |
| `relay.server.{reject,close}` 对 isApi 的特殊处理 | → 直接看 `apiSessions[sid]`，不再混进 `clientConnections` 遍历 |
| `_apiConnPool` 的 idleTimer | → `apiSessions[sid].idleAt`，单一定时回收 |

减行估计：**-300 / +120 = 净减 ~180 行**，去掉 ~6 个补丁的复杂度。

---

## 6. Step 4 加速周期

当前回归一轮 ~5 小时（手工 + 等 OpenClaw + 等 agent 回复）。可加速点：

1. **冷启动一条命令**：`make dev-reset` → kill+restart gateway+OpenClaw+web，30s 内全 ready。当前要手工 4-5 步。
2. **集成测试一条命令**：把 ws-probe.js / curl 矩阵打包成 `make test-reliability`，单条命令跑完 21 个 API-CHAT-* + 22 THREAD-* + 7 MA-*，输出表格。当前要手敲 50+ 条 curl。
3. **真实 backend 替身**：写一个 100 行的 `mock-backend.js`（直接 ws 接 /backend，按 hello → ack → echo 协议），不依赖 OpenClaw。CI 能跑。当前 OpenClaw 启动 ~30s + agent 回复 5-15s/次。

→ 单次回归从 5 h 降到 5 min。**这本身就是物理真相验证的频率提升**。

---

## 7. Step 5 监控（删简后才加）

剩下的关键点 **只有 3 个**：

1. **inbound ack 超时数 / channel**：超时 = 物理真相违反。重要。
2. **persist failure 数**（Supabase POST 非 2xx）：重要。
3. **fanOut send error 数**（ws.send 抛异常）：低，但有就是 bug。

**不要监控**：连接数、agent.list 频次、cb HIT/MISS、reply_count 一致性、cache 大小……都是噪音。

---

## 8. 新的测试策略

不是加更多用例，而是从真相反推**最小必要用例集**。物理真相是「无静默失败」，所以测试只需要证明：

### 必要测试（5 条）

| ID | 物理真相验证 |
|---|---|
| **REL-01** | 单条 inbound：调用方收 ack（reply 可见）+ DB 行存在。否则收 error。**永远不存在「成功 + DB 无行」或「失败 + DB 有行」组合**。|
| **REL-02** | 100 条并发同 channel：所有 ack 调用方都拿到对应的 reply（按 messageId 配对）；超时调用方拿到 error。**总数 ack + total error = 100，无幽灵**。|
| **REL-03** | 反复 kill backend 5 次：前 N 条 ack 的消息在 DB；后 M 条收 502；任何刷新/重连后能看到前 N 条历史。**重启不丢已 ack**。|
| **REL-04** | 客户端 disconnect 后服务器仍发 outbound：客户端重连声明 lastSeenMessageId，服务器补发缺失的 message.send。**至少一次送达**。|
| **REL-05** | 客户端发同一 messageId 两次：第二次返回 idempotent 200 + 同一 reply（如已 cached），DB 不重复行。**幂等**。|

5 条覆盖物理真相的全部边界。其他 161 个用例可以保留作为回归网，但**真相验证只需要这 5 条**。

### 不再需要的测试

- API-CHAT 那 21 条里很多是「同 chatId × 5 并发分别成功」「fresh chatId vs known chatId」「sibling Web 收到 outbound」—— 都是 D1+D6 后**自动满足**的派生属性。
- THREAD-* 22 条同理。

---

## 9. 迁移风险

| 风险 | 处理 |
|---|---|
| **D6 持久化时机改变** | 现存历史消息不影响（已写的不动）。新机制只影响新消息。短暂 dev 窗口运行时若 backend 故障，会有「客户端发了消息但 DB 没记录」的情况——这是**物理真相想要的**结果（已显式失败）。 |
| **D1 拆 Map** | 现存连接在重启时全部重连，自然落到新 Map。无数据迁移。 |
| **D2 删 _apiCallbacks/_apiConnPool** | 现 in-flight HTTP 请求会随重启失败一次，正常用户重试即可。 |
| **D5 删自动分线 magic** | UX 退化：@mention 后 agent 回复不会自动归子线。**用户必须先点 thread 再回复**。这是显式 vs 隐式的取舍——按物理真相支持「显式」。需要 resley 决策。 |
| **D7 删「caller 必须补取」契约** | 文档变更。第三方集成方需要更新调用代码（如果有）—— resley 自用，影响 ≈ 0。 |
| **D8 删 history.json** | 内部无依赖（已确认）。直接删。 |
| **D9 删 _threadUpdateChain** | 并发回复 reply_count 偶尔少 1。前端 GROUP BY 重算会自愈。 |
| **D12 合并 lastRead key** | 客户端启动 migrate：max(inboxKey, chatKey) 写入新位置，删两旧 key。一次性。 |

---

## 10. 改动量预估（如批准）

| 阶段 | 文件 | 行数 |
|---|---|---|
| Phase 2A | gateway/server.js | -300 / +120 (D1, D2, D11) |
| Phase 2B | gateway/server.js | -50 / +30 (D3, D6, D7) |
| Phase 2C | channel/reply-dispatcher.ts | -40 / +5 (D4) |
| Phase 2D | channel/* | -? (D8 history.json) |
| Phase 2E | client-web/threadStore + agentInbox | -30 / +20 (D12) |
| Phase 2F | docs + 新 5 条 REL-* 测试 | docs only |

**~80% 是删除**。10% add-back 检查（步骤 2 要求）：D1 拆出的 `apiSessions` 是 +50 行新结构，是合理的「至少 10% 加回」。其余 D2-D12 几乎纯删。

---

## 11. 我会做的 vs 不会做的

**会做**：
- 拆 Map、合并广播、ack 后持久化、删兜底、删冗余 in-memory 路由表、删 history.json
- 写 5 条 REL-* 测试
- `make dev-reset` 一键脚本

**不会做（按 5 步算法红牌）**：
- 加 retry / 加 fallback / 加 monitoring / 加 quota
- 在删之前优化任何东西
- 改 Supabase schema（约束）

---

## 12. 等待批准

这是 Step 1+Step 2 的诊断 + 删除清单。**没有动一行代码**。

请回复：
- 「**全砍**」：D1..D12 全部按计划执行（D5 / D7 / D9 / D12 含 UX 取舍，需先确认）
- 「**部分砍 + 列表**」：指定哪些 D 项保留
- 「**先看真相反推的测试**」：先写 REL-01..05 跑一遍当前代码，看它们 pass 还是 fail，再决定动哪些
- 「**调整需求**」：如果对物理真相的描述不准，请改

特别需要决策的 3 个 UX 取舍（涉及非纯技术的 trade-off）：
- **D5**：删 `pendingAutoThreads`（@mention 后 reply 不再自动归子线，需用户显式点 thread 再回） — 砍还是留？
- **D9**：删 mutex（reply_count 偶尔少 1，刷新自愈） — 砍还是留？
- **D12**：合并 lastRead key（一次性 client-side migration） — 砍还是留？
