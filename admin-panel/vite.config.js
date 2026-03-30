import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 3000, open: true },
  // Base path is set at build time via VITE_BASE_PATH env var
  // e.g.  VITE_BASE_PATH=/teammonitor npm run build
  base: process.env.VITE_BASE_PATH || '/',
})
