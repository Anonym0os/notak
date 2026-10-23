// Fabrique les icônes de l'application installée (apps/web/public/icones) à partir du logo de Notak.
//   node scripts/icones.ts
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'

// sharp est une dépendance du serveur : on le cherche depuis là.
const sharp = createRequire(new URL('../apps/serveur/package.json', import.meta.url))('sharp') as typeof import('sharp')

const dossier = new URL('../apps/web/public/icones/', import.meta.url)
const fond = '#eef0f2'
const logo = (decalage: string) =>
  `<g transform="${decalage}"><rect x="78" y="112" width="240" height="176" rx="40" fill="#2f6feb"/><rect x="194" y="224" width="240" height="176" rx="40" fill="#1f2328"/></g>`

/** Coins arrondis : l'icône ordinaire. */
const ronde = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${fond}"/>${logo('')}</svg>`
/** Pleine page, le logo dans la zone sûre (80 % du centre) : l'icône « maskable » d'Android et celle d'iOS. */
const pleine = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${fond}"/>${logo('translate(76.8 76.8) scale(0.7)')}</svg>`

const png = (svg: string, cote: number) => sharp(Buffer.from(svg)).resize(cote, cote).png().toBuffer()

await writeFile(new URL('icone.svg', dossier), ronde)
await writeFile(new URL('192.png', dossier), await png(ronde, 192))
await writeFile(new URL('512.png', dossier), await png(ronde, 512))
await writeFile(new URL('maskable-512.png', dossier), await png(pleine, 512))
await writeFile(new URL('apple-touch-180.png', dossier), await png(pleine, 180))
console.log('icônes écrites dans apps/web/public/icones')
