# `/api/chat` 修复计划 · 诊断报告

> 触发：用户用 `/api/chat` 接 Claude Code 等程序客户端，反映"有时回有时不回、有时保存不下来"。
> 范围：本轮只动 `/api/chat` + 相关 sibling broadcast / 持久化路径。其他 P0/P1 暂停。
> 当前基线：v4，G-12 单发 PASS。

---

## 1. 当前 `/api/chat` 架构（文字图）

```
HTTP POST /api/chat
  body: { message, channelId, agentId, senderId?, chatId?, senderName? }
  auth: Bearer token (admin or channel-user) via requireAuthAny()
        │
        ▼
┌────────────────────────────────────────────────────────────┐
│ 1. parse + 校验 (message/channelId/agentId 必填)            │
│ 2. backend = backends.get(channelId)，没在线 → 503          │
│ 3. virtualConnId = `api-${channelId}-${chatId}` (KEY 单一!) │
└────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────┐
│ 4. 构造 inboundEvent (message.receive, meta.source='api')   │
│ 5. await persistMessageAsync(inbound) ← 同步等待写库         │
│ 6. for-each clientConnections on this CHANNEL：             │
│       sendJson(conn.ws, message.send echo:true direction:"inbound") │
│    ⚠️ 不按 chatId 过滤 — 整个 channel 所有 client 都收到      │
└────────────────────────────────────────────────────────────┘
        │
        ▼
┌────────────────────────────────────────────────────────────┐
│ 7. 注册 callback：global._apiCallbacks.set(virtualConnId, …)│
│    onEvent(evt) → push to replyEvents；message.send 时 resolve│
│    ⚠️ KEY 是 virtualConnId — 同一 (channel,chat) 并发会覆盖   │
│ 8. setTimeout(rejectReply, 120_000) ← 写死 2 分钟            │
│ 9. isNewConn → clientConnections.set(virtualConnId,         │
│       {ws:null, isApi:true})                                │
│       sendJson(backend.ws, relay.client.open ...)           │
│       await sleep(50)                                       │
│ 10. sendJson(backend.ws, relay.client.event with inbound)   │
│ 11. await replyPromise                                      │
└────────────────────────────────────────────────────────────┘
        │ ┌── backend 异步处理 ──┐
        │ │ agent thinks         │
        │ │ relay.server.event   │
        │ │ {connectionId,event} │
        │ ▼                      │
┌────────────────────────────────────────────────────────────┐
│ relay.server.event handler (backend → relay)                │
│   client = clientConnections.get(connectionId)              │
│   if !client → persist outbound (null userId), return       │
│   if client.isApi:                                          │
│     persist outbound (meta.source='api')                    │
│     cb = _apiCallbacks.get(connectionId)                    │
│     if (cb) cb.onEvent(apiEvent)  ← cb 没了就丢             │
│     return                        ← ⚠️ 不做 sibling 广播     │
│   else (real ws): sendJson(client.ws, event); 然后 sibling 广播 │
└────────────────────────────────────────────────────────────┘
        │
        ▼ (replyPromise resolves on message.send)
┌────────────────────────────────────────────────────────────┐
│ 12. finally:                                                │
│     _apiCallbacks.delete(virtualConnId)                     │
│     设 5 min idle timer：到期 close virtual connection      │
│ 13. extract finalEvt = replyEvts.find(message.send)         │
│ 14. writeJson 200 { ok:true, messageId, content, agentId,   │
│                     chatId, timestamp, meta:{source:'api'}} │
│     timeout → 504, exception → 500                          │
└────────────────────────────────────────────────────────────┘
```

**持久化时机**：
- inbound：HTTP 入口处同步写（步骤 5），早于 backend 收到
- outbound：backend 发 `relay.server.event` 时写（line 2007），早于回到 HTTP caller

**Sibling broadcast 现状**：
- API inbound：广播给同 channel 所有 client（**不按 chatId 过滤** — bug）
- API outbound：**完全不广播给真实 WS client**，只走 callback（PRD #2 缺口）
- 真实 WS inbound：广播给同 (channel, chatId) sibling（自 Step A 修复后正确）
- 真实 WS outbound：同上正确

---

## 2. 问题清单（按严重度排序）

### **P0-α 并发覆盖（HIGH，当前会丢回执）**

`virtualConnId = api-${channelId}-${chatId}` 在 `_apiCallbacks` Map 里是**单 key**。同一 (channel, chat) 并发两条 HTTP 请求：

```
T0 req-A 注册 cb-A，等回复
T1 req-B 注册 cb-B，覆盖 cb-A
T2 backend 回 message.send
T3 cb-B 被调用 → req-B resolve（拿到 A 或 A+B 混叠的 reply）
T4 req-A 永远 hang，至 120s 超时返 504
```

用户口述"有时回有时不回"100% 复现路径。改用 `messageId` 作为 callback 路由 key 即可。

### **P0-β 超时写死 120s 不可配（HIGH，慢模型超时返 504）**

`const TIMEOUT_MS = 120_000;` Claude Opus 跑工具链可能 3-5 分钟。caller 想拉长得改源码。

### **P0-γ Sibling broadcast 不一致（MED-HIGH，符合 PRD #2）**

两个方向都错：
- **API inbound 广播太宽**：line 2995 不过滤 chatId，所有同 channel client 收到（误广播给无关聊天）
- **API outbound 不广播**：line 2001-2010 `client.isApi` 分支 `return`，没有 sibling fan-out。Web 客户端在同一 chatId 上看不到 API 触发的 agent 回复

### **P1-α 断开后无补取约定（MED，PRD P0 #1 第三条）**

如果 HTTP 断了：
- inbound 已入库 ✅
- outbound 在 backend 回包时入库 ✅（line 2007 同步等待）
- 但 caller 不知道有没有保存、保存了哪个 messageId

需要：
- 让 caller 提供请求级 `requestId`（或返 `messageId`），断开后用 `/api/messages/sync?chatId=X&since=T` 拉

### **P1-β chatId 借用逻辑（LOW-MED，footgun）**

line 2924-2933：调用方不传 chatId 时"借用第一个真实 WS client 的 chatId"，导致两个独立 API caller 的消息可能落到陌生人的 chatId。建议默认 fallback 直接用 `senderId`，删除借用。

### **P1-γ inbound 在 backend 收到前已持久化（LOW）**

如果 backend 拒收（rate limit / agent 离线），DB 有 inbound 没 outbound。当前可接受（用户能看到自己发了什么），但建议 outbound 失败时给一个 `meta.failed: true` 标记。

### **P2 杂项（LOW，可选）**

- `_apiCallbacks` 可能积累（每次注册都覆盖前者，没有显式删除路径）
- `_apiConnPool` 同上
- callback 超时后 timer 已 clear，但若 backend 恰好同时回包，会触发 cb 但 promise 已 reject → 静默丢
- `text.delta`/`thinking.*` 事件被收集但不计入 reply（OK，因为 finalEvt 只取 message.send）

---

## 3. 修复方案 + 改动量

| # | 问题 | 方案 | 文件 | 估计行数 |
|---|---|---|---|---|
| F1 | P0-α 并发覆盖 | callback key 改为 `messageId`（每请求唯一），`_apiCallbacks` 改成 `Map<messageId, cb>`；backend 回包时通过 `replyTo`（OpenClaw 已经填）找 cb；virtualConnId 仍按 (channel,chat) 用于 backend 路由不变 | `gateway/server.js` 路由+/api/chat | +30 / -10 |
| F2 | P0-β 超时不可配 | `TIMEOUT_MS` 读 (a) `body.timeoutMs` (b) `RELAY_API_CHAT_TIMEOUT_MS` env (c) 默认 120000；clamp 5s..600s | 同上 | +8 |
| F3a | P0-γ inbound 广播过宽 | 加 `conn.chatId === chatId` 过滤 | line 2995-2999 | +2 |
| F3b | P0-γ outbound 不广播 sibling | `client.isApi` 分支额外做 sibling fan-out（按 chat 过滤；exclude API 自身） | line 2001-2010 | +12 |
| F4 | P1-α 补取约定 | response 加 `messageId`（已有，确认入库一致）+ 文档明确"断了用 /api/messages/sync?since=ts 取" | server.js + docs | +3 + 文档 |
| F5 | P1-β chatId 借用 footgun | 默认 fallback 直接 = `senderId`，移除借用真实 client chatId 的循环 | line 2924-2933 | -10 / +2 |
| F6 | P1-γ outbound 失败标记 | backend 回 `relay.server.reject` 时给 callback 触发一个 outbound-failed event，HTTP 返 502/504 + `error: 'agent-rejected'` | line 2079 区域 | +10 |
| F7 | P2 callback 内存清理 | 改用 messageId key 后无残留；冗余 sweep on idle timer | 已包含在 F1 | +0 |

**代码总改动**：约 **+65 行 / -20 行**，集中在 `server.js` 单文件。无 schema 改动。

---

## 4. 测试用例（写入 `docs/testing/e2e-test-cases.md` 新增 `API-CHAT-*` 组）

### 基本（5 条）
- `API-CHAT-01` 单发同步：发 ping，120s 内返 reply，DB inbound+outbound 各一行
- `API-CHAT-02` 同 chatId 复用：连发 3 条同 chatId，各自正确回执，无串话
- `API-CHAT-03` 并发不同 chatId 10 条：全 PASS（≥9/10），无串话
- `API-CHAT-04` **并发同 chatId 5 条**：每条 reply 应正确按 `replyTo` 路由回各自 caller（覆盖 P0-α）
- `API-CHAT-05` 长文本（10K chars）：切分/不切分均不丢

### 超时（4 条）
- `API-CHAT-10` 默认超时 120s：构造慢回复（不易，可 mock；或断 backend 让 timeout）
- `API-CHAT-11` `body.timeoutMs=10000`：10s 超时返 504
- `API-CHAT-12` `body.timeoutMs=300000`：拉长到 5 min
- `API-CHAT-13` HTTP caller 超时后查 `/api/messages/sync?after=T`：能拿到入库的 inbound + outbound

### Sibling broadcast（4 条）
- `API-CHAT-20` API 发 → Web 同 chatId 收到 inbound echo + outbound reply
- `API-CHAT-21` API 发 → Web 不同 chatId **不**收到（覆盖 F3a）
- `API-CHAT-22` Web 发 → API 立刻调 `/api/messages/sync` 能查到
- `API-CHAT-23` 同时 Web 和 API 在同 chatId 各发各的：互不干扰

### 错误（5 条）
- `API-CHAT-30` 无 token → 401
- `API-CHAT-31` 错 channelId → 503 (`channel backend not connected`)
- `API-CHAT-32` 缺 message → 400
- `API-CHAT-33` 缺 agentId → 400
- `API-CHAT-34` backend 在线但 agent 不存在：等 timeout 或返某错（待源码确认实际行为）

### 持久化（3 条）
- `API-CHAT-40` 发 1 条后查 cl_messages：inbound 1 行 (direction='inbound', meta.source='api')，outbound 1 行 (direction='outbound', meta.source='api')，message_id 配对
- `API-CHAT-41` HTTP timeout 但 backend 已回包：DB 仍有 outbound（caller 能用 sync 拉到）
- `API-CHAT-42` 重复发同 messageId：只有 1 行（去重生效）

**总用例**：**21 条**。

---

## 5. 工作量估计

| 阶段 | 时间 |
|---|---|
| 写代码 + 4 个 commit | 60-90 min |
| 验证（21 用例 + 回归 G-12） | 60-90 min |
| 修迭代（保守预留 1-2 轮） | 30-60 min |
| 写测试用例文档 + 基线 v5 | 30 min |
| **合计** | **3-4 小时** |

---

## 6. 不在本次范围

- 不改 Supabase schema
- 不动 OpenClaw 核心进程（重启 relay-gateway 没事）
- 不做 SSE streaming（PRD P1 #7，单独立项）
- 不改 dmPolicy / agent 决策侧
- 不动现有 reactions/polls/edit 清理（PRD 别的 sprint）

---

## 7. 风险点

1. **F1 改 callback key 为 messageId** 需要 backend 回包带 `replyTo: <inbound messageId>`。OpenClaw 实际回包样本（基线 v3 抓到）：

   ```json
   {"type":"message.send","data":{"messageId":"msg-...","replyTo":"api-...","content":"pong 🍟 api ✅","agentId":"main"}}
   ```

   `replyTo` 字段存在 ✅。但 `text.delta` 等流式事件没有 `replyTo`，仅 message.send 有。流式中间事件按 connectionId 路由仍走旧逻辑（不影响 cb 路由）。

2. **F3b sibling fan-out for API outbound** 有可能让 Web 客户端收到双份消息：原 backend 已经 sendJson 给 client.ws（在 isApi 分支以外的 else 路径），但 isApi 分支 return 后没走 else。需要小心代码结构，确保 API 路径**只**给 sibling 真实 client 推送，不要触发 isApi self-broadcast（防 Step A 修过的崩溃路径回归）。

3. **并发测试 API-CHAT-04** 需要 5 条同 chatId 同时发，agent 一定按发送顺序处理还是乱序？OpenClaw 行为待实测决定预期。如果 agent 是同 chatId 串行处理，5 条会排队，每条都各自有正确 replyTo 即可。

---

## 等批准

按本计划开干请回复"开始"。如果对优先级、范围、测试用例数有调整也请说。
