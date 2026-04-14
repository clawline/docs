# ACP 线程支持

Clawline 支持 [ACP（Agent Collaboration Protocol）](https://docs.openclaw.ai/tools/acp-agents) 线程，允许 Agent 在对话中启动子 Agent 会话。用户可以通过 `/acp spawn` 命令创建持久化或临时的子 Agent 线程。

## 什么是 ACP

ACP 允许一个 OpenClaw Agent 启动另一个 Agent（如 Claude Code）作为子代理执行特定任务。子代理的消息通过 thread 机制与主对话隔离，在客户端展示为折叠的会话卡片。

## 使用方式

在 Clawline 聊天中发送 ACP 命令：

```
/acp spawn claude --mode persistent --thread auto
```

### 常用参数

| 参数 | 说明 |
|------|------|
| `claude` | 子 Agent 后端（使用官方 `@agentclientprotocol/claude-agent-acp`） |
| `--mode persistent` | 持久化模式，会话在对话结束后保留 |
| `--mode ephemeral` | 临时模式，任务完成后自动关闭 |
| `--thread auto` | 自动创建线程，消息按线程分组 |
| `--cwd /path/to/dir` | 指定子 Agent 的工作目录 |

### 示例

```
# 启动 Claude 持久会话
/acp spawn claude --mode persistent --thread auto

# 启动临时任务
/acp spawn claude --mode ephemeral --thread auto

# 指定工作目录
/acp spawn claude --mode persistent --thread auto --cwd /Users/me/project

# 关闭会话
/acp close
```

## 技术实现

### Virtual ThreadId 机制

Clawline 采用虚拟线程 ID 来支持 ACP 的 `--thread auto` 功能：

1. **生成**：当入站消息到达时，插件为每个对话生成唯一的 `clawline-thread-${UUID}` 作为虚拟线程 ID
2. **复用**：同一对话的后续消息会复用已有 ACP binding 的 threadId，保持会话连续性
3. **绑定**：threadId 设置为 `MessageThreadId`，使 ACP 运行时将 placement 解析为 `"current"`（复用当前线程，而非创建子线程）

### Session Binding 生命周期

```
用户消息 → 生成/复用 virtualThreadId
        → 设置 MessageThreadId
        → ACP 运行时创建 session binding
        → binding 存储 conversationId = "thread:{threadId}"
        → 子 Agent 回复通过 binding 路由到正确的 threadId
```

插件内维护一个 **内存态 SessionBindingAdapter**，支持按 conversationId、sessionKey、bindingId 三种索引查询。

### 回复路由

子 Agent 的回复通过两条路径之一发送到客户端：

1. **Outbound Adapter**（`dispatch-acp-delivery`）：读取 `MessageThreadId`，在回复中附带 `threadId`
2. **Reply Dispatcher**（持久模式回复）：每次投递时延迟解析 `threadId`，确保能找到 dispatch 期间新创建的 binding

两条路径均支持 `threadId` 透传，客户端收到后将消息归入对应的线程卡片。

### 消息持久化

带有 `threadId` 的消息会持久化到 Supabase 的 `cl_messages.thread_id` 字段，页面刷新后客户端从远程同步消息时能恢复线程分组。

## 客户端展示

### ThreadSessionCard

ACP session 在客户端以可折叠的卡片形式展示：
- 标题栏显示：`ACP Session · agent名 · mode`（如 persistent/ephemeral）
- 包含该线程的所有消息（Agent 回复 + 用户发送）
- 活跃 session 显示关闭按钮（发送 `/acp close`）
- 呼吸灯动画标识活跃状态

### ACP Session Bar

输入框上方显示 session 切换条（仅在有 ACP session 时出现）：
- 水平滚动的 chip 列表
- 每个 chip 显示：mode + sessionId 片段 + 消息数
- 点击 chip 切换 `activeThreadId`，后续发送的消息自动路由到该 session
- 当前活跃 session 高亮显示

## 配置

ACP 线程功能需要以下条件：

1. **OpenClaw 配置**：在 `~/.openclaw/openclaw.json` 的 `plugins` 中启用 `acpx` 后端
2. **子 Agent 安装**：确保 `@agentclientprotocol/claude-agent-acp` 已安装
3. **API 密钥**：子 Agent（如 Claude）需要对应的 API 密钥环境变量

```json
{
  "plugins": {
    "acpx": {
      "enabled": true
    }
  }
}
```

> 使用自定义 API URL 时，需要在启动环境中设置 `ANTHROPIC_BASE_URL` 和 `ANTHROPIC_API_KEY` 环境变量。如果通过 launchd 管理进程，需要在 plist 文件中添加这些环境变量。

## 断点续传

Clawline 的流式输出支持跨断线恢复（断点续传）：

- 每个正在进行的流按 `chatId::agentId` 键存储累积文本
- 客户端重连时，如果 URL 中携带 `agentId`，服务端发送 `stream.resume` 事件
- 已完成的流通过 `markStreamCompleted()` 标记，30 分钟后自动清理
