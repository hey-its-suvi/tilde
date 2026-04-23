import DefaultTheme from 'vitepress/theme'
import TildeSketch from '../components/TildeSketch.vue'
import type { Theme } from 'vitepress'

export default {
  extends: DefaultTheme,
  enhanceApp({ app, router }) {
    app.component('TildeSketch', TildeSketch)
    router.onBeforeRouteChange = (to) => {
      if (to.startsWith('/playground')) {
        window.location.href = to
        return false
      }
    }
  },
} satisfies Theme
