import { defineConfig } from 'vite'
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
})
