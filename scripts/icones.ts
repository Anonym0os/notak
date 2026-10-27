// Fabrique les icônes de l'application installée (apps/web/public/icones), celles de la coque de bureau
// (apps/bureau/src-tauri/icons) et celle de l'app iOS (apps/bureau/src-tauri/icons/ios) à partir du logo de Notak.
//   node scripts/icones.ts
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

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

// ---- iOS : une seule icône de 1024 px, pleine page (le système arrondit lui-même), en trois apparences ----
// Xcode (cible iOS 17 et plus) accepte un jeu « universel » d'une seule taille ; `scripts/ios.ts init` le recopie dans
// gen/apple/Assets.xcassets/AppIcon.appiconset. Sombre : le fond disparaît, le logo seul sur le verre du système.
// Teintée : le logo en niveaux de gris, qu'iOS 18 colore à la teinte choisie par la personne.
const ios = new URL('../apps/bureau/src-tauri/icons/ios/', import.meta.url)
await mkdir(ios, { recursive: true })
const sombre = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#1b1e23"/>${logo('translate(76.8 76.8) scale(0.7)').replace('#1f2328', '#e3e5e9')}</svg>`
const teintee = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#000"/>${logo('translate(76.8 76.8) scale(0.7)').replace('#2f6feb', '#ffffff').replace('#1f2328', '#8a8f98')}</svg>`
await writeFile(new URL('AppIcon-512@2x.png', ios), await png(pleine, 1024))
await writeFile(new URL('AppIcon-512@2x-dark.png', ios), await png(sombre, 1024))
await writeFile(new URL('AppIcon-512@2x-tinted.png', ios), await png(teintee, 1024))
await writeFile(
  new URL('Contents.json', ios),
  JSON.stringify(
    {
      images: [
        { filename: 'AppIcon-512@2x.png', idiom: 'universal', platform: 'ios', size: '1024x1024' },
        { filename: 'AppIcon-512@2x-dark.png', idiom: 'universal', platform: 'ios', size: '1024x1024', appearances: [{ appearance: 'luminosity', value: 'dark' }] },
        { filename: 'AppIcon-512@2x-tinted.png', idiom: 'universal', platform: 'ios', size: '1024x1024', appearances: [{ appearance: 'luminosity', value: 'tinted' }] },
      ],
      info: { author: 'xcode', version: 1 },
    },
    null,
    2,
  ) + '\n',
)

// ---- La coque de bureau : PNG, et les conteneurs .ico et .icns qui emballent des PNG tels quels ----
const bureau = new URL('../apps/bureau/src-tauri/icons/', import.meta.url)
await mkdir(bureau, { recursive: true })
const pngs = new Map<number, Buffer>()
for (const cote of [16, 32, 48, 64, 128, 256, 512]) pngs.set(cote, await png(ronde, cote))
await writeFile(new URL('32x32.png', bureau), pngs.get(32)!)
await writeFile(new URL('128x128.png', bureau), pngs.get(128)!)
await writeFile(new URL('128x128@2x.png', bureau), pngs.get(256)!)
await writeFile(new URL('icon.png', bureau), pngs.get(512)!)
await writeFile(new URL('icon.ico', bureau), conteneurIco([16, 32, 48, 64, 128, 256].map((c) => [c, pngs.get(c)!] as const)))
await writeFile(new URL('icon.icns', bureau), conteneurIcns([['ic07', pngs.get(128)!], ['ic08', pngs.get(256)!], ['ic09', pngs.get(512)!]]))

/** Un .ico dont chaque image est un PNG : 256 s'écrit 0 dans l'en-tête. */
function conteneurIco(images: (readonly [number, Buffer])[]): Buffer {
  const entete = Buffer.alloc(6 + 16 * images.length)
  entete.writeUInt16LE(1, 2)
  entete.writeUInt16LE(images.length, 4)
  let decalage = entete.length
  images.forEach(([cote, donnees], i) => {
    const o = 6 + 16 * i
    entete.writeUInt8(cote % 256, o)
    entete.writeUInt8(cote % 256, o + 1)
    entete.writeUInt16LE(1, o + 4)
    entete.writeUInt16LE(32, o + 6)
    entete.writeUInt32LE(donnees.length, o + 8)
    entete.writeUInt32LE(decalage, o + 12)
    decalage += donnees.length
  })
  return Buffer.concat([entete, ...images.map(([, d]) => d)])
}

/** Un .icns : des blocs (type sur quatre lettres, taille, PNG). */
function conteneurIcns(blocs: (readonly [string, Buffer])[]): Buffer {
  const corps = blocs.map(([type, donnees]) => {
    const entete = Buffer.alloc(8)
    entete.write(type, 0, 'ascii')
    entete.writeUInt32BE(8 + donnees.length, 4)
    return Buffer.concat([entete, donnees])
  })
  const entete = Buffer.alloc(8)
  entete.write('icns', 0, 'ascii')
  entete.writeUInt32BE(8 + corps.reduce((n, b) => n + b.length, 0), 4)
  return Buffer.concat([entete, ...corps])
}

console.log('icônes écrites dans apps/web/public/icones et apps/bureau/src-tauri/icons')
