<script setup>
import { useData } from 'vitepress'
const { frontmatter } = useData()
</script>

<template>
  <div class="home-page">
    <!-- Hero -->
    <section class="hero">
      <div class="hero-inner">
        <img src="/images/clawline-logo-wide.png" alt="Clawline" class="hero-logo" />
        <h1 class="hero-title">
          让 AI Agent<br>
          <span class="hero-highlight">拥有自己的前端</span>
        </h1>
        <p class="hero-desc">
          一个插件起步，按需叠加。不依赖任何第三方平台，<br class="hide-mobile">
          从内网直连到公网部署，Clawline 都能覆盖。
        </p>
        <div class="hero-actions">
          <a href="/guide/quickstart" class="btn btn-primary">快速开始</a>
          <a href="/guide/what-is" class="btn btn-ghost">了解更多 →</a>
        </div>
      </div>
    </section>

    <!-- Pain points -->
    <section class="section section-pain">
      <div class="section-inner">
        <h2 class="section-title">没有 Clawline 的世界</h2>
        <div class="pain-grid">
          <div class="pain-card">
            <div class="pain-icon">🔒</div>
            <h3>被平台绑架</h3>
            <p>用户必须装 Telegram、Discord 或微信才能用你的 Agent。UI 不可控，数据在别人手里，被封号就断联。</p>
          </div>
          <div class="pain-card">
            <div class="pain-icon">🔧</div>
            <h3>从零造轮子</h3>
            <p>自己搭？WebSocket 连接管理、鉴权、消息路由、文件上传、断线重连、流式渲染……工程量巨大。</p>
          </div>
          <div class="pain-card">
            <div class="pain-icon">🌐</div>
            <h3>内网出不去</h3>
            <p>传统 Webhook 要求 Agent 有公网 IP。内网部署？得用 ngrok 穿透，不稳定还有安全风险。</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Two modes -->
    <section class="section section-modes">
      <div class="section-inner">
        <h2 class="section-title">两种部署，一套方案</h2>
        <div class="modes-grid">
          <div class="mode-card">
            <div class="mode-header">
              <span class="mode-badge mode-simple">简单</span>
              <h3>直连模式</h3>
            </div>
            <div class="mode-diagram">
              <div class="mode-node">浏览器</div>
              <div class="mode-arrow">ws://</div>
              <div class="mode-node mode-node-agent">Agent + Plugin</div>
            </div>
            <p>装插件 → 配 WebSocket → 2 分钟跑通。<br>内网、本机、局域网——零额外服务。</p>
          </div>
          <div class="mode-card">
            <div class="mode-header">
              <span class="mode-badge mode-relay">跨网络</span>
              <h3>Relay 模式</h3>
            </div>
            <div class="mode-diagram">
              <div class="mode-node">浏览器</div>
              <div class="mode-arrow">wss://</div>
              <div class="mode-node mode-node-relay">Relay</div>
              <div class="mode-arrow">←wss://</div>
              <div class="mode-node mode-node-agent">Agent</div>
            </div>
            <p>加一个 Relay Gateway，Agent 主动连出。<br>无需开端口，穿透防火墙。</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Components -->
    <section class="section section-components">
      <div class="section-inner">
        <h2 class="section-title">四个组件</h2>
        <p class="section-subtitle">按需组合。只有 Channel Plugin 是必须的。</p>
        <div class="comp-grid">
          <a href="/channel/" class="comp-card">
            <div class="comp-required">核心</div>
            <h3>📡 Channel Plugin</h3>
            <p>OpenClaw 插件。装了它，Agent 就能通过 WebSocket 收发消息。支持直连和 Relay 两种模式。</p>
            <code>openclaw plugins install @clawlines/clawline</code>
          </a>
          <a href="/sdk/" class="comp-card">
            <div class="comp-optional">可选</div>
            <h3>📦 Client SDK</h3>
            <p>TypeScript SDK。想自己写前端？用它连接 Agent，10 行代码收发消息。浏览器 + Node.js 双平台。</p>
            <code>npm install @clawlines/sdk</code>
          </a>
          <a href="/client-web/" class="comp-card">
            <div class="comp-optional">可选</div>
            <h3>💬 Client Web</h3>
            <p>开箱即用的聊天前端。React + Vite，PWA 支持。流式渲染、文件上传、断线续传。不想自己写前端就用它。</p>
          </a>
          <a href="/gateway/" class="comp-card">
            <div class="comp-optional">可选</div>
            <h3>🌐 Relay Gateway</h3>
            <p>WebSocket 中转网关。管理连接、鉴权、文件上传。只在需要跨网络部署时才需要。</p>
          </a>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="section section-cta">
      <div class="section-inner">
        <h2>2 分钟，让你的 Agent 上线</h2>
        <p>一个命令安装插件，一个配置开启 WebSocket。就这么简单。</p>
        <a href="/guide/quickstart" class="btn btn-primary btn-lg">开始 →</a>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home-page {
  font-family: var(--cl-font-body);
  color: var(--cl-text);
}

/* Hero */
.hero {
  padding: 6rem 1.5rem 4rem;
  text-align: center;
  background: var(--cl-bg);
  border-bottom: 1px solid var(--cl-border);
}
.hero-inner {
  max-width: 720px;
  margin: 0 auto;
}
.hero-logo {
  display: block;
  max-width: 360px;
  height: auto;
  margin: 0 auto 1.5rem;
}
@media (max-width: 639px) {
  .hero-logo { max-width: 240px; }
}
.hero-title {
  font-family: var(--cl-font-display);
  font-size: clamp(2.4rem, 5vw, 3.6rem);
  font-weight: 400;
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin: 0 0 1.5rem;
}
.hero-highlight {
  color: var(--cl-brand);
}
.hero-desc {
  font-size: clamp(1rem, 2vw, 1.15rem);
  line-height: 1.7;
  color: var(--cl-text-secondary);
  margin: 0 0 2rem;
}
.hide-mobile {
  display: none;
}
@media (min-width: 640px) {
  .hide-mobile { display: inline; }
}

/* Buttons */
.btn {
  display: inline-block;
  font-size: 0.95rem;
  font-weight: 500;
  text-decoration: none;
  border-radius: 6px;
  padding: 0.65em 1.5em;
  transition: all 0.2s ease;
}
.btn-primary {
  background: var(--cl-brand);
  color: white;
}
.btn-primary:hover {
  background: var(--cl-brand-dim);
}
.btn-ghost {
  color: var(--cl-text-secondary);
  border: 1px solid var(--cl-border-strong);
}
.btn-ghost:hover {
  color: var(--cl-text);
  border-color: var(--cl-text);
}
.btn-lg {
  font-size: 1.1rem;
  padding: 0.75em 2em;
}
.hero-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  flex-wrap: wrap;
}

/* Sections */
.section {
  padding: 4rem 1.5rem;
}
.section-inner {
  max-width: 960px;
  margin: 0 auto;
}
.section-title {
  font-family: var(--cl-font-display);
  font-size: clamp(1.6rem, 3vw, 2.2rem);
  font-weight: 400;
  letter-spacing: -0.01em;
  margin: 0 0 0.5rem;
  text-align: center;
}
.section-subtitle {
  text-align: center;
  color: var(--cl-text-secondary);
  margin: 0 0 2.5rem;
}

/* Pain points */
.section-pain {
  background: var(--cl-bg);
}
.section-pain .section-title {
  margin-bottom: 2.5rem;
}
.pain-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1.5rem;
}
.pain-card {
  padding: 1.5rem;
  border-left: 3px solid var(--cl-border-strong);
}
.pain-icon {
  font-size: 1.3rem;
  margin-bottom: 0.5rem;
}
.pain-card h3 {
  font-family: var(--cl-font-body);
  font-size: 1.05rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
}
.pain-card p {
  font-size: 0.9rem;
  line-height: 1.65;
  color: var(--cl-text-secondary);
  margin: 0;
}

/* Modes */
.section-modes {
  background: var(--cl-bg-elevated);
  border-top: 1px solid var(--cl-border);
  border-bottom: 1px solid var(--cl-border);
}
.section-modes .section-title {
  margin-bottom: 2.5rem;
}
.modes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
}
.mode-card {
  padding: 2rem;
  border: 1px solid var(--cl-border);
  border-radius: 8px;
  background: var(--cl-bg);
}
.mode-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}
.mode-badge {
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 0.2em 0.6em;
  border-radius: 4px;
}
.mode-simple {
  background: oklch(90% 0.08 145);
  color: oklch(30% 0.08 145);
}
.mode-relay {
  background: oklch(90% 0.08 250);
  color: oklch(30% 0.08 250);
}
.mode-header h3 {
  font-size: 1.15rem;
  font-weight: 600;
  margin: 0;
}
.mode-diagram {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 0;
  margin-bottom: 1rem;
  overflow-x: auto;
}
.mode-node {
  font-size: 0.78rem;
  font-weight: 500;
  padding: 0.4em 0.8em;
  border-radius: 6px;
  border: 1px solid var(--cl-border-strong);
  background: var(--cl-bg-elevated);
  white-space: nowrap;
}
.mode-node-agent {
  border-color: var(--cl-brand);
  color: var(--cl-brand);
}
.mode-node-relay {
  border-color: oklch(55% 0.12 250);
  color: oklch(55% 0.12 250);
}
.mode-arrow {
  font-family: var(--cl-font-mono);
  font-size: 0.72rem;
  color: var(--cl-text-muted);
  white-space: nowrap;
}
.mode-card p {
  font-size: 0.9rem;
  line-height: 1.65;
  color: var(--cl-text-secondary);
  margin: 0;
}

/* Components */
.section-components {
  background: var(--cl-bg);
}
.section-components .section-title {
  margin-bottom: 0.25rem;
}
.comp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
  gap: 1.5rem;
}
.comp-card {
  display: block;
  padding: 1.5rem;
  border: 1px solid var(--cl-border);
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.comp-card:hover {
  border-color: var(--cl-brand);
  box-shadow: 0 2px 12px oklch(55% 0.14 30 / 0.08);
}
.comp-required, .comp-optional {
  display: inline-block;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 0.15em 0.5em;
  border-radius: 3px;
  margin-bottom: 0.75rem;
}
.comp-required {
  background: oklch(90% 0.08 30);
  color: oklch(40% 0.12 30);
}
.comp-optional {
  background: oklch(92% 0.02 60);
  color: oklch(45% 0.02 60);
}
.comp-card h3 {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
}
.comp-card p {
  font-size: 0.88rem;
  line-height: 1.6;
  color: var(--cl-text-secondary);
  margin: 0 0 0.75rem;
}
.comp-card code {
  display: block;
  font-family: var(--cl-font-mono);
  font-size: 0.78rem;
  color: var(--cl-text-muted);
  background: oklch(95% 0.005 60);
  padding: 0.5em 0.75em;
  border-radius: 4px;
  overflow-x: auto;
}
.dark .comp-card code {
  background: oklch(20% 0.005 60);
}

/* CTA */
.section-cta {
  text-align: center;
  background: var(--cl-bg-elevated);
  border-top: 1px solid var(--cl-border);
  padding: 4rem 1.5rem;
}
.section-cta h2 {
  font-family: var(--cl-font-display);
  font-size: clamp(1.5rem, 3vw, 2rem);
  font-weight: 400;
  margin: 0 0 0.75rem;
}
.section-cta p {
  color: var(--cl-text-secondary);
  margin: 0 0 1.5rem;
}

/* Mobile */
@media (max-width: 639px) {
  .hero { padding: 4rem 1.25rem 3rem; }
  .section { padding: 3rem 1.25rem; }
  .mode-diagram { font-size: 0.72rem; }
}
</style>
