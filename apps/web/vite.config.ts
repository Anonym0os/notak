import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const serveur = process.env.NOTAK_SERVEUR ?? 'http://localhost:3005'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': serveur,
      '/sync': { target: serveur, ws: true },
    },
  },
})
