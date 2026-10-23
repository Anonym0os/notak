import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { pwa } from './pwa/plugin'

const serveur = process.env.NOTAK_SERVEUR ?? 'http://localhost:3005'

export default defineConfig({
  plugins: [react(), pwa()],
  server: {
    proxy: {
      '/api': serveur,
      '/sync': { target: serveur, ws: true },
    },
  },
})
