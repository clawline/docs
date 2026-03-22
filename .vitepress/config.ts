import { defineConfig } from 'vitepress'

export default defineConfig({
  ignoreDeadLinks: true,
  lang: 'zh-CN',
  title: 'Clawline',
  description: 'OpenClaw 的 Web 接入方案',
  
  head: [
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' }],
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }],
    ['meta', { name: 'theme-color', content: '#c05030' }],
  ],

  themeConfig: {
    logo: '/favicon-32x32.png',
    
    nav: [
      { text: '指南', link: '/guide/what-is' },
      { text: 'Relay Gateway', link: '/gateway/' },
      { text: 'Channel Plugin', link: '/channel/' },
      { text: 'Client Web', link: '/client-web/' },
      { text: 'SDK', link: '/sdk/' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '开始',
          items: [
            { text: '什么是 Clawline', link: '/guide/what-is' },
            { text: '架构概览', link: '/guide/architecture' },
            { text: '快速开始', link: '/guide/quickstart' },
          ]
        }
      ],
      '/gateway/': [
        {
          text: 'Relay Gateway',
          items: [
            { text: '概述', link: '/gateway/' },
            { text: '部署指南', link: '/gateway/deploy' },
            { text: 'API 参考', link: '/gateway/api' },
            { text: '管理后台', link: '/gateway/admin-ui' },
          ]
        }
      ],
      '/channel/': [
        {
          text: 'Channel Plugin',
          items: [
            { text: '概述', link: '/channel/' },
            { text: '安装配置', link: '/channel/setup' },
            { text: '接入指南', link: '/channel/INTEGRATION_GUIDE' },
            { text: '配置示例', link: '/channel/CONFIG_EXAMPLES_ZH' },
            { text: '主动 DM', link: '/channel/PROACTIVE_DM' },
          ]
        }
      ],
      '/client-web/': [
        {
          text: 'Client Web',
          items: [
            { text: '概述', link: '/client-web/' },
            { text: '功能说明', link: '/client-web/features' },
            { text: '部署指南', link: '/client-web/deploy' },
            { text: '定制指南', link: '/client-web/customize' },
          ]
        }
      ],
      '/sdk/': [
        {
          text: 'Client SDK',
          items: [
            { text: '概述', link: '/sdk/' },
            { text: '快速开始', link: '/sdk/quickstart' },
            { text: 'API 参考', link: '/sdk/api' },
          ]
        }
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/clawline' }
    ],

    footer: {
      message: 'Built for OpenClaw',
      copyright: '© 2026 Clawline'
    },

    search: {
      provider: 'local'
    },

    outline: {
      level: [2, 3],
      label: '目录'
    },

    lastUpdated: {
      text: '最后更新'
    }
  }
})
