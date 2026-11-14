import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve, sep } from 'node:path'
import type { Plugin } from 'vite'

/**
 * Les ressources de pdf.js que la visionneuse et l'aperçu des cartes demandent (`packages/tableau/src/elements/fichier/
 * pdf/ressources.ts`) : les CMaps et les polices standard, servies sous `/pdfjs/` telles que `pdfjs-dist` les livre.
 * En développement, Vite les sert depuis le paquet ; au build, elles sont copiées dans le dossier construit, donc dans
 * l'image Docker et dans l'app de bureau, qui les a hors ligne. Ni CDN ni réseau tiers.
 */

/** Les dossiers de `pdfjs-dist` publiés, et leur place sous `/pdfjs/`. */
export const DOSSIERS_PDF = ['cmaps', 'standard_fonts'] as const
export const PREFIXE_PDF = '/pdfjs/'

/** Le dossier de `pdfjs-dist`, tel que la toile (`@notak/tableau`) le trouve. */
export function racinePdfjs(): string {
  const depuisLaToile = createRequire(new URL('../../../packages/tableau/package.json', import.meta.url))
  return dirname(depuisLaToile.resolve('pdfjs-dist/package.json'))
}

/** Chaque fichier publié : son chemin dans le site (`pdfjs/cmaps/78-H.bcmap`) et sa source sur le disque. */
export function fichiersPdf(racine = racinePdfjs()): { chemin: string; source: string }[] {
  return DOSSIERS_PDF.flatMap((dossier) =>
    readdirSync(join(racine, dossier))
      .filter((nom) => statSync(join(racine, dossier, nom)).isFile())
      .sort()
      .map((nom) => ({ chemin: `pdfjs/${dossier}/${nom}`, source: join(racine, dossier, nom) })),
  )
}

const TYPES: Record<string, string> = { '.ttf': 'font/ttf', '.pfb': 'application/x-font-type1' }

/**
 * Le fichier à servir pour cette adresse (`/pdfjs/cmaps/78-H.bcmap?v=1`), ou `null` : hors de `/pdfjs/`, hors des
 * dossiers publiés, ou qui en sortirait (`..`).
 */
export function fichierDeLAdresse(adresse: string, racine = racinePdfjs()): string | null {
  const chemin = decodeURIComponent(adresse.split(/[?#]/)[0] ?? '')
  if (!chemin.startsWith(PREFIXE_PDF)) return null
  const [dossier, ...reste] = chemin.slice(PREFIXE_PDF.length).split('/')
  if (!(DOSSIERS_PDF as readonly string[]).includes(dossier ?? '') || reste.length !== 1 || !reste[0]) return null
  const base = resolve(racine, dossier!)
  const fichier = resolve(base, reste[0])
  if (!fichier.startsWith(base + sep) || !existsSync(fichier) || !statSync(fichier).isFile()) return null
  return fichier
}

export function ressourcesPdf(racine = racinePdfjs()): Plugin {
  return {
    name: 'notak-ressources-pdf',
    configureServer(serveur) {
      serveur.middlewares.use((req, res, suite) => {
        const fichier = req.url ? fichierDeLAdresse(req.url, racine) : null
        if (!fichier) return suite()
        const extension = fichier.slice(fichier.lastIndexOf('.'))
        res.setHeader('content-type', TYPES[extension] ?? 'application/octet-stream')
        res.end(readFileSync(fichier))
      })
    },
    generateBundle() {
      for (const { chemin, source } of fichiersPdf(racine)) this.emitFile({ type: 'asset', fileName: chemin, source: readFileSync(source) })
    },
  }
}
