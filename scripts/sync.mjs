#!/usr/bin/env node
/**
 * sync.mjs — 构建前从三个 Clawline repo 拉最新 docs/ 到本站对应目录
 * 
 * 目录映射：
 *   gateway/docs/*  → ./gateway/  (跳过 index.md，保留本站的概述)
 *   channel/docs/*  → ./channel/  (同上)
 *   client-web/docs/* → ./client-web/ (同上)
 * 
 * 本地开发时直接从 workspace 读取；CI 环境从 git clone 读取。
 */
import { cpSync, existsSync, readdirSync } from 'fs'
import { resolve, join } from 'path'

const ROOT = resolve(import.meta.dirname, '..')

// workspace 路径（本地开发）
const sources = [
  {
    name: 'gateway',
    workspace: resolve(ROOT, '../workspace-clawline-gateway/repo/docs'),
    dest: resolve(ROOT, 'gateway'),
  },
  {
    name: 'channel',
    workspace: resolve(ROOT, '../workspace-clawline-channel/repo/docs'),
    dest: resolve(ROOT, 'channel'),
  },
  {
    name: 'client-web',
    workspace: resolve(ROOT, '../workspace-clawline-client-web/repo/docs'),
    dest: resolve(ROOT, 'client-web'),
  },
]

for (const { name, workspace, dest } of sources) {
  if (!existsSync(workspace)) {
    console.log(`⏭️  ${name}: docs/ not found at ${workspace}, skipping`)
    continue
  }

  const files = readdirSync(workspace).filter(f => f.endsWith('.md'))
  let copied = 0
  
  for (const file of files) {
    // 不覆盖本站的 index.md（概述页由本站维护）
    if (file === 'index.md' || file === 'README.md') continue
    
    cpSync(join(workspace, file), join(dest, file))
    copied++
  }
  
  console.log(`✅ ${name}: synced ${copied} files from ${workspace}`)
}

console.log('🎉 Sync complete')
