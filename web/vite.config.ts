import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  // @matrix-org/olm's generated Emscripten bundle writes its runtime options
  // to OLM_OPTIONS before creating the WASM module. In an ES module that
  // identifier is not implicitly global, so map it to an explicit global
  // property for both Vite dev and production builds.
  define: {
    OLM_OPTIONS: 'globalThis.OLM_OPTIONS'
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
