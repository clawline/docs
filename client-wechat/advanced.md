# 高级指南

本文档深入介绍 Clawline 微信小程序客户端的核心模块实现细节，适合需要二次开发、排查问题或理解内部架构的开发者。

## WebSocket 连接池

连接池 (`utils/ws-pool.js`) 在页面切换时保持 WebSocket 连接存活，避免反复握手。核心思想：页面隐藏时不立即关闭连接，而是进入宽限期等待复用。

### 生命周期

连接池管理四个阶段：

| 方法 | 说明 |
|------|------|
| `acquire(key, factoryFn)` | 获取连接。如果 `key` 对应的连接仍在打开或正在重连，直接返回并标记 `reused: true`；否则调用 `factoryFn()` 创建新的 `GenericChannelClient` 实例（不会自动调用 `.connect()`）。如果存在过期条目则先清理 |
| `rebind(key, callbacks)` | 重新绑定事件回调。页面复用连接后，必须调用此方法将 `onEvent`、`onStatusChange`、`onError` 指向当前页面实例，否则事件会投递到已销毁的页面 |
| `release(key, delayMs?)` | 释放连接并启动空闲计时器。默认宽限期 **15 秒**（`delayMs` 缺省为 `15000`）。计时器到期后自动关闭连接并从池中移除 |
| `destroy(key)` | 立即关闭连接并从池中移除，不经过宽限期 |

辅助方法：

| 方法 | 说明 |
|------|------|
| `closeAll()` | 关闭池中所有连接（应用退出时调用） |
| `status()` | 返回池的快照对象，包含每个 key 的连接状态和是否处于空闲等待，用于调试 |

### 页面切换复用机制

典型的页面切换流程如下：

```
页面 A onHide
  -> wsPool.rebind(key, { onEvent: null, ... })   // 解绑回调，防止隐藏页面收到 setData
  -> wsPool.release(key, 15000)                     // 进入 15 秒宽限期

页面 B onShow (或页面 A 再次 onShow)
  -> wsPool.acquire(key, factoryFn)                 // 宽限期内命中缓存, reused=true
  -> wsPool.rebind(key, { onEvent: fn, ... })       // 绑定当前页面的回调
  -> 如果 reused，不需要再次 connect()
```

如果 15 秒内没有页面重新 `acquire`，连接将被自动关闭。这个时间窗口覆盖了大多数用户在聊天列表和聊天室之间切换的场景。

### 连接判活

`acquire` 判断连接是否可复用时，会检查 `client.status` 是否为 `'connecting'`、`'reconnecting'` 或通过 `client.isOpen()` 确认连接已打开。不满足任何一项则视为过期条目，清理后重新创建。

### 池 Key 设计

Key 通常为 `chatId` 或复合标识符。不同聊天使用不同的 key，因此切换聊天时不会误用其他会话的连接。

## 离线消息队列 (Outbox)

离线发件箱 (`utils/outbox.js`) 在 WebSocket 断开时暂存用户发送的消息，待连接恢复后重新投递。

### 存储架构

```
          +-----------+     miss     +------------------+
  API --> | LRU Cache | ----------> | wx.setStorageSync |
          | (内存)     | <---------- | (持久化)          |
          +-----------+   hydrate   +------------------+
```

- **LRU 内存缓存**：最多保留 **20 个 key** 的队列数据（`MAX_CACHE_SIZE = 20`），超出时淘汰最早访问的 key
- **持久化**：每次写操作同步到 `wx.setStorageSync`，key 格式为 `openclaw.outbox.{connectionId}.{chatId}`
- 读操作先查内存，未命中再从 Storage 反序列化

### 限制

| 限制项 | 值 | 常量名 |
|--------|-----|--------|
| 单队列最大消息数 | 50 条 | `MAX_OUTBOX_ITEMS` |
| 非文本载荷大小上限 | 1 MB (1,048,576 字节) | `MAX_MEDIA_SIZE` |
| LRU 缓存容量 | 20 key | `MAX_CACHE_SIZE` |

### API

#### `enqueue(connectionId, chatId, item)`

将消息放入离线队列。`item` 必须包含 `id` 和 `kind` 字段。

- 如果队列已满（>= 50 条），抛出 `Error`，`code = 'OUTBOX_FULL'`
- 如果非文本消息载荷超过 1MB，抛出 `Error`，`code = 'MEDIA_TOO_LARGE'`
- 如果缺少 `id` 或 `kind`，抛出 `Error`，`code = 'INVALID_MESSAGE'`
- 返回值：带有 `retryCount`（初始 0）、`createdAt`（时间戳）、`inFlight`（初始 false）的完整消息对象

#### `list(connectionId, chatId)`

返回指定队列的消息副本（浅拷贝数组）。

#### `remove(connectionId, chatId, itemId)`

按 `itemId` 从队列中删除一条消息，返回删除后的队列。

#### `markInFlight(connectionId, chatId, itemId, inFlight)`

标记某条消息的投递状态。`inFlight = true` 表示正在发送中，防止重复投递。

#### `clearInFlight(connectionId, chatId)`

清除队列中所有消息的 `inFlight` 标记（通常在连接断开时调用，允许重新尝试发送）。

#### `canFlush(connectionId, chatId)`

检查队列中是否有未处于 `inFlight` 状态的消息可供发送。

### 重试逻辑

每条消息自带 `retryCount` 计数器。上层代码在重新投递失败时递增此值。`inFlight` 标记防止同一条消息被并发发送：发送前设置为 `true`，成功后 `remove`，失败后重置为 `false`。

## 错误处理

错误模块 (`utils/errors.js`) 提供统一的错误分类和用户友好提示。

### 错误码映射表

| 错误码 | 用户提示 |
|--------|----------|
| `NOT_CONNECTED` | 连接已断开，请重试 |
| `SEND_FAILED` | 发送失败，请重试 |
| `TIMEOUT` | 请求超时，请稍后再试 |
| `RATE_LIMITED` | 发太快了，请稍后再试 |
| `FORBIDDEN` | 没有权限执行这个操作 |
| `UNAUTHORIZED` | 登录状态失效，请重新连接 |
| `STORAGE_FULL` | 本地空间不足，请清理后重试 |
| `STORAGE_FAILED` | 本地保存失败 |
| `MEDIA_TOO_LARGE` | 离线文件太大，暂不支持 |
| `UNSUPPORTED_OFFLINE_MEDIA` | 离线状态下暂不支持媒体重发 |
| `INVALID_MESSAGE` | 消息格式不正确 |
| `UNKNOWN` | 出了点问题，请稍后重试 |

### 分类策略

错误分类采用 **code-first, string-fallback** 策略：

1. 如果错误对象已携带 `code` 且已知，直接使用
2. 否则对错误消息文本做字符串匹配（`toLowerCase` 后检查关键词）

字符串匹配规则（按优先级排序）：

| 匹配关键词 | 分类为 |
|------------|--------|
| `not connected` / `socket is not connected` / `closed` | `NOT_CONNECTED` |
| `timeout` | `TIMEOUT` |
| `rate` / `too many` / `429` | `RATE_LIMITED` |
| `forbidden` / `permission denied` | `FORBIDDEN` |
| `unauthorized` / `401` / `token` | `UNAUTHORIZED` |
| `storage` + `limit` | `STORAGE_FULL` |
| `storage` | `STORAGE_FAILED` |
| `send` | `SEND_FAILED` |

### API

- `normalizeError(input, source)` -- 将任意错误输入标准化为 `{ code, message, source }` 对象
- `humanizeError(input, source)` -- 直接返回用户友好的提示字符串
- `ERROR_TEXT_BY_CODE` -- 错误码到提示文本的映射对象，可用于自定义扩展

## Markdown 渲染

Markdown 解析器 (`utils/markdown.js`) 是一个轻量级实现，将 Markdown 文本转换为类型化节点数组，供 WXML 模板渲染。

### 支持的语法

| 语法 | 示例 | 节点类型 |
|------|------|----------|
| 段落 | 普通文本 | `paragraph` |
| 标题 | `#` / `##` / `###` | `heading`（level 1-3） |
| 粗体 | `**文本**` | inline `bold` |
| 行内代码 | `` `code` `` | inline `code` |
| 代码块 | ` ```lang ... ``` ` | `codeblock` |
| 无序列表 | `- item` 或 `* item` | `ul` |
| 有序列表 | `1. item` | `ol` |
| 引用 | `> text` | `blockquote` |
| 链接 | `[text](url)` | inline `link` |
| 分隔线 | `---` 或 `***` | `hr` |

### 节点树结构

`parseMarkdown(text)` 返回一个节点数组，每个节点的结构取决于其类型：

```js
// 块级节点
{ type: 'paragraph', segments: [InlineSegment, ...] }
{ type: 'heading', level: 1|2|3, segments: [InlineSegment, ...] }
{ type: 'codeblock', text: '...', lang: 'js' }
{ type: 'blockquote', segments: [InlineSegment, ...] }
{ type: 'ul', items: [{ segments: [InlineSegment, ...] }, ...] }
{ type: 'ol', items: [{ segments: [InlineSegment, ...] }, ...] }
{ type: 'hr' }

// 行内段
InlineSegment = 
  | { type: 'text', text: '...' }
  | { type: 'bold', text: '...' }
  | { type: 'code', text: '...' }
  | { type: 'link', text: '...', href: '...' }
```

空输入或解析结果为空时，返回包含单个空段落节点的数组作为兜底。

### 限制与已知问题

- **仅支持 1-3 级标题**，`####` 及更深层级不会被识别为标题
- **不支持斜体**（`*text*`），仅支持粗体（`**text**`）
- **不支持嵌套列表**，列表只能是单层
- **不支持表格语法**
- **不支持图片语法** `![alt](src)` -- 需要通过 `message-bubble` 组件单独处理媒体消息
- **链接不可直接跳转** -- 小程序环境限制，点击链接时复制到剪贴板并提示"链接已复制"
- **多行引用不合并** -- 连续的 `>` 行各自生成独立的 `blockquote` 节点
- 行内语法不支持嵌套（例如 `` **`bold code`** `` 不会同时生效）

## 组件 API

### message-bubble

消息气泡组件，支持 Markdown 渲染、回复引用、表情反应等。

**Properties:**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `message` | Object | `{}` | 消息对象，包含 `id`、`text`、`sender`、`replyTo`、`quotedText` 等字段 |
| `messages` | Array | `[]` | 当前会话的全部消息列表，用于本地查找回复引用的原始消息 |
| `agentEmoji` | String | `'🤖'` | Agent 头像 emoji |
| `agentName` | String | `''` | Agent 名称 |
| `grouped` | Boolean | `false` | 是否与上一条消息归为同一组（隐藏头像和时间） |
| `isActive` | Boolean | `false` | 是否处于选中状态（显示操作菜单） |
| `delay` | Number | `0` | 入场动画延迟（毫秒） |

**Events:**

| 事件 | detail | 说明 |
|------|--------|------|
| `select` | `{ messageId }` | 点击气泡 |
| `reaction` | `{ messageId }` | 长按气泡或点击表情按钮 |
| `editmsg` | `{ messageId }` | 点击编辑 |
| `deletemsg` | `{ messageId }` | 点击删除 |
| `replymsg` | `{ messageId }` | 点击回复 |
| `retrymsg` | `{ messageId }` | 点击重试（发送失败时） |

### emoji-picker

Emoji 选择面板。

**Properties:**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `visible` | Boolean | `false` | 是否显示 |
| `emojiList` | Array | `[]` | 可选 emoji 列表 |

**Events:**

| 事件 | detail | 说明 |
|------|--------|------|
| `select` | `{ emoji }` | 选择了某个 emoji |
| `close` | -- | 关闭面板 |

### bottom-nav

底部导航栏。

**Properties:**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `items` | Array | `[]` | 导航项数组，每项包含 `screen`、`icon` 等字段 |
| `currentScreen` | String | `''` | 当前激活的 screen 标识 |
| `safeAreaBottom` | Number | `0` | 底部安全区域高度（px），用于适配全面屏 |

**Events:**

| 事件 | detail | 说明 |
|------|--------|------|
| `navigate` | `{ screen }` | 点击导航项 |

### icon

图标组件，通过 name + tone 映射到 SVG 资源。

**Properties:**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `name` | String | `''` | 图标名称（如 `message-circle`、`search`、`send`） |
| `tone` | String | `'dark'` | 色调（`dark`、`green`、`white`、`blue`） |
| `size` | String | `'40rpx'` | 图标尺寸，支持 rpx/px 单位 |
| `extraClass` | String | `''` | 附加 CSS 类名 |

资源映射格式为 `{name}:{tone}`，查找顺序：精确匹配 -> `{name}:dark` 兜底。

### floating-panel

浮动面板（底部弹出层）。

**Properties:**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `visible` | Boolean | `false` | 是否显示 |
| `extraClass` | String | `''` | 附加 CSS 类名 |

**Events:**

| 事件 | detail | 说明 |
|------|--------|------|
| `close` | -- | 关闭面板（点击遮罩层） |

### glass-card

毛玻璃风格卡片容器。

**Properties:**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `extraClass` | String | `''` | 附加 CSS 类名 |
| `padded` | Boolean | `true` | 是否有内边距 |

无自定义事件。

### setting-item

设置页列表项。

**Properties:**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `item` | Object | `{}` | 配置对象，包含 `key`、`hasToggle`、`navigateTo` 等字段 |

**Events:**

| 事件 | detail | 说明 |
|------|--------|------|
| `tap` | `{ key, navigateTo }` | 点击（非 toggle 项） |
| `toggle` | `{ key }` | 点击 toggle 类型的项 |

### chat-item

聊天列表项。

**Properties:**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `chat` | Object | `{}` | 聊天对象，需包含 `id` 字段 |
| `delay` | Number | `0` | 入场动画延迟（毫秒） |

**Events:**

| 事件 | detail | 说明 |
|------|--------|------|
| `open` | `{ chatId }` | 点击打开聊天 |

### progress-bar

进度条。

**Properties:**

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `value` | Number | `0` | 进度值（0-100） |
| `color` | String | `'#67B88B'` | 进度条颜色 |
| `compact` | Boolean | `false` | 紧凑模式（更小的高度） |

无自定义事件。

## 深度链接

配对页面 (`pages/pairing/index.js`) 中的 `parseConnectionUrl` 函数支持三种 URL 格式：

### ws:// / wss:// 格式

直接使用 WebSocket 地址，查询参数作为连接配置：

```
wss://example.com/ws?chatId=abc&token=xxx&senderId=user1
```

解析流程：将 `ws://` 替换为 `http://` 后提取查询参数，`?` 之前的部分作为 `serverUrl`。

### openclaw:// 自定义 Scheme

```
openclaw://connect?serverUrl=wss://example.com/ws&token=xxx&chatId=abc&displayName=Test
```

解析流程：将 `openclaw://` 替换为 `https://` 后提取查询参数。`serverUrl` 参数为必填，其他参数可选。

### 支持的查询参数

| 参数 | 说明 | 是否必填 |
|------|------|----------|
| `serverUrl` | WebSocket 服务器地址（仅 openclaw:// 格式需要） | 视格式而定 |
| `chatId` | 聊天 ID | 否 |
| `token` | 认证令牌 | 否 |
| `senderId` | 发送者 ID | 否 |
| `displayName` | 显示名称 | 否 |
| `channelName` | 频道名称（用于连接标签） | 否 |
| `agentId` | Agent ID | 否 |

### 入口方式

- **手动输入 URL** -- 粘贴到配对页面的 URL 输入框
- **剪贴板粘贴** -- 点击粘贴按钮自动读取
- **扫描二维码** -- 二维码内容为上述任意格式的 URL

无论哪种入口，都经过 `parseConnectionUrl` 统一解析后调用 `activateParsedConnection` 完成连接配置。

## 性能优化

### setData 调用优化

微信小程序中 `setData` 是跨线程通信的瓶颈。项目中采用了以下策略：

1. **合并 setData** -- 使用 `Object.assign` 将多个字段合并为单次 `setData` 调用，例如消息同步时同时更新 `messages`、`displayMessages` 和建议栏状态
2. **隐藏页面不更新** -- 页面 `onHide` 时通过 `wsPool.rebind` 将回调设为 `null`，阻止 WebSocket 消息触发已隐藏页面的 `setData`
3. **发送锁** -- `_sendLock` 加 300ms 冷却时间，防止快速连点导致重复发送和多次 `setData`

### 消息上限

内存中最多保留 **300 条**消息。`syncMessages` 方法在合并去重后，如果总数超过 300，会截取最新的 300 条：

```js
if (merged.length > 300) {
  merged = merged.slice(merged.length - 300);
}
```

这避免了大量消息导致 `setData` 序列化耗时过长。

### 搜索防抖

搜索页面 (`pages/search/index.js`) 对输入事件做了 **250ms** 防抖处理：

```js
this._searchDebounce = setTimeout(() => {
  this._doSearch(query);
}, 250);
```

每次输入都会清除上一个定时器，确保用户停止输入 250ms 后才执行搜索。

### 连接池复用

如上文「WebSocket 连接池」所述，15 秒宽限期避免了页面切换时反复建立 WebSocket 连接。这对用户在聊天列表和聊天室之间频繁切换的场景尤为重要 -- 每次握手通常需要数百毫秒，复用连接可将页面切换延迟降低到接近零。

### 心跳保活

`GenericChannelClient` 配置了 **25 秒**间隔的心跳包（`HEARTBEAT_INTERVAL_MS`），如果 **10 秒**内未收到 pong 响应（`HEARTBEAT_TIMEOUT_MS`），则判定连接已死并触发重连。最大重连次数为 **6 次**（`MAX_RECONNECT_ATTEMPTS`）。

### LRU 缓存

离线发件箱的 LRU 缓存避免了每次操作都进行 `JSON.parse` / `JSON.stringify` 和 `wx.getStorageSync` 调用，将热路径的开销降到最低。
