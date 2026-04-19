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
| `form_input` | 设置单个表单值 |
| `batch_form_input` | 批量设置多个表单值（一次调用填写多个字段） |
| `navigate` | 页面导航或浏览历史 |
| `get_page_text` | 提取页面纯文本 |
| `tabs_create` | 创建新标签页 |
| `tabs_context` | 列出所有标签页 |
| `read_console_messages` | 读取控制台日志 |
| `read_network_requests` | 读取网络请求 |
| `resize_window` | 调整浏览器窗口大小 |
| `emulate_device` | 设备模拟（手机/平板视口、UA、触摸、DPR） |
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

启用思考按钮后，Agent 在执行前会进行推理思考（budget: 10,000 tokens）。与 Fast 模式互斥。

### 技能模式

在输入框工具栏选择 Agent 的行为模式：

| 模式 | 说明 |
|------|------|
| **General**（默认） | 自主解决问题，可调试，灵活应对 |
| **QA Test** | 严格按步骤执行，遇错只报 PASS/FAIL 不调查 |
| **Scraper** | 专注数据提取，自动处理分页，遇阻自行换策略 |
| **Custom** | 用户自定义行为指令 |

### 设备模拟

使用 `emulate_device` 工具切换移动端视口：

| 预设设备 | 分辨率 | DPR |
|---------|--------|-----|
| iPhone 14 | 390×844 | 3x |
| iPhone 14 Pro Max | 430×932 | 3x |
| iPhone SE | 375×667 | 2x |
| iPad | 810×1080 | 2x |
| iPad Pro | 1024×1366 | 2x |
| Pixel 7 | 412×915 | 2.625x |
| Galaxy S23 | 360×780 | 3x |
| desktop | 恢复桌面模式 | — |

模拟内容包含：视口大小、设备像素比、移动端 User Agent、触摸事件支持。

### API 配置

在设置面板（齿轮图标）中配置：

- **API URL** — 默认 `http://127.0.0.1:4819`（本地代理），也可直连 `https://api.anthropic.com`
- **API Key** — 填写后使用 `x-api-key` 头直连 Anthropic，留空则走本地代理

### 历史记录导入导出

在设置面板底部：

- **Export** — 导出所有对话历史为 JSON 文件
- **Import** — 导入 JSON 文件，自动合并不重复的对话

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
