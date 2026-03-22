---
layout: home
hero:
  name: Clawline
  text: 让 AI Agent 拥有自己的前端
  tagline: OpenClaw 的 Web 接入方案 —— 一个插件起步，按需叠加
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/quickstart
    - theme: alt
      text: 了解架构
      link: /guide/architecture

features:
  - icon: 🚀
    title: 一个插件起步
    details: 安装 Channel Plugin，配置 WebSocket 模式，Agent 立刻拥有聊天能力。内网直连，零额外服务，最快 2 分钟跑通。
  - icon: 🔓
    title: 摆脱平台束缚
    details: 不再依赖 Telegram、Discord、微信。你的域名、你的 UI、你的数据。用户不需要安装任何第三方应用，打开浏览器就能和 Agent 对话。
  - icon: 🛡️
    title: 内网穿透，零端口暴露
    details: 需要公网访问？加一个 Relay Gateway。Agent 主动连出，无需开端口、无需公网 IP，防火墙友好。
  - icon: 🧩
    title: 可组合，可替换
    details: 只要 Plugin 就能跑；加 Relay 穿透网络；加 Client Web 获得现成 UI。每一层都可以独立替换。
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
