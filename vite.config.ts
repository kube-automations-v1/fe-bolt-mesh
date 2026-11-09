import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/java/engine-bolt-mesh/api/v1': {
        target: 'http://automation-v1',
        changeOrigin: true,
      },
    },
  },
})
