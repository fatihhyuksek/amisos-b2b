import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Port doluysa başka porta kayma; açık hata ver (eski bir sunucu açık kalmış olabilir).
    port: 5180,
    strictPort: true,
    // Geliştirmede /api istekleri backend'e (NestJS, port 3100) yönlendirilir.
    proxy: {
      '/api': 'http://localhost:3100',
    },
  },
})
