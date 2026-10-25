import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { type Plugin, defineConfig } from 'vite'
import { pwa } from './pwa/plugin'

const serveur = process.env.NOTAK_SERVEUR ?? 'http://localhost:3005'

/** Le commit du code servi, et « +modifié » si l'arbre a du travail non commité ; « inconnue » hors d'un dépôt git. */
function commitCourant(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { cwd: import.meta.dirname, encoding: 'utf8' }).trim()
    const sale = execSync('git status --porcelain', { cwd: import.meta.dirname, encoding: 'utf8' }).trim() !== ''
    return sale ? `${sha}+modifié` : sha
  } catch {
    return 'inconnue'
  }
}

/**
 * La version que joint un signalement : figée à la construction, et relue à chaque demande en développement, où le
 * même serveur de Vite sert un dépôt qui avance (`/__notak/version`).
 */
function version(): Plugin {
  return {
    name: 'notak-version',
    config: () => ({ define: { 'import.meta.env.VITE_NOTAK_COMMIT': JSON.stringify(commitCourant()) } }),
    configureServer(s) {
      s.middlewares.use('/__notak/version', (_req, res) => {
        res.setHeader('content-type', 'text/plain; charset=utf-8')
        res.end(commitCourant())
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), pwa(), version()],
  server: {
    proxy: {
      '/api': serveur,
      '/sync': { target: serveur, ws: true },
    },
  },
})
