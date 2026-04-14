# Browser Agent

Clawline Browser Agent 是一个 Chrome 扩展，通过本地 Claude API 控制浏览器页面，实现 AI 驱动的网页自动化操作。它同时提供 HTTP Hook API，可作为外部系统的浏览器自动化工具。

## 架构

```
外部客户端 ──HTTP──→ Native Host (:4821) ──Native Messaging──→ Chrome Extension
                                                                    ↓
                                                              Content Script
                                                                    ↓
                                                                浏览器页面
```

三层组件：

| 组件 | 说明 |
|------|------|
| **Chrome Extension** | Manifest V3 扩展，包含 Side Panel、Content Script、Service Worker |
| **Native Messaging Host** | Node.js 进程，桥接 HTTP 请求和 Chrome 原生消息 |
| **HTTP Hook Server** | 监听 `127.0.0.1:4821`，提供 REST API |

## 安装

1. 在 Chrome 中打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择 browser-agent 目录
4. 安装 Native Messaging Host（首次使用需运行安装脚本）

## 使用方式

### Side Panel 交互

打开 Chrome Side Panel，直接输入自然语言任务：

> "帮我在这个页面找到搜索框，搜索 Clawline"

Agent 会自动执行截图 → 分析页面 → 操作元素的循环，直到任务完成。

### HTTP Hook API

外部程序通过 HTTP 接口远程控制 Agent：

#### POST /hook — 发送任务

```bash
curl -X POST http://127.0.0.1:4821/hook \
  -H "Content-Type: application/json" \
  -d '{
    "task": "点击页面上的登录按钮",
    "include_screenshot": true
  }'
```

**请求参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `task` | string | ✅ | 自然语言任务描述 |
| `windowId` | number | 否 | 指定浏览器窗口 |
| `tabId` | number | 否 | 指定标签页（优先于 windowId） |
| `conversationId` | string | 否 | 继续已有对话 |
| `model` | string | 否 | 模型：`claude-sonnet-4-6`、`claude-opus-4-6`、`claude-haiku-4-5-20251001` |
| `include_screenshot` | boolean | 否 | 返回最终截图的 base64 |
| `include_tools` | boolean | 否 | 返回工具调用记录 |

**响应示例：**

```json
{
  "type": "hook_response",
  "taskId": "task_xxx",
  "status": "completed",
  "result": "已成功点击登录按钮",
  "conversationId": "conv_xxx",
  "tabId": 12345,
  "screenshot": {
    "data": "base64...",
    "media_type": "image/png"
  }
}
```

#### GET /sessions — 列出活跃窗口

```bash
curl http://127.0.0.1:4821/sessions
```

#### GET /status/:taskId — 查询任务状态

```bash
curl http://127.0.0.1:4821/status/task_xxx
```

#### POST /stop/:taskId — 停止任务

```bash
curl -X POST http://127.0.0.1:4821/stop/task_xxx
```

#### GET / — 健康检查

返回服务状态和待处理任务数。

## 可用操作

Agent 通过 `computer` 工具执行以下操作：

### 页面交互

| 操作 | 说明 |
|------|------|
| `screenshot` | 截取当前视口，自动优化质量和分辨率 |
| `left_click` | 单击（支持坐标或元素引用） |
| `right_click` | 右键点击 |
| `double_click` | 双击 |
| `triple_click` | 三击（选中文本） |
| `type` | 输入文本 |
| `key` | 按键（支持 cmd/ctrl/shift/alt 修饰键） |
| `scroll` | 滚动（up/down/left/right） |
| `scroll_to` | 滚动元素到可视区域（使用元素引用） |
| `hover` | 悬停 |
| `left_click_drag` | 拖拽 |
| `wait` | 等待（最多 10 秒） |
| `zoom` | 放大特定区域进行检查（2 倍缩放） |

### 辅助工具

| 工具 | 说明 |
|------|------|
| `read_page` | 获取页面无障碍树 |
| `find` | 自然语言搜索页面元素 |
| `form_input` | 设置表单值 |
| `navigate` | 页面导航或浏览历史 |
| `get_page_text` | 提取页面纯文本 |
| `tabs_create` | 创建新标签页 |
| `tabs_context` | 列出所有标签页 |
| `read_console_messages` | 读取控制台日志 |
| `read_network_requests` | 读取网络请求 |
| `javascript_tool` | 执行 JavaScript |
| `file_upload` | 上传文件 |

## 配置

### 最大执行步数

在 Side Panel 头部选择执行步数上限：

- 25 步 — 简单任务
- 50 步 — 中等任务
- 200 步（默认）— 复杂任务
- 999 步 — 无限制

### 模型选择

支持三种 Claude 模型：

- **Sonnet 4.6**（默认）— 性价比最优
- **Opus 4.6** — 最强能力
- **Haiku 4.5** — 最快速度（Fast 模式自动启用）

### 扩展思考

启用 🧠 按钮后，Agent 在执行前会进行推理思考（budget: 10,000 tokens）。与 Fast 模式互斥。

## Tab 锁定

Agent 启动时会锁定当前标签页，即使用户切换标签也不影响 Agent 操作：

- 首次发送消息时自动锁定活跃标签页
- 标签页关闭时自动释放
- 点击「New Chat」时重置锁定

## 作为测试工具

Browser Agent 可用于 Clawline 客户端的端到端测试：

```bash
# 1. 获取活跃窗口
curl http://127.0.0.1:4821/sessions

# 2. 发送测试任务
curl -X POST http://127.0.0.1:4821/hook \
  -d '{"task": "在聊天框输入 hello 并发送", "include_screenshot": true}'

# 3. 验证结果
curl -X POST http://127.0.0.1:4821/hook \
  -d '{"task": "检查是否收到了 AI 回复", "conversationId": "conv_xxx"}'
```

通过 `conversationId` 参数可以在同一对话中发送多轮指令，实现复杂的测试流程。
