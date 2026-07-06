import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const ts = Date.now()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-${ts}.js`,
        chunkFileNames: `assets/[name]-[hash]-${ts}.js`,
        assetFileNames: `assets/[name]-[hash]-${ts}.[ext]`,
      },
    },
  },
})
