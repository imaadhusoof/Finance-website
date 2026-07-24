import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The FastAPI backend runs separately on :8000. Proxying in dev means the
// frontend can use relative URLs and never deals with CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/health': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
