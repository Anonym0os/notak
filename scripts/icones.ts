// Fabrique toutes les icônes de Notak à partir d'une seule source : l'éclat d'or, dessiné ci-dessous.
//   node scripts/icones.ts
// Il écrit :
//   apps/web/public/icones/                 l'application installée (PWA) et l'écran d'attente de la page
//   apps/site/public/favicon.svg            le site
//   apps/bureau/src-tauri/icons/            la coque de bureau : PNG, icon.icns (macOS), icon.ico (Windows)
//   apps/bureau/src-tauri/icons/ios/        l'icône iOS et iPadOS, recopiée dans gen/apple/Assets.xcassets
//   gen/apple/Assets.xcassets/              l'icône, et le logo et le fond de l'écran de lancement
import { createRequire } from 'node:module'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'

// sharp est une dépendance du serveur : on le cherche depuis là.
const sharp = createRequire(new URL('../apps/serveur/package.json', import.meta.url))('sharp') as typeof import('sharp')

// ---------------------------------------------------------------------------------------------------------------
// L'éclat d'or
//
// Une tache d'encre où rien n'est laissé au hasard ; chaque mesure découle du nombre d'or φ.
// - Un cœur de rayon 1.
// - Huit rayons (un nombre de Fibonacci), posés de proche en proche à l'angle d'or, 360°/φ² ≈ 137,5° : c'est la
//   règle des graines du tournesol, ni régulière ni désordonnée.
// - Le k-ième rayon (k = 0…7, dans l'ordre de pose) mesure 1 + φ^(1 − k/4) depuis le centre : chacun un peu plus
//   court que le précédent. Il part du cœur à l'épaisseur φ⁻², s'effile jusqu'à φ^(−4,5) et finit en goutte de
//   rayon φ⁻³ · φ^(−k/8).
// - Tout se raccorde par un congé liquide de rayon φ⁻¹ : l'union lisse des distances signées.
// - La marque occupe φ^(−1/2) ≈ 0,786 du côté de l'icône, et son centre de masse tombe au centre.
// Le contour est la ligne de niveau zéro de cette distance, relevée sur une grille (carrés marchants), simplifiée,
// puis tracée en courbes de Bézier.
// ---------------------------------------------------------------------------------------------------------------

const PHI = (1 + Math.sqrt(5)) / 2
const ANGLE_OR = (2 * Math.PI) / (PHI * PHI)
const puissance = (k: number) => Math.pow(PHI, k)

type Distance = (x: number, y: number) => number

/** Union lisse de deux distances : le congé a pour rayon k. */
const unionLisse = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}
const disque =
  (cx: number, cy: number, r: number): Distance =>
  (x, y) =>
    Math.hypot(x - cx, y - cy) - r
/** Deux disques (a, ra) et (b, rb) reliés par leurs tangentes : un rayon qui s'effile. */
function fuseau(ax: number, ay: number, ra: number, bx: number, by: number, rb: number): Distance {
  const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L
  const s = (ra - rb) / L, c = Math.sqrt(1 - s * s)
  return (x, y) => {
    const px = x - ax, py = y - ay
    const v = px * ux + py * uy, u = Math.abs(-px * uy + py * ux), k = -s * u + c * v
    if (k < 0) return Math.hypot(u, v) - ra
    if (k > c * L) return Math.hypot(u, v - L) - rb
    return u * c + v * s - ra
  }
}

function eclatDOr(): Distance {
  const formes: Distance[] = [disque(0, 0, 1)]
  const rayons = 8
  for (let k = 0; k < rayons; k++) {
    const angle = -Math.PI / 2 + k * ANGLE_OR
    const longueur = 1 + puissance(1 - (2 * k) / rayons)
    const bx = Math.cos(angle) * longueur, by = Math.sin(angle) * longueur
    formes.push(fuseau(0, 0, puissance(-2), bx, by, puissance(-4.5)))
    formes.push(disque(bx, by, puissance(-3) * puissance(-k / rayons)))
  }
  const conge = puissance(-1)
  return (x, y) => formes.reduce((d, f) => unionLisse(d, f(x, y), conge), Infinity)
}

/** Le contour de la marque, en chemin SVG dans un carré de 1024, centré sur son centre de masse. */
function contour(f: Distance, { emprise, etendue = 3.4, n = 720 }: { emprise: number; etendue?: number; n?: number }) {
  const cote = 1024, h = (2 * etendue) / n, W = n + 1
  const v = new Float64Array(W * W)
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) v[j * W + i] = f(-etendue + i * h, -etendue + j * h)
  const V = (i: number, j: number) => v[j * W + i]
  const point = (i: number, j: number): [number, number] => [-etendue + i * h, -etendue + j * h]
  const surArete = (i0: number, j0: number, i1: number, j1: number): [number, number] => {
    const a = V(i0, j0), t = a / (a - V(i1, j1)), p = point(i0, j0), q = point(i1, j1)
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
  }
  // une arête se nomme « h,i,j » (horizontale) ou « v,i,j » (verticale) ; chaque case relie deux arêtes
  const aretePoint = (e: string) => {
    const [t, i, j] = e.split(',')
    return t === 'h' ? surArete(+i, +j, +i + 1, +j) : surArete(+i, +j, +i, +j + 1)
  }
  const suivante = new Map<string, string>()
  let mx = 0, my = 0, aire = 0
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      if (V(i, j) < 0) { const [x, y] = point(i, j); mx += x; my += y; aire++ }
      const cas = (V(i, j) < 0 ? 1 : 0) | (V(i + 1, j) < 0 ? 2 : 0) | (V(i + 1, j + 1) < 0 ? 4 : 0) | (V(i, j + 1) < 0 ? 8 : 0)
      if (cas === 0 || cas === 15) continue
      const H = `h,${i},${j}`, D = `v,${i + 1},${j}`, B = `h,${i},${j + 1}`, G = `v,${i},${j}`
      const segments: Record<number, string[][]> = {
        1: [[G, H]], 2: [[H, D]], 3: [[G, D]], 4: [[D, B]], 5: [[G, H], [D, B]], 6: [[H, B]], 7: [[G, B]],
        8: [[B, G]], 9: [[B, H]], 10: [[H, D], [B, G]], 11: [[B, D]], 12: [[D, G]], 13: [[D, H]], 14: [[H, G]],
      }
      for (const [a, b] of segments[cas]) suivante.set(a, b)
    }
  const boucles: [number, number][][] = [], vues = new Set<string>()
  for (const depart of suivante.keys()) {
    if (vues.has(depart)) continue
    const boucle: [number, number][] = []
    for (let e: string | undefined = depart; e && !vues.has(e); e = suivante.get(e)) { vues.add(e); boucle.push(aretePoint(e)) }
    if (boucle.length > 4) boucles.push(boucle)
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const b of boucles) for (const [x, y] of b) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  const echelle = (cote * emprise) / Math.max(x1 - x0, y1 - y0), cx = mx / aire, cy = my / aire
  const versIcone = ([x, y]: [number, number]): [number, number] => [cote / 2 + (x - cx) * echelle, cote / 2 + (y - cy) * echelle]
  // Douglas-Peucker, puis Catmull-Rom converti en cubiques
  const simplifier = (pts: [number, number][], tol: number): [number, number][] => {
    if (pts.length < 3) return pts
    const a = pts[0], b = pts[pts.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9
    let dmax = 0, idx = 0
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / L
      if (d > dmax) { dmax = d; idx = i }
    }
    return dmax > tol ? [...simplifier(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplifier(pts.slice(idx), tol)] : [a, b]
  }
  const r = (x: number) => +x.toFixed(1)
  let d = ''
  for (const boucle of boucles) {
    const q = boucle.map(versIcone), milieu = q.length >> 1, tol = 0.5
    const pts = [...simplifier(q.slice(0, milieu + 1), tol).slice(0, -1), ...simplifier([...q.slice(milieu), q[0]], tol).slice(0, -1)]
    const N = pts.length, p = (i: number) => pts[(i + N) % N]
    d += `M${r(p(0)[0])} ${r(p(0)[1])}`
    for (let i = 0; i < N; i++) {
      const [a, b, c, e] = [p(i - 1), p(i), p(i + 1), p(i + 2)]
      d += `C${r(b[0] + (c[0] - a[0]) / 6)} ${r(b[1] + (c[1] - a[1]) / 6)} ${r(c[0] - (e[0] - b[0]) / 6)} ${r(c[1] - (e[1] - b[1]) / 6)} ${r(c[0])} ${r(c[1])}`
    }
    d += 'Z'
  }
  // le demi-côté du plus petit carré centré qui contient la marque
  const demi = Math.max(...[x0, x1].map((x) => Math.abs((x - cx) * echelle)), ...[y0, y1].map((y) => Math.abs((y - cy) * echelle)))
  return { d, demi }
}

/** La marque seule, dans un carré de 1024 qu'elle occupe à φ^(−1/2). DEMI : ce qu'elle déborde du centre. */
const { d: MARQUE, demi: DEMI } = contour(eclatDOr(), { emprise: puissance(-0.5) })
/** Le carré centré qui contient juste la marque, pour la montrer seule. */
const cadreMarque = (marge: number) => { const c = DEMI * (1 + marge); return `${512 - c} ${512 - c} ${2 * c} ${2 * c}` }

// ---------------------------------------------------------------------------------------------------------------
// Les scènes : la marque sur son fond. Noir pur sur clair, blanc pur sur sombre (le fond, lui, se nuance).
// ---------------------------------------------------------------------------------------------------------------

const ENCRE = '#000000'
const FOND_CLAIR = '#ebedee' // --notak-fond clair
const FOND_SOMBRE = '#1b1e23' // --notak-fond sombre
const degradeClair = `<linearGradient id="fond" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7f8f9"/><stop offset="1" stop-color="#e3e6e9"/></linearGradient>`

/** La marque dans un carré de 1024, réduite autour du centre (1 = taille normale). */
const marque = (couleur: string, reduction = 1) =>
  `<path transform="translate(512 512) scale(${reduction}) translate(-512 -512)" d="${MARQUE}" fill="${couleur}"/>`
const svg = (corps: string, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${defs ? `<defs>${defs}</defs>` : ''}${corps}</svg>`

/** Pleine page : le système (iOS, Android) découpe lui-même la forme. */
const pleineClaire = (reduction = 1) => svg(`<rect width="1024" height="1024" fill="url(#fond)"/>${marque(ENCRE, reduction)}`, degradeClair)

/** Le rectangle à coins continus d'Apple : coefficients du coin d'iOS, pour un rayon r. */
function rectangleContinu(x: number, y: number, w: number, h: number, r: number) {
  const k = [1.52866483, 1.08849323, 0.86840689, 0.66993427, 0.065496, 0.37282392, 0.12558612]
  const f = (v: number) => v.toFixed(2)
  // un coin, décrit le long du bord d'arrivée (u) et vers l'intérieur (v), depuis l'angle (cx, cy)
  const coin = (cx: number, cy: number, du: [number, number], dv: [number, number]) => {
    const P = (u: number, v: number) => `${f(cx + (du[0] * u + dv[0] * v) * r)} ${f(cy + (du[1] * u + dv[1] * v) * r)}`
    return `L${P(k[0], 0)}C${P(k[1], 0)} ${P(k[2], 0)} ${P(k[3], k[4])}C${P(k[5], k[6])} ${P(k[6], k[5])} ${P(k[4], k[3])}C${P(0, k[2])} ${P(0, k[1])} ${P(0, k[0])}`
  }
  return (
    `M${f(x + k[0] * r)} ${f(y)}` +
    coin(x + w, y, [-1, 0], [0, 1]) +
    coin(x + w, y + h, [0, -1], [-1, 0]) +
    coin(x, y + h, [1, 0], [0, -1]) +
    coin(x, y, [0, 1], [1, 0]) +
    'Z'
  )
}

/**
 * macOS 11 et suivants, relevé sur macOS 27 : une forme de 824 px posée à 100 px du bord d'une toile de 1024, coins
 * continus de rayon 185,4, une ombre portée. Le système reconnaît ce gabarit et le redécoupe à sa courbe ; une icône
 * pleine page serait enfermée dans un écrin gris.
 */
const FORME_MAC = rectangleContinu(100, 100, 824, 824, 185.4)
const gabaritMac = svg(
  `<path d="${FORME_MAC}" fill="#000" opacity=".3" filter="url(#ombre)"/>` +
    `<g clip-path="url(#forme)"><rect width="1024" height="1024" fill="url(#fond)"/><g transform="translate(100 100) scale(${824 / 1024})">${marque(ENCRE)}</g></g>`,
  degradeClair +
    `<clipPath id="forme"><path d="${FORME_MAC}"/></clipPath>` +
    `<filter id="ombre" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="10"/><feOffset dy="10"/></filter>`,
)
/** Coins arrondis sans marge : l'icône de la page installée et de Windows. */
const FORME_ARRONDIE = rectangleContinu(0, 0, 1024, 1024, 229)
const arrondie = svg(`<path d="${FORME_ARRONDIE}" fill="url(#fond)"/>${marque(ENCRE)}`, degradeClair)

const png = (source: string, cote: number) => sharp(Buffer.from(source)).resize(cote, cote).png().toBuffer()
/** Sans couche alpha : l'App Store refuse une icône iOS qui en porte une, même opaque. */
const pngOpaque = (source: string, cote: number) => sharp(Buffer.from(source)).resize(cote, cote).removeAlpha().png().toBuffer()
const ecrire = async (url: URL, contenu: string | Buffer) => { await mkdir(new URL('.', url), { recursive: true }); await writeFile(url, contenu) }
const json = (valeur: unknown) => JSON.stringify(valeur, null, 2) + '\n'

// ---- La page installée (PWA) et l'écran d'attente ----
const web = new URL('../apps/web/public/icones/', import.meta.url)
await ecrire(new URL('icone.svg', web), arrondie)
await ecrire(new URL('marque.svg', web), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${cadreMarque(0.02)}"><path d="${MARQUE}"/></svg>`)
await ecrire(new URL('192.png', web), await png(arrondie, 192))
await ecrire(new URL('512.png', web), await png(arrondie, 512))
// « maskable » : Android découpe un cercle de 80 % au centre, la marque y tient entière
await ecrire(new URL('maskable-512.png', web), await pngOpaque(pleineClaire((0.4 * 1024) / DEMI), 512))
await ecrire(new URL('apple-touch-180.png', web), await pngOpaque(pleineClaire(), 180))

// ---- Le favicon du site : la marque seule, noire, blanche quand le navigateur est sombre ----
await ecrire(
  new URL('../apps/site/public/favicon.svg', import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${cadreMarque(0.02)}"><style>path{fill:#000}@media (prefers-color-scheme:dark){path{fill:#fff}}</style><path d="${MARQUE}"/></svg>\n`,
)

// ---- iOS et iPadOS : un jeu universel de 1024 px, en trois apparences ----
// Clair : la marque noire sur le fond clair. Sombre : la marque blanche sur fond transparent, le système pose son
// propre fond sombre. Teinté : la marque blanche sur noir, qu'iOS colore à la teinte choisie par la personne.
const ios = new URL('../apps/bureau/src-tauri/icons/ios/', import.meta.url)
const jeuIos = {
  'AppIcon-512@2x.png': await pngOpaque(pleineClaire(), 1024),
  'AppIcon-512@2x-dark.png': await png(svg(marque('#ffffff')), 1024),
  'AppIcon-512@2x-tinted.png': await pngOpaque(svg(`<rect width="1024" height="1024" fill="#000"/>${marque('#ffffff')}`), 1024),
  'Contents.json': json({
    images: [
      { filename: 'AppIcon-512@2x.png', idiom: 'universal', platform: 'ios', size: '1024x1024' },
      { appearances: [{ appearance: 'luminosity', value: 'dark' }], filename: 'AppIcon-512@2x-dark.png', idiom: 'universal', platform: 'ios', size: '1024x1024' },
      { appearances: [{ appearance: 'luminosity', value: 'tinted' }], filename: 'AppIcon-512@2x-tinted.png', idiom: 'universal', platform: 'ios', size: '1024x1024' },
    ],
    info: { author: 'xcode', version: 1 },
  }),
}
// recopié dans le catalogue du projet Xcode, en retirant les anciennes tailles que `tauri ios init` y avait posées
const catalogue = new URL('../apps/bureau/src-tauri/gen/apple/Assets.xcassets/', import.meta.url)
const appIcon = new URL('AppIcon.appiconset/', catalogue)
await rm(appIcon, { recursive: true, force: true })
for (const [nom, contenu] of Object.entries(jeuIos)) {
  await ecrire(new URL(nom, ios), contenu)
  await ecrire(new URL(nom, appIcon), contenu)
}

// ---- L'écran de lancement (LaunchScreen.storyboard) : la marque de 64 pt sur le fond du thème ----
const LANCEMENT = 64
const logo = new URL('LogoLancement.imageset/', catalogue)
await rm(logo, { recursive: true, force: true })
const images: object[] = []
for (const [apparence, couleur] of [['', ENCRE], ['-sombre', '#ffffff']] as const)
  for (const echelle of [1, 2, 3]) {
    const nom = `logo${apparence}@${echelle}x.png`
    const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${cadreMarque(0.02)}"><path d="${MARQUE}" fill="${couleur}"/></svg>`
    await ecrire(new URL(nom, logo), await png(source, LANCEMENT * echelle))
    images.push({ filename: nom, idiom: 'universal', scale: `${echelle}x`, ...(apparence ? { appearances: [{ appearance: 'luminosity', value: 'dark' }] } : {}) })
  }
await ecrire(new URL('Contents.json', logo), json({ images, info: { author: 'xcode', version: 1 } }))
const rvb = (hex: string) => {
  const [r, v, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return { 'color-space': 'srgb', components: { alpha: '1.000', blue: `0x${b.toString(16).toUpperCase().padStart(2, '0')}`, green: `0x${v.toString(16).toUpperCase().padStart(2, '0')}`, red: `0x${r.toString(16).toUpperCase().padStart(2, '0')}` } }
}
await ecrire(
  new URL('FondLancement.colorset/Contents.json', catalogue),
  json({
    colors: [
      { color: rvb(FOND_CLAIR), idiom: 'universal' },
      { appearances: [{ appearance: 'luminosity', value: 'dark' }], color: rvb(FOND_SOMBRE), idiom: 'universal' },
    ],
    info: { author: 'xcode', version: 1 },
  }),
)

// ---- La coque de bureau : PNG au gabarit macOS, et les conteneurs .icns et .ico qui emballent des PNG ----
const bureau = new URL('../apps/bureau/src-tauri/icons/', import.meta.url)
const mac = new Map<number, Buffer>()
for (const cote of [16, 32, 64, 128, 256, 512, 1024]) mac.set(cote, await png(gabaritMac, cote))
await ecrire(new URL('32x32.png', bureau), mac.get(32)!)
await ecrire(new URL('128x128.png', bureau), mac.get(128)!)
await ecrire(new URL('128x128@2x.png', bureau), mac.get(256)!)
await ecrire(new URL('icon.png', bureau), mac.get(512)!)
await ecrire(
  new URL('icon.icns', bureau),
  conteneurIcns([
    ['icp4', mac.get(16)!], ['icp5', mac.get(32)!], ['ic07', mac.get(128)!], ['ic08', mac.get(256)!],
    ['ic09', mac.get(512)!], ['ic10', mac.get(1024)!], ['ic11', mac.get(32)!], ['ic12', mac.get(64)!], ['ic13', mac.get(256)!], ['ic14', mac.get(512)!],
  ]),
)
const windows = await Promise.all([16, 24, 32, 48, 64, 128, 256].map(async (c) => [c, await png(arrondie, c)] as const))
await ecrire(new URL('icon.ico', bureau), conteneurIco(windows))

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

// les fichiers que le gabarit précédent laissait et qu'on ne fabrique plus
for (const f of await readdir(bureau)) if (/^(Square|StoreLogo)/.test(f)) await rm(new URL(f, bureau))

console.log(`icônes écrites (marque : ${MARQUE.length} caractères de tracé)`)
