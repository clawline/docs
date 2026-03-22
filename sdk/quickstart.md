# 快速开始

## 安装

```bash
npm install @clawlines/sdk
```

Node.js 环境还需要：

```bash
npm install ws
```

## 基础用法

```typescript
import { ClawlineClient } from '@clawlines/sdk'

const client = new ClawlineClient({
  url: 'ws://localhost:3100',        // 直连模式
  // url: 'wss://gateway.clawlines.net/client',  // Relay 模式
  senderId: 'alice',
  senderName: 'Alice',
  token: 'your-secret-token',        // 如果启用了鉴权
})

// 监听事件
client.on('connected', () => {
  console.log('✅ 已连接')
  client.sendText('你好！')
})

client.on('message', (packet) => {
  if (packet.type === 'text.delta') {
    // 流式文本片段
    process.stdout.write(packet.data.content ?? '')
  }
  if (packet.type === 'message.receive') {
    // 完整消息
    console.log('\n📩', packet.data.content)
  }
})

client.on('typing', (agentIds) => {
  console.log('⌨️ 正在输入:', agentIds)
})

client.on('error', (err) => {
  console.error('❌', err.message)
})

// 连接
client.connect()
```

## Node.js 完整示例

```typescript
// chat.ts — 命令行聊天客户端
import { ClawlineClient } from '@clawlines/sdk'
import * as readline from 'node:readline'

const client = new ClawlineClient({
  url: process.env.CLAWLINE_URL || 'ws://localhost:3100',
  senderId: 'cli-user',
  senderName: 'CLI',
  token: process.env.CLAWLINE_TOKEN,
})

let streaming = false

client.on('connected', () => {
  console.log('Connected. Type a message and press Enter.\n')
  client.requestAgentList()
})

client.on('agentList', (agents) => {
  console.log('Available agents:', agents.map(a => `${a.identityEmoji || '🤖'} ${a.name}`).join(', '))
})

client.on('message', (packet) => {
  switch (packet.type) {
    case 'text.delta':
      if (!streaming) {
        process.stdout.write('\n🤖 ')
        streaming = true
      }
      process.stdout.write(packet.data.content ?? '')
      break
    case 'text.done':
    case 'message.receive':
      if (streaming) {
        process.stdout.write('\n\n')
        streaming = false
      } else if (packet.data.content) {
        console.log(`\n🤖 ${packet.data.content}\n`)
      }
      break
  }
})

client.on('disconnected', () => {
  console.log('Disconnected.')
  process.exit(0)
})

client.connect()

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
rl.on('line', (line) => {
  const text = line.trim()
  if (!text) return
  if (text === '/quit') {
    client.close()
    return
  }
  if (text.startsWith('/agent ')) {
    client.selectAgent(text.slice(7).trim())
    console.log(`Switched agent to: ${text.slice(7).trim()}`)
    return
  }
  client.sendText(text)
})
```

运行：

```bash
npx tsx chat.ts
# 或指定地址和 token
CLAWLINE_URL=wss://gateway.clawlines.net/client CLAWLINE_TOKEN=xxx npx tsx chat.ts
```

## 浏览器用法

```html
<script type="module">
import { ClawlineClient } from 'https://esm.sh/@clawlines/sdk'

const client = new ClawlineClient({
  url: 'wss://gateway.clawlines.net/client',
  senderId: 'web-user',
  senderName: 'Web User',
  token: 'your-token',
})

client.on('message', (packet) => {
  document.getElementById('output').textContent += packet.data.content ?? ''
})

client.connect()

document.getElementById('send').onclick = () => {
  const input = document.getElementById('input')
  client.sendText(input.value)
  input.value = ''
}
</script>
```
