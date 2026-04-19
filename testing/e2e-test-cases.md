# Clawline 端到端测试案例

> 只是测试用例清单，不含执行脚本。覆盖 Web 客户端 UI、Gateway REST、Gateway WebSocket（/client 与 /backend）、Channel 插件直连模式、Relay 模式全链路、Supabase 数据校验、鉴权与错误边界。

## 约定

**依赖工具** 列用以下缩写：

| 缩写 | 含义 |
|---|---|
| `BA` | browser-agent（Chrome 扩展 HTTP Hook API @ 127.0.0.1:4821） |
| `curl` | REST HTTP 调用 |
| `wscat` | WebSocket 手动测试（`wscat -c` 或 `websocat`） |
| `sql` | Supabase SQL（表 `cl_*`） |
| `script` | 需要脚本化，工具组合（jq/node/shell） |

**环境变量**（测试前确认）：

```
GATEWAY_URL          http(s)://gateway.test/...        （Relay Gateway）
WEB_URL              http://localhost:4026             （Web 客户端）
CHANNEL_ID           e2e-test
CHANNEL_SECRET       <shared secret>
ADMIN_TOKEN          <X-Relay-Admin-Token>
USER_TOKEN           <cl_channel_users.token>
LOGTO_JWT            <Bearer token from Logto>
PLUGIN_BACKEND_URL   ws://relay/backend
CLIENT_WS_URL        ws://relay/client
SUPABASE_URL / KEY   仅 sql 类用例需要
```

**前置 fixture**（所有用例共享）：

- Supabase 已建 `cl_channels` 一行：`(channel_id=e2e-test, secret=..., token_param=token)`
- `cl_channel_users` 一行：`(channel_id=e2e-test, sender_id=e2e-user, token=<USER_TOKEN>, enabled=true)`
- OpenClaw 节点已启动 Channel 插件：`connectionMode=relay`，指向 `PLUGIN_BACKEND_URL`

---

## 模块索引

| # | 模块 | 用例数 | 预计时长 |
|---|---|---|---|
| 1 | Web 客户端 — 登录与配对 | 6 | 15 min |
| 2 | Web 客户端 — 聊天核心流程 | 10 | 30 min |
| 3 | Web 客户端 — 高级 UI | 8 | 25 min |
| 4 | Gateway REST — 认证与元信息 | 5 | 10 min |
| 5 | Gateway REST — 消息与 AI | 6 | 15 min |
| 6 | Gateway REST — 管理后台 API | 7 | 20 min |
| 7 | Gateway REST — 媒体上传 | 4 | 10 min |
| 8 | Gateway WS `/client` 协议 | 8 | 25 min |
| 9 | Gateway WS `/backend` 协议 | 6 | 20 min |
| 10 | Channel 插件 — 直连模式 | 6 | 20 min |
| 11 | Channel 插件 — Relay 模式全链路 | 5 | 25 min |
| 12 | 线程 / 自动分线 | 6 | 20 min |
| 13 | Supabase 数据一致性 | 5 | 15 min |
| 14 | 安全与错误边界 | 8 | 25 min |
| **合计** | — | **90** | **≈ 4.5 h** |

---

## 1. Web 客户端 — 登录与配对

> **Onboarding flag**：首次完成 Get Started 后会写入 `localStorage['clawline.onboarding.done'] = '1'`，后续访问即使无 connection 也直接进 `/chats` 而不再显示 Onboarding。测试用例通过显式清除该 flag 来复现"首次访问"状态，无需使用 Incognito 或 logout。

| ID | 标题 | 前置 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|---|
| W-01 | 首次访问未登录显示 Onboarding | `localStorage.removeItem('clawline.onboarding.done')` → 刷新 `/` | 访问 `http://localhost:4026/` | 渲染 "Your agents, one tap away" + Get Started 按钮 | BA |
| W-02 | 已登录或已完成 onboarding 则直接进 `/chats` | localStorage 存在至少 1 个 connection **或** `clawline.onboarding.done='1'` | 访问 `/` | 自动 redirect `/chats`，渲染 sidebar | BA |
| W-03 | Get Started → Logto OIDC 跳转 | 清除 onboarding flag；无登录态 | 点 Get Started | 跳到 `logto.dr.restry.cn/oidc/auth?...&redirect_uri=<WEB_URL>/callback`（此用例需真实 Logto，CI 中 SKIP） | BA |
| W-04 | OIDC 回调入库 | Logto 已授权 | 登录后回到 `/callback` | 2 秒内跳 `/chats`，`openclaw.userId` 已写入（需真实 Logto，CI 中 SKIP） | BA |
| W-05 | Pair — 手动输入 ws URL | 清除 onboarding flag + `openclaw.connections`；登录态 | 点 Get Started → `/pairing` → Manual → 填 `ws://localhost:8080/ws?token=abc`，chatId `dev` | `openclaw.connections` 数组新增一项，重定向到 `/chats` | BA |
| W-06 | Pair — 非法 URL 校验 | 同 W-05 | 在 pairing 表单填 `not-a-url` | 停留在表单并提示错误；localStorage `openclaw.connections` 无变化 | BA |

## 2. Web 客户端 — 聊天核心流程

| ID | 标题 | 前置 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|---|
| W-10 | 打开 chat 页面渲染 agent 列表 | 有 1 个 connection | `/chats` | 左侧渲染至少 1 个 connection + 其下的 agents，每项有名字+模型+状态 badge | BA |
| W-11 | 发送 ping 收到 pong | 进入 main agent chat | 输入 `ping` 回车 | 10 秒内收到回复（`pong` 或 assistant 文本），消息体渲染成 markdown | BA |
| W-12 | 流式消息 text.delta 渲染 | 同上 | 发一条触发长回复的消息 | UI 中消息逐字出现、`isStreaming: true`，结束后 badge 消失 | BA |
| W-13 | Shift+Enter 换行 / Enter 发送 | chat 页面 | 输入两行文本用 Shift+Enter 分隔 | 文本多行保留，Enter 才发送 | BA |
| W-14 | 草稿自动保存 | 输入未发送文本后离开 | 输入后切 agent 再切回 | `openclaw.draft.<connId>::<agentId>` 含草稿，回来后输入框仍显示 | BA |
| W-15 | 消息 copy | 收到消息 | hover 消息 → 点 copy | 剪贴板内容 = 消息文本（用 navigator.clipboard 校验） | BA |
| W-16 | 消息删除 | 己方消息 | 选择 → delete | UI 移除；Supabase `cl_messages` 标记删除或物理删除（看实现） | BA + sql |
| W-17 | 消息转发 | 收到消息 | forward → 选另一 agent | 目标 chat 出现转发消息 | BA |
| W-18 | Typing indicator | 对端开始生成 | 触发回复 | 2 秒内显示 "typing..."；5 秒空闲后消失 | BA |
| W-19 | Delivery ticks 失败态 | 网络断 | 发送 | UI 显示失败 ticks；outbox 缓存 ≤ 200 条 | BA |

## 3. Web 客户端 — 高级 UI

| ID | 标题 | 前置 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|---|
| W-20 | 暗色主题切换 | Profile 页 | Theme → Dark | `<html class="dark">` 生效；`openclaw.darkMode=1` | BA |
| W-21 | 侧栏宽度拖拽 | 桌面 ≥ 1024px | 拖动 divider 到 400px | `openclaw.sidebar.width=400`，刷新保持 | BA |
| W-22 | 分屏 ≥ 1440px | 桌面 ≥ 1440px | chat header 分屏按钮 | 打开第 2 个 pane；`clawline.split.panes` 有 2 项 | BA |
| W-23 | 分屏上限 5 | 同上 | 连续分屏 6 次 | 最多 5 pane，第 6 次被忽略或提示 | BA |
| W-24 | 分屏拖拽 agent | 同上 | 侧栏 agent 拖入空 pane | pane 加载该 agent chat | BA |
| W-25 | Slash commands 面板 | chat 输入框 | 输入 `/` | 下拉展示 20+ 命令，可模糊搜索 | BA |
| W-26 | 语音输入 + refine | 浏览器支持 Web Speech | 按下录音 → 说话 → 停止 | 转写出现在输入框；若启用 refine，文本调用 `/api/voice-refine` 美化 | BA + curl（观察 network） |
| W-27 | 建议气泡 | chat 有历史 | 发送消息后 | 出现 3 个建议回复（调用 `/api/suggestions`） | BA |

## 4. Gateway REST — 认证与元信息

| ID | 标题 | 前置 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|---|
| G-01 | `GET /healthz` 公开 | — | `curl $GATEWAY_URL/healthz` | 200，`ok: true`，含 `backendCount/clientCount/channels` | curl |
| G-02 | `GET /api/meta` 公开 | — | `curl $GATEWAY_URL/api/meta` | 200，返回 `adminAuthEnabled`、`publicBaseUrl`、`pluginBackendUrl` | curl |
| G-03 | Admin 缺 token 拒绝 | — | `curl $GATEWAY_URL/api/state` | 401 / 403 | curl |
| G-04 | Admin 用 header token 通过 | — | `curl -H "X-Relay-Admin-Token: $ADMIN_TOKEN" $GATEWAY_URL/api/state` | 200，含 `channels`, `stats` | curl |
| G-05 | Logto JWT 也可作 Admin | 有效 JWT | `curl -H "Authorization: Bearer $LOGTO_JWT" $GATEWAY_URL/api/state` | 200（JWKS 校验通过） | curl |

## 5. Gateway REST — 消息与 AI

| ID | 标题 | 前置 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|---|
| G-10 | `/api/messages/sync` 增量拉取 | channel 有历史消息 | `curl -H "Authorization: Bearer $USER_TOKEN" "$GATEWAY_URL/api/messages/sync?channelId=$CHANNEL_ID&after=<ts>&limit=20"` | 200，`messages[]` ≤ 20，`hasMore` 布尔 | curl |
| G-11 | `/api/messages/sync` 无权限 | — | 无 token 调用 | 401 | curl |
| G-12 | `POST /api/chat` 虚拟客户端 | — | `{message:"ping", channelId, agentId:"main", senderId:"ext-1", chatId:"t1"}` | 200，后端处理；同 chatId 其他 WS 客户端收到 echo | curl + wscat |
| G-13 | `POST /api/chat` 空闲 5 min 断开 | 已创建虚拟连接 | 等待 > 5 min 再调同 `(channelId,chatId)` | 底层连接被回收后重建 | curl（需等待） |
| G-14 | `POST /api/suggestions` 两种 mode | — | `{messages:[...], mode:"reply"}` 和 `{mode:"suggestions"}` | reply 返回 `reply` 字符串；suggestions 返回数组 | curl |
| G-15 | `POST /api/voice-refine` 文本美化 | — | `{text:"嗯那个我想说...", messages:[...]}` | 200，`refined` 为去口癖文本 | curl |

## 6. Gateway REST — 管理后台 API

| ID | 标题 | 前置 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|---|
| G-20 | CRUD channel | Admin | `POST /api/channels` → `DELETE /api/channels/:id` | 200；Supabase `cl_channels` 先增后删；活跃 client 收到 code 1012 断开 | curl + sql |
| G-21 | CRUD channel user | channel 已存在 | `POST /api/channels/:id/users` 添加，再 DELETE | 200；`cl_channel_users` 同步 | curl + sql |
| G-22 | `GET /api/messages` 管理查询 | 有消息 | `?channelId=&direction=&limit=50` | 200，含总数 | curl |
| G-23 | `GET /api/messages/stats` | 有消息 | 直接调用 | `hourly/models/channels` 三数组 | curl |
| G-24 | `GET /api/agents` agent 元数据 | 至少 1 个 backend 已连接 | 直接调用 | 200，channels[].agents[] 反映实时 agent.list.get 结果 | curl |
| G-25 | `GET/PUT /api/ai-settings` | Admin | PUT 修改 suggestionModel，再 GET | 新值生效；Supabase `cl_settings key='ai'` 更新 | curl + sql |
| G-26 | Relay node 注册 | Admin | `POST /api/relay-nodes` → GET 列表 → DELETE | CRUD 正常；`cl_relay_nodes` 同步 | curl + sql |

## 7. Gateway REST — 媒体上传

| ID | 标题 | 前置 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|---|
| G-30 | multipart 上传图片 | User token | `curl -F file=@a.jpg -H "Authorization: Bearer $USER_TOKEN" $GATEWAY_URL/api/media/upload?channelId=...` | 200，返回 `{id,url,mimeType,size}` | curl |
| G-31 | Base64 JSON 上传 | 同上 | `{filename,mimeType,data:"<b64>"}` | 200 | curl |
| G-32 | 无权限拒绝 | 无 token | 同上 | 401 | curl |
| G-33 | `GET /api/media/:filename` 回取 | 已上传 | 直接 GET | 200，二进制 + cache headers | curl |

## 8. Gateway WebSocket `/client` 协议

所有 WS 测试：`wscat -c "$CLIENT_WS_URL?channelId=$CHANNEL_ID&token=$USER_TOKEN&chatId=t1&agentId=main"`。

| ID | 标题 | 前置 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|---|
| G-40 | 连接成功 | channel 配置 token | 带 token 连 | 连接保持；backend 收到 `relay.client.open` | wscat |
| G-41 | 缺 token 拒绝 | channel 要求 token | 不带 token 连 | close code 4401 / 401 | wscat |
| G-42 | channelId 不存在 | — | `?channelId=ghost` | 关闭连接，4404 | wscat |
| G-43 | `ping` → `pong` | 已连接 | 发 `{type:"ping",data:{timestamp}}` | 收 `{type:"pong",data:{timestamp}}` | wscat |
| G-44 | 发 `message.receive` 持久化 | 已连接 | 发 `{type:"message.receive",data:{content:"hi"}}` | `cl_messages` 新增一行 direction='inbound'；backend 收到 `relay.client.event` | wscat + sql |
| G-45 | 同 chatId 多客户端 sibling broadcast | 2 个 wscat 同 chatId | 客户端 A 发 `message.send` | 客户端 B 也收到（不从 backend 回） | wscat ×2 |
| G-46 | 速率限制 | 同一连接 | 1 秒内 > 30 条消息 | 连接收到 1008 close | script |
| G-47 | backend 未连接 | 无 plugin 在线 | client 发消息 | code 1013 close | wscat |

## 9. Gateway WebSocket `/backend` 协议

模拟 OpenClaw 插件连接 `PLUGIN_BACKEND_URL`。

| ID | 标题 | 前置 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|---|
| G-50 | Hello 握手 | — | 连后 5 秒内发 `{type:"relay.backend.hello",channelId,secret,instanceId}`（注意：`channelId/secret/instanceId` 在帧**顶层**，不在 `data:{}` 内 —— 实现见 `gateway/server.js:1942-43`） | 收 `{type:"relay.backend.ack",channelId,timestamp}` | wscat |
| G-51 | Hello 错密钥 | — | secret 错误 | 收 `relay.backend.error` 并关闭（1008 `backend auth failed`） | wscat |
| G-52 | Hello 超时 | — | 连上不发 hello | 5 秒后 1008 `missing relay.backend.hello` | wscat |
| G-53 | `relay.server.event` 透传 client | 已握手；有 client 在线 | 发 `{type:"relay.server.event",connectionId,event:{type:"message.send",data:{content:"ok"}}}`（顶层 `connectionId/event`） | 对应 client 收到 `message.send` 事件 | wscat ×2 |
| G-54 | `relay.server.persist` 入库不转发 | 同上 | 发 `{type:"relay.server.persist",event,senderId}`（顶层字段） | 仅 `cl_messages` 入库，client 不收 | wscat + sql |
| G-55 | `relay.server.close` 主动踢 | client 已连接 | 发 `{type:"relay.server.close",connectionId,code,reason}`（顶层字段） | 目标 client 被关闭 | wscat ×2 |

## 10. Channel 插件 — 直连模式

插件跑 `connectionMode=websocket`，监听 `ws://localhost:8080/ws`。

| ID | 标题 | 前置 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|---|
| C-01 | 无 auth 直接连 | `auth.enabled=false` | `wscat -c ws://localhost:8080/ws?chatId=x&senderId=u1` | 连通 | wscat |
| C-02 | 开启 auth 缺 token 拒绝 | 配了 `auth.users[]` | 不带 token 连 | 关闭或拒绝握手 | wscat |
| C-03 | `agent.list.get` | 已连接 | 发 `{type:"agent.list.get"}` | 收 `agent.list` 含 agents 数组 | wscat |
| C-04 | 发消息 → 插件 emit 到 Agent，Agent 回复 streaming | 已连接 | 发 `{type:"message.receive",data:{content:"hi"}}` | 收 `text.delta` 多条 → 结束；历史文件 `~/.openclaw/clawline-history.json` 记录 | wscat + file |
| C-05 | 文本超 `textChunkLimit` 被切分 | 发 > 4000 字符 | 同上 | 插件拆成多条 `message.send` 或 `text.delta` chunk | wscat |
| C-06 | 媒体超 `mediaMaxMb` 拒收 | 30 MB 限制 | 发一个 > 30 MB `file.transfer` | 收 `status.failed` 或错误事件 | wscat + script |

## 11. Channel 插件 — Relay 模式全链路

插件 `connectionMode=relay`，连 `PLUGIN_BACKEND_URL`。

| ID | 标题 | 前置 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|---|
| R-01 | 插件上线触发 backend.hello | 启动插件 | 观察 Gateway 日志 | 收 `relay.backend.hello`，返 `ack` | wscat（监听） |
| R-02 | 浏览器客户端经 Relay 发消息到 Agent | 插件在线 + 浏览器在 `localhost:4026` | UI 发 `ping` 到 main | Web 收 `pong`；`cl_messages` 2 行（inbound+outbound） | BA + sql |
| R-03 | 插件断开自动重连 | 杀掉插件进程再启动 | 3 秒后观察 | 自动重连 hello 成功；`reconnectIntervalMs=3000` 生效 | script |
| R-04 | 断开期间消息离线队列 | 插件断开 5 秒 | Web 发 3 条消息 | 重连后 backend 收到全部；若消息是 outbound，插件恢复会推给 client | wscat + BA |
| R-05 | Proactive DM（插件主动推送） | 插件在线，无 inbound | 插件调用 proactive API（`relay.server.persist` senderId=agent） | `cl_messages` outbound 入库；同 channelId 在线 client 收到 | script + sql |

## 12. 线程 / 自动分线

| ID | 标题 | 前置 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|---|
| T-01 | `thread.create` 手动创建 | WS 已连，已知一条历史 message 作为父 | 发 `{type:"thread.create",data:{title:"t1",parentMessageId:"<existing-msg-id>",requestId:"r1"}}` —— **`parentMessageId` 必填**（实现见 `gateway/server.js:handleThreadCreate`） | `cl_threads` 新增；回 `thread.create` 含 `data.thread` 完整对象（含 id/parentMessageId/title/...） | wscat + sql |
| T-02 | `thread.list` 分页 | 已有多个 thread | 发 `{type:"thread.list",data:{requestId:"r2",limit:N}}` —— `limit` 与 `pageSize` 等价（自 commit 573ee0c 起），最大 100，默认 20 | 列表按 `last_reply_at desc nulls last, created_at desc` 排序，`threads.length ≤ limit` | wscat |
| T-03 | @mention 自动建线 | 消息含 `@agentX` | 发 `message.receive` 正文 `hi @code` | 自动创建 thread（title 基于 agent），原消息留主聊 | wscat + sql |
| T-04 | 回复 thread 路由到同线 | 已有 thread，用户在其中回复 | Web UI 在 thread pane 发 | backend 回复附 `threadId`；持久化入该 thread | BA + sql |
| T-05 | ACP 线程发现 | Agent 使用 ACP 生成子 session | Agent 回复带 `threadId`（ACP session id） | Gateway 规范化并 upsert thread；Web 端显示子线 | script + sql |
| T-06 | `thread.mark_read` | 已读更新 | 发 `thread.mark_read` | `cl_thread_read_status` upsert | wscat + sql |

## 13. Supabase 数据一致性

| ID | 标题 | 前置 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|---|
| S-01 | 消息 `(message_id,direction)` 去重 | 同 messageId 发两次 | plugin 重复 emit | `cl_messages` 只有 1 行 | sql |
| S-02 | 持久化失败落 dead-letter | 人为断 Supabase | 发消息 | 3 次重试后写入 `data/persist-failures.jsonl` | script + file |
| S-03 | 删除 channel 级联 | 有消息/用户/线程 | `DELETE /api/channels/:id` | 关联 users/messages/threads 清理策略验证（按实现） | curl + sql |
| S-04 | `cl_settings` 读写 | — | PUT `/api/ai-settings` | `cl_settings.key='ai'` JSONB 更新 | curl + sql |
| S-05 | `cl_relay_nodes` 同步 | — | POST /api/relay-nodes | 表新增，GET 返回一致 | curl + sql |

## 14. 安全与错误边界

| ID | 标题 | 前置 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|---|
| E-01 | CORS 允许列表 | `corsAllowedOrigins` 配了 A | 从源 B 发跨域请求 | 响应缺 `Access-Control-Allow-Origin`，浏览器拦截 | BA |
| E-02 | HTTP rate limit | 单 IP | 1 min 内 > 100 次 | 429 | script |
| E-03 | 单 IP 连接上限 50 | 同 IP | 打开 51 个 WS | 第 51 个被拒（1013/429） | script |
| E-04 | Admin token 拼错回 401 | — | 传错 token | 401，不泄露差异信息 | curl |
| E-05 | Logto JWT 过期 | 过期 token | 带过期 JWT 调 admin | 401，清晰错误码 | curl |
| E-06 | 消息最大体积 | 发 > textChunkLimit 的单体 | wscat 发巨包 | 插件切分或拒绝 | wscat |
| E-07 | WS idle timeout | 静默 WS | 不发任何帧 >某阈值 | 服务端 ping 未 pong 关闭 | wscat |
| E-08 | XSS 注入消息 | 发含 `<script>` 消息 | 检查 Web 渲染 | markdown 渲染转义，无执行 | BA |

---

## 使用建议

1. **先跑烟雾测试**：G-01、G-04、W-01、W-11、R-02——覆盖关键路径，10 分钟内可完成。
2. **回归全量**：每次 release 跑 1/4/6/8/9/11/12 模块。
3. **性能/压力**不在此文档范围——另开 `docs/testing/performance.md`。
4. **CI 集成**：REST（4/5/6/7/13）适合每 PR 跑；WS（8/9）和 browser-agent（1/2/3）需本地 Chrome + 运行环境，放 nightly。

---

## 发现的文档缺失 / 疑点（待决策）

梳理源码时发现的与现有文档不一致或未覆盖的点：

1. **Web 声称 "All data stays on device"**，实际消息历史存在 Supabase `cl_messages`。本地只有 connection / settings / outbox 缓存。宣传文案需调整或加说明。
2. **Gateway 的自动分线逻辑**（@mention / delegation / ACP threadId 三种触发）在 `docs/gateway/api.md` 中未描述。
3. **`/api/agents` endpoint** 实时返回各 channel 下的 agent 元数据，文档未列。
4. **`/api/ai-settings`** 支持的字段远多于 `docs/gateway/api.md`（含 suggestionModel、replyModel、voiceRefineModel、各自 prompt），需补。
5. **`POST /api/chat` 虚拟连接池**（`api-<channelId>-<chatId>` 5 min 空闲回收）未文档化。
6. **Sibling broadcasting**（同 `(channelId,chatId)` 多 client 回声）未文档化——容易被误认为重复消息 bug。
7. **消息持久化 dead-letter**（`data/persist-failures.jsonl`）未文档化，运维未知。
8. **Channel 插件的 Reactions / Search / Groups / Presence** 源码有实现但文档不完整。`channel.ts` 中 `capabilities.reactions=false` 和 `reactions.ts` 实现矛盾——到底有没有？
9. **Web 的 URL 强制 `?mobile=true`、侧栏拖拽、草稿自动保存、5 pane 分屏上限、slash 命令记录排序** 等 UI 细节无文档——是否对外发布？
10. **Channel webhook mode** 配置存在但核心流程未文档化，测试是否要覆盖？
11. **Logto redirect_uri 白名单**：`127.0.0.1:4026` 未注册导致今天测试走不通；需要 `docs/client-web/deploy.md` 给出明确的本地开发必须用 `localhost` 的说明。
12. **Relay node 多节点分派策略**：`cl_relay_nodes` 表存在但 channel 如何路由到节点未见文档，是否单活 / 多活？

这些点会直接影响测试用例的通过标准，建议先逐条确认「现状是否符合预期」再执行测试。

---

## 15. API Chat 接口（第三方调用 `/api/chat`）

> 第三方程序客户端（Claude Code、CI、自家服务等）通过 `POST /api/chat` 直接与 Agent 对话。本节覆盖修复后的完整契约（含并发安全、可配超时、sibling 广播、错误码、持久化）。

**端点契约**：

```
POST /api/chat
  Headers:
    Authorization: Bearer <USER_TOKEN | ADMIN_TOKEN | LOGTO_JWT>
    Content-Type: application/json
  Body:
    message       : string  (required)
    channelId     : string  (required)
    agentId       : string  (required)
    senderId      : string  (optional, default 'api')
    chatId        : string  (optional, fallback = senderId)
    senderName    : string  (optional)
    timeout       : number  (optional, ms; default 300000; clamp [5000, 600000])
                    优先级：body.timeout > ?timeout= > RELAY_API_CHAT_TIMEOUT_MS env
  Response 200:
    { ok:true, messageId, inboundMessageId, content, agentId, chatId, timestamp, meta:{source:'api'} }
  Response 4xx/5xx:
    400 missing required field
    401 auth required
    502 agent rejected/closed
    503 channel backend not connected
    504 agent did not respond within timeout
    500 unexpected error
```

### 15.1 基本

| ID | 标题 | 前置 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|---|
| API-CHAT-01 | 单发同步 | fires backend 在线，user token | `curl POST /api/chat` 发 `ping` | HTTP 200，含 `inboundMessageId`、`messageId`、`content` 非空、`meta.source='api'` | curl |
| API-CHAT-02 | 同 chatId 复用 | 同上 | 同 chatId 连发 3 条，每条不同 message | 3 条均 HTTP 200，3 个 `inboundMessageId` 互异，pool 复用同一 virtualConnId | curl |
| API-CHAT-03 | 并发不同 chatId × 10 | 同上 | 10 个 chatId 各发 1 条 `&` 并发 | 全部 HTTP 200，无 504/500，inboundMessageId 全互异 | script |
| API-CHAT-04 | **并发同 chatId × 5（P0-α 关键）** | 同上 | 同一 chatId 同时发 5 条 message，每条不同 | 5 条均 HTTP 200，每条 reply 与 inbound `replyTo` 一一对应，无串话 | script |
| API-CHAT-05 | 长文本 | 同上 | 发 5K 字符 message | HTTP 200 或 200-with-truncated-reply（取决 agent），不 hang/不 crash | curl |

### 15.2 超时

| ID | 标题 | 前置 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|---|
| API-CHAT-10 | 默认超时 = 300s | — | 不传 timeout 发慢消息（让 agent 跑） | 完成或 304s 内 504 | curl |
| API-CHAT-11 | `body.timeout=10000` | — | 发触发慢回复消息 | ≤10s 后 504 `agent did not respond within timeout` | curl |
| API-CHAT-12 | `body.timeout=600000` | — | 接受最大值 600s | 不报参数错误，正常处理 | curl |
| API-CHAT-13 | 超时后补取 | API-CHAT-11 触发 504 后 | 等 agent 实际回复（看 server log），调 `GET /api/messages/sync?channelId=fires&after=<ts>` | sync 能拿到 inbound + 后到的 outbound（meta.source='api'，replyTo 匹配 inboundMessageId） | curl + sleep |

### 15.3 Sibling broadcast

| ID | 标题 | 前置 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|---|
| API-CHAT-20 | API → Web 同 chatId 双向可见 | Web ws 已连同 chatId | 通过 Web ws 监听；同时 `POST /api/chat` 同 chatId | Web 收到 inbound `message.send {echo:true,direction:'inbound'}` + outbound `message.send` reply | wscat + curl |
| API-CHAT-21 | API → Web 不同 chatId 不可见（F3a） | Web ws 连 chatId=A | API 发 chatId=B | Web 不收任何 frame；API 仍能 200 | wscat + curl |
| API-CHAT-22 | Web 发 → API sync 可查 | Web 已发 1 条到 chatId=X | API caller 调 `GET /api/messages/sync?channelId=fires&after=<ts>` | 拿到 Web 发的 inbound + agent outbound | curl |
| API-CHAT-23 | Web + API 同 chatId 各发各的 | Web ws 在线 | 同时 Web 发 + API 发，间隔 1s | 两条都各自有正确 reply，不串话；Web 看到 4 条事件（自发 inbound + 自得 outbound + API inbound echo + API outbound） | wscat + curl |

### 15.4 错误

| ID | 标题 | 前置 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|---|
| API-CHAT-30 | 无 token | — | 不带 Authorization | HTTP 401 `auth required` | curl |
| API-CHAT-31 | backend 离线 channel | 用 `ottor`（无 backend） | POST | HTTP 503 `channel backend not connected` | curl |
| API-CHAT-32 | 缺 message | — | body 不带 `message` | HTTP 400 `message is required` | curl |
| API-CHAT-33 | 缺 agentId | — | body 不带 `agentId` | HTTP 400 `agentId is required` | curl |
| API-CHAT-34 | agent 不存在 | fires backend 在线 | `agentId="ghost"` | timeout 504（当前实现）或 backend 给 reject → 502；任一为合格行为 | curl |

### 15.5 持久化

| ID | 标题 | 前置 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|---|
| API-CHAT-40 | 1 发 = 2 行 | 同 fires | API-CHAT-01 完成后查 `cl_messages?message_id=eq.<inboundMessageId>` 与 `?meta->>source=eq.api&order=timestamp.desc&limit=2` | inbound 1 行 (direction='inbound', meta.source='api') + outbound 1 行 (direction='outbound', meta.source='api', replyTo=inboundMessageId) | curl + sql |
| API-CHAT-41 | timeout 后 outbound 仍持久化 | API-CHAT-11 触发 504 后 | 30s 后查 cl_messages | inbound 始终在；outbound 在 backend 实际回包时入库（最终一致） | sql |
| API-CHAT-42 | 重复 inboundMessageId 去重 | — | 服务端不会重复（每次 randomUUID）；测：手工同 message_id POST → ws 走（同 G-44），DB 始终唯一 | `(message_id, direction)` unique constraint 生效 | sql |

---

## 16. Thread / 子区（端到端 + API + Web E2E）

> 对应 PRD P0 #3 闭环。覆盖 thread CRUD、reply 路由、mark_read 跨设备、ACP 自动建 thread、并发安全、`/api/chat × thread`、边界。修复见 commit `c460abe..ad8fc92`。

**WS event schema reference**（按实现整理）：

| Event | Direction | Required fields | Optional fields |
|---|---|---|---|
| `thread.create` | client→relay | `parentMessageId` | `title`, `type`, `requestId` |
| `thread.get` | client→relay | `threadId` | `requestId` |
| `thread.list` | client→relay | — | `channelId`, `status` (default `active`, or `all`), `participantId`, `page`, `limit`/`pageSize` (默认 20，max 100), `requestId` |
| `thread.update` | client→relay | `threadId` | `title`, `status`, `requestId` |
| `thread.delete` | client→relay | `threadId` | `requestId` |
| `thread.mark_read` | client→relay | `threadId` | `userId` (default 来自 auth), `requestId` |
| `thread.search` | client→relay | `threadId`, `query` | `requestId` |
| `thread.updated` | relay→client | broadcast on create/update/delete/new-reply/mark_read; payload `{thread}` 或 `{threadId, readState:{userId,lastReadAt}}` | — |
| `thread.new_reply` | relay→client | broadcast on each reply | `{threadId, messageId, senderId, preview}` |

### 16.1 基本 (5)

| ID | 标题 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|
| THREAD-01 | thread.create | WS 已连，pick existing messageId 作为 parentMessageId；发 `{type:"thread.create",data:{parentMessageId,title:"e2e-01",requestId}}` | 收 `thread.create` 含完整 thread 对象；同 channel sibling 收到 `thread.updated` 广播 | wscat ×2 + sql |
| THREAD-02 | thread.list 默认+limit+status | 发 `{type:"thread.list",data:{limit:3}}`；再发 `{...,limit:3,status:"all"}` | 默认 status=active 过滤；limit=3 返 ≤3；status=all 含 archived | wscat |
| THREAD-03 | thread.get with unreadCount | 已 mark_read 一个 thread → thread.get | 返回完整 thread + `unreadCount` 字段（数值） | wscat + sql |
| THREAD-04 | thread.update title | thread.update {threadId, title:"new"} | 收 `thread.update` 响应 + sibling 收 `thread.updated` | wscat ×2 |
| THREAD-05 | thread.delete soft | thread.delete {threadId} | thread.status='deleted'；sibling 收 `thread.updated` | wscat + sql |

### 16.2 Reply 路由（TH-1 关键，3）

| ID | 标题 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|
| THREAD-10 | thread 内消息 → agent reply 带 threadId | 在已存在 threadId 内发 `message.receive {threadId:T}` | agent 回复 `message.send` 带 `data.threadId === T`；DB cl_messages.thread_id=T | wscat + sql |
| THREAD-11 | fresh chatId 首次 thread 回复（无 session binding） | 用全新 chatId+threadId 发 message.receive | 同上：reply 仍带 threadId（fallback inbound） | wscat + sql |
| THREAD-12 | 主聊天 vs thread 混发分流 | 同 chatId 内交替发：A 主聊天，B threadId=T，C 主聊天，D threadId=T | A/C 的 reply 不带 threadId；B/D 的 reply 带 threadId=T | wscat + sql |

### 16.3 mark_read 跨设备 (TH-3，2)

| ID | 标题 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|
| THREAD-20 | 设备 A mark_read → 设备 B 收广播 | 两个 WS 连接同 channel；A 发 `thread.mark_read` | A 收响应；B 收 `thread.updated {threadId, readState:{userId,lastReadAt}}` | wscat ×2 |
| THREAD-21 | mark_read 后 thread.list unread=0 | mark_read，再 thread.list | 该 thread 的 `unreadCount=0` | wscat |

### 16.4 ACP 自动建 thread (TH-4，2)

| ID | 标题 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|
| THREAD-30 | ACP spawn 注册到 cl_threads | 触发 `/acp spawn ... --thread auto` 于真实 fires backend | DB cl_threads 新增 `type='acp'` 行 | sql + manual |
| THREAD-31 | Supabase 失败 → 错误日志 (不 silent) | 模拟无效 RELAY_SUPABASE_*（环境层，跳过实测）| 代码：`session-bindings.ts` 当 hooks 缺失 → `console.warn` 含明确的指引 | code review |

### 16.5 并发安全 (TH-5，2)

| ID | 标题 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|
| THREAD-40 | 5 条并发同 thread reply → reply_count=5 | 在同一 threadId 内并发 5 条 message.receive | DB cl_threads.reply_count 增量精确等于 5（无 race） | script + sql |
| THREAD-41 | 同上消息全部带 thread_id 入库 | 同上 | `cl_messages WHERE thread_id=T` count=5 | sql |

### 16.6 API Chat × Thread (TH-2 关键，3)

| ID | 标题 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|
| THREAD-50 | `POST /api/chat` 带 threadId → reply 落 thread | curl 带 `body.threadId` | HTTP 200，agent 回复落该 thread；DB outbound `thread_id=T` | curl + sql |
| THREAD-51 | API 发 + Web 在线 → Web 收 inbound+outbound（同 thread） | WS listener 在同 chatId+threadId；POST /api/chat 带 threadId | Web 收到 inbound echo + outbound message.send，二者均带 `data.threadId=T` | wscat + curl |
| THREAD-52 | 无效 threadId → 400 | curl 带 `threadId="ghost"` | HTTP 400 `threadId not found in channel <c>` | curl |

### 16.7 边界 (TH-6/7，3)

| ID | 标题 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|
| THREAD-60 | thread.search on deleted thread | 先 thread.delete，再 thread.search | 收响应 `{error:"thread is deleted"}` | wscat + sql |
| THREAD-61 | thread.search query=空 → 400 | 发 `{type:"thread.search",data:{threadId,query:""}}` | 收 `{error:"query is required"}` | wscat |
| THREAD-62 | 客户端 thread 消息按 timestamp 排序 | UI E2E：人为构造乱序消息 | UI 渲染按 timestamp 排序 | browser-agent |

### 16.8 文档/契约 (TH-8，2)

| ID | 标题 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|
| THREAD-70 | docs reference matches impl | code-review | 上面 schema 表与 `gateway/server.js` 实现一致 | review |
| THREAD-71 | thread.* 7 events 文档完备 | 文档存在 + 用 wscat 探测每个 event 都返回结构化结果 | thread.create/get/list/update/delete/mark_read/search 全部协议字段对齐 | wscat + review |


---

## 17. Multi-Agent / Multi-OpenClaw 协同（MULTI-AGENT-*）

> 对应 PRD P0 #4。覆盖跨 agent 路由 / @mention / delegation / 并发 / 多 OpenClaw 实例。

| ID | 标题 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|
| MA-01 | 跨 agent 路由（顺序）| 同 chatId 上先发到 main，再发到 researcher | main 用 claude-opus 模型回复（"🍟"），researcher 用 gemini 模型回复 | curl |
| MA-02 | @mention 自动建子线 | 在 main 会话 message.receive 内容 `@researcher please ...` | gateway 自动 `autoCreateThread` → cl_threads 新增 type='user' title=@researcher 行；DB 中 inbound thread_id=null（@mention 父消息不带线） | wscat + sql |
| MA-03 | Delegation 通过 ACP spawn | main 会话发 `/acp spawn claude --mode persistent --thread auto` | 收 `✅ Spawned ACP session …`；cl_threads 新增 type='acp' 行；后续消息可走子 agent | wscat + sql |
| MA-04 | API Chat 指定 agentId | `POST /api/chat agentId=researcher` | reply 带 `agent_id=researcher`，DB outbound `meta.model` 为 gemini-3.1-pro-preview | curl + sql |
| MA-05 | 并发 main + researcher | 同时（&）调 /api/chat agentId=main 和 /api/chat agentId=researcher（同 chatId） | 两条都 200，各自正确归属（main=claude, researcher=gemini），无串话 | script |
| MA-06 | Multi-OpenClaw config | 配置 ≥2 个 channel + ≥2 个 backend 在线 | 不同 channelId 的消息分发到对应 backend，互不串 | sql + 多 openclaw 实例 |
| MA-07 | Web UI agent 列表 | 浏览 /chats，sidebar | 显示所有在线 agent（aria-label="Chat with <agentId>"），点击进入对应 chat | browser-agent |

---

## 18. Inbox 不退化（INBOX-*）

> 对应 PRD P0 #6。目的：在 P0 #1~#5 闭环后，确保 Inbox 现有功能不退化。**不做新功能 / 不做持久化 / 不做自动回复。**

### 18.1 入口与导航

| ID | 标题 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|
| INBOX-01 | BottomNav Inbox 入口 | navigate `/chats`，点 BottomNav 的 Inbox 项 | URL → `/inbox`；页面渲染 SummaryBar + 卡片网格 | BA |
| INBOX-02 | unread badge 显示 | 至少 1 agent `status='pending_reply'` | BottomNav Inbox icon 上有 badge，数 = `getUnreadTotal()` 全局未读数；超过 99 显示 "99+" | BA |

### 18.2 SummaryBar (Top Stats)

| ID | 标题 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|
| INBOX-10 | 4 元数 SummaryBar | 进入 /inbox | 渲染 2×2 grid：「待回复」「思考中」「在线」「未读消息」四块；数字 = state.counts | BA |
| INBOX-11 | pending/thinking 高亮 | 模拟 status='pending_reply' 的 item | 「待回复」卡片有 ring-orange，「思考中」有 ring-cyan | BA |

### 18.3 Inbox 列表与状态

| ID | 标题 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|
| INBOX-20 | 渲染 agent 列表 | 进入 /inbox | items 至少 1 个，每张卡含：emoji + agentName + status badge + lastMessage preview | BA |
| INBOX-21 | 状态徽标 + 颜色 | 各 status 切换 | pending_reply=橙+pulse，thinking=青+pulse，idle=灰，offline=红 | BA |
| INBOX-22 | 排序：lastMessage timestamp DESC | 多 agent，已知 lastMessage 时间 | 卡片按 timestamp 倒序，pending_reply > thinking > idle > offline | BA |
| INBOX-23 | unread red pill | item.unreadCount > 0 | 卡片右上角红色圆 pill，>99 显示 "99+"，=0 隐藏 | BA |
| INBOX-24 | 空 Inbox state | items.length=0 | 渲染 EmptyState「No Agents Yet」 | BA |

### 18.4 卡片展开 / mark_read

| ID | 标题 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|
| INBOX-30 | 点击展开 → markAsRead | 点未读卡片 | 卡片高度展开（spring），unreadCount 立刻 → 0；localStorage `openclaw.inbox.lastRead.{conn}.{agent}` 写入当前时间戳 | BA |
| INBOX-31 | 跨界面 lastRead 同步 | Inbox 内 markAsRead 后进 ChatRoom 同 agent | ChatRoom 也认为已读，不重复显示 unread | BA |
| INBOX-32 | recentMessages 渲染 | 卡片展开 | 显示最近 ≤5 条消息，user 右侧蓝底，AI 左侧白底；markdown 渲染 | BA |

### 18.5 内联回复

| ID | 标题 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|
| INBOX-40 | textarea 输入 + Enter 发送 | 卡片展开 → 输入文字 → Enter | 调 `channel.sendText` → 立即 append 到 recentMessages（skipReloadRef 防重）→ 清空输入 | BA |
| INBOX-41 | Send 按钮 disabled 态 | 输入框为空 | Send 按钮 opacity-50 disabled；输入后变 primary 色 enabled | BA |

### 18.6 Suggest Reply（手动）

| ID | 标题 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|
| INBOX-50 | Suggest Reply 调 /api/suggestions | 卡片展开 → 点 "Suggest Reply" / 草稿按钮 | 调 `POST /api/suggestions` mode='reply'（带最近 20 条消息）；loading spinner；返回后 textarea 自动填入；可继续编辑 | BA + curl 抓 network |
| INBOX-51 | Open Chat 跳转 | 点 "Open Chat" 链接 | navigate to `/chat/{agentId}?connectionId=...` | BA |

### 18.7 DigestPanel + Auto-action

| ID | 标题 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|
| INBOX-60 | DigestPanel 折叠/展开 | 点击 Sparkles 切换器 | spring 高度动画；只有 items.length > 0 时渲染 | BA |
| INBOX-61 | 生成 Summary | 点 "✨ Generate Summary" | 调 draftReply 拼 status 摘要 → markdown 渲染在面板内；loading 期间 spinner | BA |
| INBOX-62 | Pending agent "生成回复" | pending_reply 状态卡 | DigestPanel 显示 "生成回复" 按钮（橙），点后调 draftReply + sendText + recordUserMessage | BA |
| INBOX-63 | Stale agent "催更" | idle 且 lastMessage > 30 min | DigestPanel 显示 "催更" 按钮（蓝），点后发 "有进展吗？请更新状态。" | BA |

### 18.8 状态/数据驱动

| ID | 标题 | 步骤 | 预期 | 工具 |
|---|---|---|---|---|
| INBOX-70 | localStorage `openclaw.inbox.cache` 持久化 | 任意状态变化 | cache 序列化（不含 suggestedReply）；下次进入 Inbox 立即可见 | BA + ls inspect |
| INBOX-71 | `openclaw:inbox-updated` event 订阅 | 触发 inbox state 改变 | 所有 onInboxUpdate 订阅者收到 event，BottomNav badge 更新 | BA |

