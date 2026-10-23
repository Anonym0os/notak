import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Plugin } from 'vite'

const MODELE = new URL('./service-worker.js', import.meta.url)

/** Les fichiers d'un dossier, en adresses du site (`/assets/x.js`), sans le service worker lui-même. */
export function adressesDuBuild(dossier: string, fichiers: string[]): string[] {
  return fichiers
    .map((f) => '/' + relative(dossier, f).split(sep).join('/'))
    .filter((a) => a !== '/sw.js' && !a.endsWith('.map'))
    .sort()
}

/** Le service worker prêt à servir : la liste des fichiers à garder et la version (empreinte de leur contenu). */
export function genererServiceWorker(modele: string, adresses: string[], version: string): string {
  if (!modele.includes('/* __PRECACHE__ */ []') || !modele.includes('__VERSION__')) throw new Error('Modèle de service worker sans ses marques')
  // La page d'accueil est servie à `/` : c'est elle que le mode hors ligne rend, pas `/index.html`.
  const liste = ['/', ...adresses.filter((a) => a !== '/index.html')]
  return modele.replace('/* __PRECACHE__ */ []', JSON.stringify(liste)).replace('__VERSION__', version)
}

function parcourir(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom)
    return statSync(chemin).isDirectory() ? parcourir(chemin) : [chemin]
  })
}

/** Écrit `sw.js` à la racine du build, après tout le reste : il connaît alors chaque fichier produit. */
export function pwa(): Plugin {
  let sortie = ''
  return {
    name: 'notak-pwa',
    apply: 'build',
    configResolved(config) {
      sortie = join(config.root, config.build.outDir)
    },
    writeBundle() {
      const fichiers = parcourir(sortie)
      const empreinte = createHash('sha256')
      for (const f of fichiers.sort()) empreinte.update(f).update(readFileSync(f))
      const sw = genererServiceWorker(readFileSync(MODELE, 'utf8'), adressesDuBuild(sortie, fichiers), empreinte.digest('hex').slice(0, 12))
      writeFileSync(join(sortie, 'sw.js'), sw)
    },
  }
}
