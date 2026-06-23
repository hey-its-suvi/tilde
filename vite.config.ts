import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  base: '/playground/',
  resolve: {
    alias: {
      '@lang': resolve(__dirname, 'src/lang'),
      '@renderer': resolve(__dirname, 'src/renderer'),
    },
  },
  server: {
    port: 5174,
  },
  test: {
    include: ['src/tests/**/*.test.ts'],
  },
})
