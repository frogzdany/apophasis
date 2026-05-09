import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // The published @a2ui/react package's exports field advertises a CSS
      // file that doesn't exist; the real one is at v0_9/index.css. Alias
      // through so we can import structural styles.
      '@a2ui-react-styles/v0_9': path.resolve(
        __dirname,
        './node_modules/@a2ui/react/v0_9/index.css',
      ),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
})
