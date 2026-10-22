import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { apercuWeb } from './vite-apercu'

export default defineConfig({
  plugins: [react(), apercuWeb()],
})
