import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

const backendUrl = process.env.VITE_DEV_BACKEND_URL || 'http://localhost:3000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/socket.io': {
        target: backendUrl,
        changeOrigin: true,
        ws: true,
      },
      '/webrtc': {
        target: backendUrl,
        changeOrigin: true,
        ws: true,
      },
      '/auth': {
        target: backendUrl,
        changeOrigin: true,
      },
    },
  },
})
