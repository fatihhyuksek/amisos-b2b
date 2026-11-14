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
      '/api': {
        target: 'http://localhost:3100',
        configure(proxy) {
          // Backend kapalıysa 503 + işaret başlığı: arayüz "sunucuya ulaşılamadı" gösterir.
          proxy.on('error', (_err, _req, res) => {
            if ('writeHead' in res && !res.headersSent) {
              res.writeHead(503, { 'content-type': 'application/json', 'x-backend-unreachable': '1' })
              res.end(JSON.stringify({ statusCode: 503, code: 'BACKEND_UNREACHABLE' }))
            }
          })
        },
      },
    },
  },
})
