import { defineConfig } from 'vitepress'

export default defineConfig({
  title: '~tilde',
  description: 'A geometric programming language for school-level geometry',
  base: '/',

  vite: {
    server: {
      proxy: {
        '/playground': {
          target: 'http://localhost:5174',
          changeOrigin: true,
          ws: true,
        },
      },
    },
  },

  themeConfig: {
    nav: [
      { text: 'Playground', link: '/playground/' },
      { text: 'Elements', link: '/elements' },
      { text: 'Constraints', link: '/constraints' },
      { text: 'Solver', link: '/solver' },
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is Tilde?', link: '/' },
          { text: 'Getting Started', link: '/getting-started' },
        ],
      },
      {
        text: 'Language',
        items: [
          { text: 'Elements', link: '/elements' },
          { text: 'Constraints', link: '/constraints' },
          { text: 'Pick', link: '/pick' },
          { text: 'Settings', link: '/settings' },
        ],
      },
      {
        text: 'Internals',
        items: [
          { text: 'Solver', link: '/solver' },
          { text: 'Certainty Model', link: '/certainty' },
        ],
      },
      {
        text: 'Meta',
        items: [
          { text: 'Changelog', link: '/changelog' },
        ],
      },
    ],

    socialLinks: [],
    footer: { message: '~tilde — geometric language' },
  },
})
