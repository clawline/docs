---
layout: home
hero:
  name: Clawline
  text: 让 AI Agent 拥有自己的前端
  tagline: OpenClaw 的 Web 接入方案 —— 三个组件，零平台依赖
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/quickstart
    - theme: alt
      text: 了解架构
      link: /guide/architecture

features:
  - icon: 🔓
    title: 摆脱平台束缚
    details: 不再依赖 Telegram、Discord、微信。你的域名、你的 UI、你的数据。用户不需要安装任何第三方应用，打开浏览器就能和 Agent 对话。
  - icon: 🛡️
    title: 内网穿透，零端口暴露
    details: 传统方案需要 Agent 暴露公网端口等待 Webhook 回调。Clawline 反过来——Agent 主动连出到 Relay，无需开端口、无需公网 IP，防火墙友好。
  - icon: ⚡
    title: 开箱即用的完整体验
    details: 流式输出、文件上传、消息记忆、历史记录、断线续传——不是 Demo，是已验证的全链路。PWA 支持，移动端直接用。
  - icon: 🧩
    title: 可组合，可替换
    details: 只需要中转能力？用 Gateway + Channel，自己写前端。只想要现成 UI？Client Web 开箱即用。每一层都可以独立替换。
---

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: linear-gradient(135deg, #e8590c 0%, #d9480f 50%, #c92a2a 100%);
  --vp-home-hero-image-background-image: linear-gradient(135deg, #e8590c22 0%, #d9480f22 100%);
  --vp-home-hero-image-filter: blur(44px);
}

.VPFeature {
  border: 1px solid var(--vp-c-divider);
  transition: border-color 0.3s ease;
}
.VPFeature:hover {
  border-color: var(--vp-c-brand-1);
}
</style>
