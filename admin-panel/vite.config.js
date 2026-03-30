import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const basePath = process.env.VITE_BASE_PATH || '/teammonitor';

export default defineConfig({
  plugins: [react()],
  server: { port: 3000, open: true },
  base: basePath + '/',
  // Expose basePath to api.js as import.meta.env.VITE_BASE_PATH
  define: {
    'import.meta.env.VITE_BASE_PATH': JSON.stringify(basePath),
  },
})
