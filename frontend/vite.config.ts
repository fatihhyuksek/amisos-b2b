import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Geliştirmede /api istekleri backend'e (NestJS, port 3000) yönlendirilir.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
