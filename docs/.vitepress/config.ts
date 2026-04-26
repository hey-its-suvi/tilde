import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(defineConfig({
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
      { text: 'Solver', link: '/solver/' },
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
          {
            text: 'Solver',
            link: '/solver/',
            items: [
              { text: 'Pass 0 — Unit Resolution', link: '/solver/unit-resolution' },
              { text: 'Pass 1 — Constraint Model', link: '/solver/constraint-model' },
              { text: 'Pass 2 — Anchor', link: '/solver/anchor' },
              { text: 'Pass 3 — Placement', link: '/solver/placement' },
            ],
          },
          { text: 'Certainty Model', link: '/certainty' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Language Reference', link: '/reference' },
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

  mermaid: {},
}))
