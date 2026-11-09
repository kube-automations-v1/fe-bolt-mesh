import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // em produção o Traefik serve em /node/bolt-mesh (strip-prefix); no dev fica em /
  base: command === 'build' ? '/node/bolt-mesh/' : '/',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/java/engine-bolt-mesh/api/v1': {
        target: 'http://automation-v1',
        changeOrigin: true,
      },
    },
  },
}))
