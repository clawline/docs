# 子区（Thread）端到端修复计划 · 诊断报告

> 触发：用户原话"子区实现了一半，功能不正常，需深入测试"。
> 范围：channel + gateway + client-web 三仓库的 thread 链路。
> 当前状态：基线 v6 验证 thread.create/list/mark_read 单点 PASS，但端到端使用还有缺口。

---

## 0. PRD 旧假设勘误

诊断后发现**两条 PRD 说法与实现不符**，写在最前面避免混淆：

| PRD 旧说法 | 实际情况 |
|---|---|
| ACP `ensureThreadKnown` 是 stub | **完全实现**（`gateway/server.js:1305-1337`）：fetch DB → 检测 parentMessageId 格式 → 修复 → broadcast `thread.updated` |
| `thread.updated` 广播缺失 | **5 处已正确广播**（create/update/delete/new-reply/auto-create/ensure-known）；**1 处遗漏**（mark_read） |

修计划要按真实代码状态调整。

---

## 1. 用户视角功能清单

按典型使用流程列，标注现状：

| # | 功能 | 状态 | 证据 / 备注 |
|---|---|---|---|
| F1 | 主聊天里点某条消息 → "开 thread" | ✅ | `MessageItem.tsx:42` MessageSquarePlus 按钮 → `useThreadStore.openThread` |
| F2 | 命名 thread（标题） | ✅ | `ChatRoom.tsx:1756-1761` 创建对话框 |
| F3 | 在 thread 内多轮发消息 | ✅ | `threadStore.ts:226-262` `sendThreadMessage` 带 `threadId` |
| F4 | Agent 回复落进同 thread（保持上下文） | ⚠️ | `reply-dispatcher.ts:32-61` resolveThreadId 三层 fallback；**任一层未命中即 silently undefined → 落主聊天**。这条是用户说"不正常"最可能的根 |
| F5 | thread 列表面板（All / Mine / Unread / Archived 标签） | ✅ | `ThreadListView.tsx:132-146` |
| F6 | thread 内未读 badge + new-reply 实时弹 | ✅ | `threadStore.ts:467-685` 订阅 `thread.updated` / `thread.new_reply`，不在 thread 内时增加 unread |
| F7 | 切换不同 thread（list ↔ detail） | ✅ | `ThreadPanel.tsx:722-731` back 按钮 |
| F8 | thread 搜索 | ⚠️ | `threadStore.ts:344-356` 搜索请求无 status 过滤 → archived/locked 也出现 |
| F9 | thread 归档 / 锁 / 删除 | ✅ | `ThreadPanel.tsx:322-441` |
| F10 | thread.mark_read 跨设备同步 | ⚠️ | `gateway/server.js:963-1017` upsert read_status **不广播** → 设备 A 已读，设备 B unread badge 不更新 |
| F11 | thread 跨设备消息同步 | ✅ | thread.updated + thread.new_reply 广播链路完整 |
| F12 | ACP `/acp spawn ... --thread auto` 自动建 thread | ⚠️ | OpenClaw SDK 创建 binding → `session-bindings.ts:194-200` registerAcpThread；**Supabase 未配则 silent fail**，binding 还在但 cl_threads 表无元数据 → thread list 看不到、未读不准 |
| F13 | @mention 自动建子线 | ✅ | `gateway/server.js:2358-2375` 检测 → autoCreateThread → broadcast |
| F14 | delegate-* messageId 模式自动建子线 | ✅ | `gateway/server.js:2053-2061` |
| F15 | reply 路由（thread 内回复 → AI 落同 thread） | ✅ | `gateway/server.js:2343-2356` pendingPush + 上线时注入 threadId |
| F16 | **第三方 API（/api/chat）发到指定 thread** | ❌ | `gateway/server.js:2906-3110` `/api/chat` body **没有 threadId 参数**；inbound event 也不带 threadId 字段 |
| F17 | thread 持久化 reply_count 与 last_reply_at 准确 | ⚠️ | `updateThreadOnNewReply` SELECT-then-PATCH **非原子**（无 UPSERT/RPC），并发 reply 可能漏计 |
| F18 | thread 内乐观渲染消息顺序 | ⚠️ | `threadStore.ts:_appendMessage` 无 timestamp 排序 → 乱序 race |
| F19 | thread 与主聊天的分流规则（哪些消息进 thread、哪些进主） | ✅ | parent message 留主聊天 / 子消息带 threadId |
| F20 | thread.list `limit` 参数 | ✅ | v4 commit `dcf4d10` 已修 |

**汇总**：20 项功能中 **12 ✅ + 7 ⚠️ + 1 ❌**。0 个完全未做（架构齐全），但有 7 个边界问题 + 1 个核心缺口（API Chat × Thread）。

---

## 2. 端到端链路追踪

### 链路 A：用户在 Web UI 开 thread → agent 回复落进 thread

```
1. Web: MessageItem 上 hover 显示 "MessageSquarePlus" 按钮
   - MessageItem.tsx:42

2. Web: 弹对话框，用户填 title 确认
   - ChatRoom.tsx:1756-1761
   - 调 useThreadStore.openThread()

3. Web → Gateway: WS frame {type:"thread.create", data:{parentMessageId, title, requestId}}
   - threadStore.ts:147-159

4. Gateway handleThreadCreate
   - server.js:461 → INSERT cl_threads
   - 521: broadcast {type:"thread.updated", data:{thread}} 给同 channel 全部 client ✅
   - 响应 Web 调用方 thread.create with full thread object ✅

5. Web 收到响应：openThread 成功，进 thread 面板，订阅 thread.updated/new_reply

6. 用户在 thread 内输入 → ThreadInput.handleSend
   - threadStore.ts:226-262

7. Web → Gateway: WS frame {type:"message.receive", data:{messageId, threadId:<thread-id>, content, ...}}

8. Gateway 处理
   - server.js:2344 检测 threadId → pendingPush(connectionId, threadId, msgId, 'reply')
   - 持久化 inbound（带 threadId）✅
   - 转发给 backend (channel)
   
9. Channel (OpenClaw plugin)
   - bot.ts 收 message.receive，构造 ChannelThreadingContext { MessageThreadId: threadId }
   - threading.ts:buildToolContext / resolveAutoThreadId 提取 currentThreadTs ✅
   - 派发给 agent

10. Agent 回复 → reply-dispatcher.ts:deliver()
    - resolveThreadId() 三层查找：sessionKey → conversationRef → findThreadIdByChatId
    - ⚠️ **如果三层都 miss**（如 session 没绑、chatId 没缓存）→ undefined
    - sendMessageGeneric({...threadId})

11. Channel send.ts:176-186
    - if (threadId) outboundMessage.threadId = threadId
    - ⚠️ undefined 时不带字段 → message.send 没 threadId → gateway 把它当主聊天消息

12. Channel → Gateway: relay.server.event { event:{type:"message.send", data:{...threadId?}} }

13. Gateway server.js:2007 持久化 outbound（threadId 字段决定 thread_id 列）
    - 如果 threadId 在 → cl_messages.thread_id 写入 ✅
    - 如果丢了 → cl_messages.thread_id NULL → Web UI 看不到这条 reply 在 thread 里 ❌

14. updateThreadOnNewReply (server.js:430)
    - SELECT current reply_count → +1 → PATCH (race condition)
    - broadcast {type:"thread.new_reply", ...} ✅

15. Web 端订阅
    - 收 thread.new_reply → 加到 threadMessages，更新 unread badge ✅
```

**关键风险点**：第 10-11 步，reply-dispatcher 失败 → 用户看到 "为什么我在 thread 内问的问题，agent 回的消息跑到主聊天去了？"

### 链路 B：第三方 API 调 /api/chat 想发到指定 thread

```
HTTP POST /api/chat
  body: { message, channelId, agentId, chatId, threadId? }
                                              ^^^^^^^^^^
                                              ❌ 当前实现完全不读这个字段

Gateway server.js:2906-3110
  - 解析 body：只读 message/channelId/agentId/senderId/chatId/senderName/timeout
  - inboundEvent (line 3042) 构造时没 threadId
  
→ backend 收到无 threadId 的消息
→ agent 当主聊天消息处理
→ reply 当然也没 threadId
→ 第三方根本无法把消息发到 thread
```

**结论**：F16 完全缺失。

---

## 3. Bug 清单（按严重度）

### **P0 / HIGH（用户最直接感受到）**

| ID | 描述 | 严重 |
|---|---|---|
| **TH-1** | `reply-dispatcher.resolveThreadId()` silently undefined → agent 在 thread 内的回复有时丢 threadId 跑到主聊天 | HIGH（用户原话"功能不正常" #1 嫌疑） |
| **TH-2** | `/api/chat` 完全不支持 `threadId` 参数 → 第三方 API 无法发到 thread | HIGH（PRD F16 缺口，影响 Inbox 等下游） |

### **P1 / MED**

| ID | 描述 | 严重 |
|---|---|---|
| **TH-3** | `thread.mark_read` upsert 后**不广播 thread.updated** → 多设备已读不同步 | MED |
| **TH-4** | ACP 自动建 thread：`session-bindings.ts:registerAcpThread` 在 Supabase 未配/失败时 silent fail，binding 在内存但 cl_threads 表无元数据 → thread list 显示不全、未读计数错 | MED |
| **TH-5** | `updateThreadOnNewReply` SELECT + PATCH 非原子 → 并发回复 reply_count 漏计 | MED（数据准确性） |

### **P2 / LOW**

| ID | 描述 | 严重 |
|---|---|---|
| **TH-6** | `thread.search` 不按 status 过滤 → archived/locked thread 出现在搜索结果 | LOW |
| **TH-7** | `threadStore._appendMessage` 无排序保证，乐观消息 + 网络消息可能乱序闪一下 | LOW |
| **TH-8** | thread.search WS 路径未文档化（PRD 协议契约缺口的一部分） | LOW |

---

## 4. 修复方案

| Bug | Root cause | 方案 | 文件 | 估行 |
|---|---|---|---|---|
| **TH-1** | resolveThreadId 失败时 reply-dispatcher 不知道，silently 跳过 threadId | (a) resolveThreadId 失败时 log warning；(b) 加新 fallback：从 inbound message 的 chatId+pendingPush 队列里取上一条用户消息的 threadId（gateway 已有 pendingPush 机制，可在 channel 侧靠相同思路）；(c) **更彻底的修法**：channel 侧 `ChannelThreadingContext.MessageThreadId` 是带进来的 inbound threadId —— reply-dispatcher 应该 **直接用** 它 fallback，而不是只依赖 session binding | `channel/src/generic/reply-dispatcher.ts:32-61` | +20 |
| **TH-2** | `/api/chat` 没 threadId 字段 | 加 `threadId` 可选 body 参数；inboundEvent 带上 threadId；callback 用 messageId routing（已 OK） | `gateway/server.js:2906-3110` | +5 |
| **TH-3** | mark_read 不广播 | 在 upsert 后加 `broadcastToChannel(channelId, {type:'thread.updated', data:{thread, readBy:userId}})` | `gateway/server.js:963-1017` | +5 |
| **TH-4** | ACP register silent fail | (a) Supabase 失败时 console.error；(b) 加重试 / dead-letter；(c) 文档明确 "ACP 强依赖 cl_threads，必须配 RELAY_SUPABASE_*" | `channel/src/generic/session-bindings.ts:43-84` + docs | +15 + docs |
| **TH-5** | reply_count race | 用 PostgREST RPC 或 SQL `UPDATE cl_threads SET reply_count = reply_count + 1, last_reply_at = ... WHERE id = ?` 直接原子自增（不预 SELECT） | `gateway/server.js:430 (updateThreadOnNewReply)` | +10 / -15 |
| **TH-6** | search 不过滤 status | 在 thread.search handler 加 `.in.status` 过滤（默认排除 deleted/archived） | `gateway/server.js:1023-1092` | +3 |
| **TH-7** | _appendMessage 无排序 | 插入后按 `timestamp` 排序，去重按 `messageId` | `client-web/src/services/threadStore.ts:433-441` | +5 |
| **TH-8** | thread.* 文档缺 | 在 e2e-test-cases.md 和 docs/gateway/api.md 补完整 7 个 thread.* WS event schema | docs | +50 |

**总改动**：约 **+115 / -15 行**，跨 gateway + channel + client-web + docs 4 个仓库。无 schema 改动。

---

## 5. 新增测试用例（写入 e2e-test-cases.md `THREAD-*` 组）

### 5.1 基本 (5)
- `THREAD-01` 创建 thread（POST WS thread.create + parentMessageId）→ 入库 + 广播
- `THREAD-02` thread.list 默认 + limit=5 + status=archived 过滤
- `THREAD-03` thread.get + 含 unreadCount 字段
- `THREAD-04` thread.update title → 广播 thread.updated
- `THREAD-05` thread.delete soft → status='deleted' + 广播

### 5.2 Reply 路由（TH-1 关键）(4)
- `THREAD-10` Web 在 thread 内发消息 → agent 回复**带 threadId** → DB cl_messages.thread_id 一致
- `THREAD-11` 同上但 chatId / sessionKey 都不在缓存 → 仍能正确路由（fallback 链路）
- `THREAD-12` 主聊天消息 vs thread 消息混发：agent 回复正确分流
- `THREAD-13` `pendingAutoThreads` 队列：@mention → agent 回复落自动建的 thread

### 5.3 mark_read 跨设备 (TH-3) (2)
- `THREAD-20` 设备 A mark_read → 设备 B 在 5s 内收到 thread.updated（含 read 状态）
- `THREAD-21` mark_read 后 thread.list unread=0

### 5.4 ACP 自动建 thread (TH-4) (3)
- `THREAD-30` `/acp spawn ... --thread auto` → cl_threads 出现 type='acp' 行
- `THREAD-31` 同上但 Supabase 失败 → 报错日志 + 不 silent
- `THREAD-32` ensureThreadKnown：parentMessageId 缺失/格式错 → 自动修复 + 广播

### 5.5 并发安全 (TH-5) (2)
- `THREAD-40` 同 thread 5 条并发回复 → reply_count 增量 = 5（不丢）
- `THREAD-41` 同上对应 cl_thread_messages 都带 thread_id

### 5.6 API Chat × Thread (TH-2 关键) (3)
- `THREAD-50` `POST /api/chat` 带 `threadId` → reply 落 thread
- `THREAD-51` 同上 + Web 在线 → Web 同 thread 收到 inbound + outbound（sibling fan-out for thread）
- `THREAD-52` `POST /api/chat` 带 invalid threadId → 返 400 / 404 / 仍发到主聊天（取决决策）

### 5.7 边界 (TH-6/7) (2)
- `THREAD-60` thread.search 默认排除 archived/deleted
- `THREAD-61` thread.search query=空 → 400

### 5.8 文档 (TH-8) (1)
- `THREAD-70` 7 个 thread.* WS event 在 docs 中签名匹配实现（人工 review）

**总用例**：**22 条 THREAD-*** （对应 21 条 API-CHAT-* 的密度）。

---

## 6. 工作量估计

| 阶段 | 时间 |
|---|---|
| 写代码 7 个 commit | 90-120 min |
| 验证（22 用例 + 回归 thread CRUD） | 90-120 min |
| 修迭代（保留 1-2 轮）| 30-60 min |
| 文档（e2e-test-cases.md + docs/gateway/api.md） | 30 min |
| **合计** | **4-5 小时** |

---

## 7. 不在范围

- 不改 Supabase schema（Bug TH-5 用 PostgREST RPC `Prefer: tx=ours` 或写一个 atomic SQL 函数；如发现没法不改 schema，**停下来问**）
- 不改 OpenClaw 核心 ACP 代码（仅改 channel 仓库 session-bindings 错误处理）
- 不做 thread 跨 channel 移动 / 合并 / fork（PRD 未提）
- 不做 thread 权限模型（谁能开/关谁的 thread）

---

## 8. 风险点

1. **TH-1 修复方案 (c)**：channel 侧 reply-dispatcher 改为优先用 inbound `MessageThreadId` 而不是 session binding。需要确认 `ChannelThreadingContext` 在 deliver 时仍能拿到原 inbound 的 threadId（可能需要把 threadId 经 reply 上下文带过来，或在 dispatcher 闭包里捕获）。
2. **TH-5 原子自增 SQL**：PostgREST 的 PATCH 不直接支持 `column = column + 1` 表达式。可能需要：
   - (a) 写一个 Postgres function（要 schema 改动 → 停下来问）
   - (b) 改成在 gateway 内存 Map 里维护 reply_count + 周期 flush（弱化但不改 schema）
   - (c) 接受现状 race，只在文档警告
   倾向 (b) 或 (c)，避免动 schema。
3. **TH-2 thread.list 在 sibling broadcast 时**：API Chat outbound 已 fan-out 到 sibling（commit `1c51c3a`），thread 内的消息只要带 threadId 也会自然 fan-out。但 web 端如果当前不在那个 thread 视图，UI 是否会更新 thread.new_reply？需要 `thread.new_reply` 广播触发 + threadStore 收到后更新 unread badge —— 已 OK，待测。
4. **THREAD-32 ensureThreadKnown** 已经被 PRD 误标 stub，实际是工作的；测试时只确认 parentMessageId 修复行为是否符合用户预期（修复成 last user msg 还是丢错？）。

---

## 9. 等批准

按本计划开干请回复"开始"。如对优先级、范围、用例数有调整也请说。

特别需要决策：
- **TH-5 修复路线**：(a) 改 schema 加 atomic 函数，还是 (b) gateway 内存计数 + 周期 flush，还是 (c) 接受 race + 文档警告？
- **TH-2 invalid threadId**：返 400 拒绝，还是 fall back 到主聊天 + warn header？
