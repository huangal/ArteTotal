import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// The API (server/index.ts) runs on its own port; in dev, Vite forwards to it.
const api = `http://localhost:${process.env.PORT ?? 3001}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { '/api': api, '/uploads': api },
  },
  preview: {
    proxy: { '/api': api, '/uploads': api },
  },
})
