import { toSvg } from 'html-to-image'
import { colorerCode } from '../blocs/coloration'
import { annoterPage } from '../blocs/structure'
import { t } from '../langue'
import { avecToutLeTableau, rapportDeCapture } from '../pilotage'
import { A4, type PagePdf, pdfDePages } from './pdf'

/**
 * Les captures de l'export, faites dans le navigateur : la toile (l'écran, ou le tableau entier), une carte mentale
 * entière, les pages d'un document. Chacune rend un canevas ; l'aperçu et le fichier partent du même.
 */

/** Une image qu'on n'a pas pu lire devient un pixel transparent : elle ne fait pas échouer toute la capture. */
const PIXEL_VIDE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
/** Ce que la capture de la toile laisse de côté : les pastilles et les curseurs posés dessus, pas le tableau. */
const HORS_TOILE = ['notak-zoom-pastille', 'notak-choix-modele', 'notak-lecture', 'notak-lasso', 'notak-curseur']
/** Ce que la capture d'une carte laisse de côté : la sélection, le survol, les cadres et les repères du geste. */
const HORS_CARTE = '.notak-arbre-choix, .notak-arbre-ajouts, .notak-arbre-survol, .notak-arbre-cadre, .notak-arbre-tire, .notak-arbre-relier, [data-controle]'
/** Le blanc laissé autour du contenu d'un tableau entier ou d'une carte (px d'écran). */
const MARGE_CAPTURE = 24

let imageDistante: ((adresse: string) => string) | null = null

/**
 * L'application dit comment rapatrier une image venue d'un autre site : le navigateur refuse de la lire pour la
 * capture, son serveur peut la relayer. Sans relais (l'édition locale), ces images sortent vides.
 */
export function reglerCapture(o: { imageDistante: ((adresse: string) => string) | null }) {
  imageDistante = o.imageDistante
}

type OptionsCapture = NonNullable<Parameters<typeof toSvg>[1]>

/** Le plus grand côté qu'un canevas accepte partout (au-delà, Safari le rend vide). */
const COTE_MAX = 16384

const attendre = (ms: number) => new Promise((fin) => setTimeout(fin, ms))
const uneImage = () => new Promise((fin) => requestAnimationFrame(() => requestAnimationFrame(fin)))

/**
 * Un élément dessiné sur un canevas, comme `toCanvas` de html-to-image, mais en deux passes. WebKit (Safari, et Notak
 * pour le bureau) ne décode les images d'un SVG (une image du document, la coche d'une case, une vignette) qu'au
 * moment où on le dessine : le premier dessin les laisse en blanc. On dessine donc une fois pour rien, on laisse au
 * navigateur le temps de les décoder, puis on dessine pour de bon.
 */
async function versCanevas(noeud: HTMLElement, o: OptionsCapture & { pixelRatio: number }): Promise<HTMLCanvasElement> {
  const bord = (cote: string) => parseFloat(getComputedStyle(noeud).getPropertyValue(`border-${cote}-width`)) || 0
  const largeur = o.width ?? noeud.clientWidth + bord('left') + bord('right')
  const hauteur = o.height ?? noeud.clientHeight + bord('top') + bord('bottom')
  const image = new Image()
  image.decoding = 'sync'
  image.src = await toSvg(noeud, o)
  await image.decode()
  const canevas = document.createElement('canvas')
  const reduction = Math.min(1, COTE_MAX / (largeur * o.pixelRatio), COTE_MAX / (hauteur * o.pixelRatio))
  canevas.width = Math.round(largeur * o.pixelRatio * reduction)
  canevas.height = Math.round(hauteur * o.pixelRatio * reduction)
  const ctx = canevas.getContext('2d')!
  const dessiner = () => {
    ctx.clearRect(0, 0, canevas.width, canevas.height)
    if (o.backgroundColor) {
      ctx.fillStyle = o.backgroundColor
      ctx.fillRect(0, 0, canevas.width, canevas.height)
    }
    ctx.drawImage(image, 0, 0, canevas.width, canevas.height)
  }
  dessiner()
  await uneImage()
  await attendre(60)
  dessiner()
  return canevas
}

export interface Capture {
  canevas: HTMLCanvasElement
  /** La taille de ce qui est capturé, en px d'écran (le canevas est plus grand de son rapport de pixels). */
  largeur: number
  hauteur: number
}

const options = (fond: string | null, rapport: number) => ({
  pixelRatio: rapport,
  imagePlaceholder: PIXEL_VIDE,
  onImageErrorHandler: () => undefined,
  ...(fond === null ? { style: { background: 'none' } } : { backgroundColor: fond }),
})

/** Le fond d'un élément : le sien, ou celui du premier ancêtre qui en a un ; blanc à défaut. */
function fondDe(el: Element | null): string {
  for (let e = el; e; e = e.parentElement) {
    const c = getComputedStyle(e).backgroundColor
    if (c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c)) return c
  }
  return '#ffffff'
}

/**
 * La toile du tableau ouvert : ce qui est à l'écran, ou le tableau entier (la toile le cadre le temps de la prise,
 * puis la vue revient), recadré sur son contenu.
 */
export function capturerToile(r: { portee: 'ecran' | 'tout'; resolution: number; fond: boolean }): Promise<Capture> {
  if (r.portee === 'ecran') return photographierToile(r.resolution, r.fond, false)
  return avecToutLeTableau(({ rapport }) => photographierToile(rapport, r.fond, true))
}

async function photographierToile(rapport: number, fond: boolean, recadrer: boolean): Promise<Capture> {
  const toile = document.querySelector<HTMLElement>('.notak-toile')
  if (!toile) throw new Error(t('pilotage.aucun'))
  const rapatriees = await rapatrierLesImages(toile)
  const defiger = figerPourCapture(toile)
  const rendre = () => (defiger(), rapatriees())
  let canevas: HTMLCanvasElement
  try {
    canevas = await versCanevas(toile, {
      ...options(fond ? getComputedStyle(toile).backgroundColor : null, rapport),
      // Le tableau seul : la toile porte aussi la barre d'outils, les pastilles et les bulles, qui n'en sont pas.
      filter: (n: Node) => !(n instanceof Element && ((n.parentElement === toile && !n.classList.contains('notak-glisse')) || HORS_TOILE.some((c) => n.classList.contains(c)))),
    })
  } finally {
    rendre()
  }
  const zone = recadrer ? zoneDuContenu(toile) : null
  if (!zone) return { canevas, largeur: toile.clientWidth, hauteur: toile.clientHeight }
  const k = canevas.width / toile.clientWidth
  return { canevas: recadrer_(canevas, zone.x * k, zone.y * k, zone.l * k, zone.h * k), largeur: zone.l, hauteur: zone.h }
}

/**
 * Les éléments entièrement hors de la fenêtre, et leurs descendants : la capture de l'écran ne les recopie pas. Sur un
 * tableau chargé, c'est l'essentiel du DOM, et le plus long de la prise de vue. Un élément sans taille (un calque
 * dont les enfants sont placés en absolu) reste : ses enfants peuvent être à l'écran.
 */
function horsDeLaFenetre(racine: Element, largeur: number, hauteur: number): Set<Element> {
  const hors = new Set<Element>()
  for (const el of racine.querySelectorAll('*')) {
    if (el.parentElement && hors.has(el.parentElement)) {
      hors.add(el)
      continue
    }
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    if (r.bottom < -50 || r.top > hauteur + 50 || r.right < -50 || r.left > largeur + 50) hors.add(el)
  }
  return hors
}

/**
 * Tout ce qui est à l'écran, tel qu'on le voit (le signalement d'un bug, hors de Notak de bureau qui photographie sa
 * fenêtre) : la page entière à la taille de la fenêtre, sauf ce qui porte `data-hors-capture`. Une reconstruction du
 * DOM, pas une photographie : les vidéos et les cadres d'un autre site sortent vides.
 */
export async function capturerEcran(rapport = Math.min(window.devicePixelRatio || 1, 2)): Promise<Capture> {
  const racine = document.body
  const largeur = window.innerWidth
  const hauteur = window.innerHeight
  const hors = horsDeLaFenetre(racine, largeur, hauteur)
  for (const el of racine.querySelectorAll('[data-hors-capture], [data-hors-capture] *')) hors.add(el)
  const rapatriees = await rapatrierLesImages(racine, (el) => !hors.has(el))
  const defiger = figerPourCapture(racine, (el) => !hors.has(el))
  try {
    const canevas = await versCanevas(racine, {
      ...options(fondDe(racine), rapport),
      width: largeur,
      height: hauteur,
      filter: (n: Node) => !(n instanceof Element && hors.has(n)),
    })
    return { canevas, largeur, hauteur }
  } finally {
    defiger()
    rapatriees()
  }
}

function recadrer_(source: HTMLCanvasElement, x: number, y: number, l: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(l))
  c.height = Math.max(1, Math.round(h))
  c.getContext('2d')!.drawImage(source, x, y, c.width, c.height, 0, 0, c.width, c.height)
  return c
}

/** Ce qui peint un dessin SVG : ce que la feuille de style lui donne, et que la capture doit retrouver. */
const PEINTURE_SVG = [
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
]

/**
 * Prépare la vue pour la capture, puis rend de quoi remettre chaque style comme il était. La capture recopie le style
 * calculé de chaque élément ; deux choses s'y perdent dans WebKit (Safari, Notak de bureau) :
 * - la peinture qu'une feuille de style donne à un dessin SVG : un trait courbe sans `fill: none` sort rempli de noir.
 *   Elle est posée en style propre ;
 * - la marge basse d'un dernier enfant qui traverse son parent (fusion des marges) : la capture fige la hauteur du
 *   parent, la marge reste dedans et ce qui suit remonte (une étiquette sous un titre). Elle est posée sur le parent
 *   lui-même : à l'écran, les deux marges fusionnent toujours en une, rien ne bouge.
 */
export function figerPourCapture(racine: Element, retenu: (el: Element) => boolean = () => true): () => void {
  const avant = new Map<Element, string | null>()
  const garder = (el: Element) => {
    if (!avant.has(el)) avant.set(el, el.getAttribute('style'))
  }
  for (const el of racine.querySelectorAll('svg *')) {
    if (!(el instanceof SVGElement) || el instanceof SVGDefsElement || !retenu(el)) continue
    const calcule = getComputedStyle(el)
    garder(el)
    for (const p of PEINTURE_SVG) {
      const v = calcule.getPropertyValue(p)
      if (v) el.style.setProperty(p, v)
    }
  }
  // Du plus profond au plus haut : une marge qui traverse deux parents passe au second par le premier. Tout se lit
  // d'abord, puis s'écrit : une écriture entre deux lectures referait la mise en page à chaque élément.
  const marges = new Map<HTMLElement, number>()
  for (const enfant of [...racine.querySelectorAll<HTMLElement>('*')].reverse()) {
    const parent = enfant.parentElement
    if (!(enfant instanceof HTMLElement) || !parent || !racine.contains(parent) || !retenu(enfant)) continue
    const marge = margeQuiTraverse(enfant, parent, marges.get(enfant))
    if (marge !== null) marges.set(parent, marge)
  }
  for (const [parent, marge] of marges) {
    garder(parent)
    parent.style.marginBottom = `${marge}px`
  }
  return () => {
    for (const [el, style] of avant) style === null ? el.removeAttribute('style') : el.setAttribute('style', style)
  }
}

/** Deux marges qui fusionnent : la plus grande des positives plus la plus petite des négatives. */
const fusion = (a: number, b: number) => Math.max(a, b, 0) + Math.min(a, b, 0)

/**
 * La marge basse que `parent` doit porter lui-même pour garder sa place quand on fige sa hauteur : celle de son dernier
 * enfant (`deja` : celle qu'il vient de recevoir du sien), fusionnée à la sienne, si elle le traverse ; `null` sinon.
 */
function margeQuiTraverse(enfant: HTMLElement, parent: HTMLElement, deja?: number): number | null {
  const ce = getComputedStyle(enfant)
  const mb = deja ?? (parseFloat(ce.marginBottom) || 0)
  if (mb === 0 || ce.display === 'none' || ce.position === 'absolute' || ce.position === 'fixed' || ce.float !== 'none') return null
  // Le dernier enfant qui compte : ceux qui sortent du flux ne bloquent pas la fusion.
  let suivant = enfant.nextElementSibling
  while (suivant) {
    const cs = getComputedStyle(suivant)
    if (cs.display !== 'none' && cs.position !== 'absolute' && cs.position !== 'fixed') return null
    suivant = suivant.nextElementSibling
  }
  const cp = getComputedStyle(parent)
  if (!['block', 'list-item'].includes(cp.display) || cp.overflow !== 'visible' || cp.position === 'absolute' || cp.position === 'fixed' || cp.float !== 'none') return null
  if ((parseFloat(cp.paddingBottom) || 0) !== 0 || (parseFloat(cp.borderBottomWidth) || 0) !== 0) return null
  // La marge sort bien du parent : son bord bas est celui de l'enfant.
  if (Math.abs(parent.getBoundingClientRect().bottom - enfant.getBoundingClientRect().bottom) > 0.5) return null
  return fusion(parseFloat(cp.marginBottom) || 0, mb)
}

/** Le rectangle du contenu du tableau dans la toile, avec sa marge, borné à la toile (px d'écran). */
function zoneDuContenu(toile: HTMLElement): { x: number; y: number; l: number; h: number } | null {
  const cadre = toile.getBoundingClientRect()
  // Les cartes, et le tracé des lignes : leur calque SVG, lui, n'a pas de taille.
  const rects = [...toile.querySelectorAll(':scope > .notak-glisse > .notak-plan > :not(svg), :scope > .notak-glisse > .notak-plan > svg :is(path, line, circle, polygon, text)')]
    .map((e) => e.getBoundingClientRect())
    .filter((r) => r.width > 0 || r.height > 0)
  if (rects.length === 0) return null
  const x0 = Math.max(0, Math.min(...rects.map((r) => r.left)) - cadre.left - MARGE_CAPTURE)
  const y0 = Math.max(0, Math.min(...rects.map((r) => r.top)) - cadre.top - MARGE_CAPTURE)
  const x1 = Math.min(cadre.width, Math.max(...rects.map((r) => r.right)) - cadre.left + MARGE_CAPTURE)
  const y1 = Math.min(cadre.height, Math.max(...rects.map((r) => r.bottom)) - cadre.top + MARGE_CAPTURE)
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, l: x1 - x0, h: y1 - y0 } : null
}

/**
 * Une carte mentale entière, quelle que soit la vue : son dessin est recopié hors de l'écran, cadré sur tous ses
 * sujets et sans la sélection, puis photographié. `emprise` est le rectangle de ses sujets, dans le repère de la carte.
 */
export async function capturerCarte(svg: SVGSVGElement, emprise: { x: number; y: number; l: number; h: number }, fond: boolean): Promise<Capture> {
  const parent = svg.parentElement
  if (!parent || emprise.l <= 0 || emprise.h <= 0) throw new Error(t('pilotage.vide'))
  const copie = svg.cloneNode(true) as SVGSVGElement
  copie.removeAttribute('style')
  copie.style.cssText = 'position:absolute;left:-100000px;top:0;width:10px;height:10px;display:block;overflow:visible'
  const plan = copie.querySelector<SVGGElement>(':scope > g')
  if (plan) plan.style.transform = 'none'
  for (const n of copie.querySelectorAll(HORS_CARTE)) n.remove()
  // Dans le même parent : les styles de la carte (son thème, ses variables) s'y appliquent comme à l'original.
  parent.appendChild(copie)
  try {
    // Le cadre : les sujets, et ce qui en déborde une fois dessiné (une relation qui s'arrondit au-dessus, son libellé).
    const dessin = plan?.getBBox()
    const x0 = Math.min(emprise.x, dessin && dessin.width > 0 ? dessin.x : Infinity)
    const y0 = Math.min(emprise.y, dessin && dessin.height > 0 ? dessin.y : Infinity)
    const x1 = Math.max(emprise.x + emprise.l, dessin && dessin.width > 0 ? dessin.x + dessin.width : -Infinity)
    const y1 = Math.max(emprise.y + emprise.h, dessin && dessin.height > 0 ? dessin.y + dessin.height : -Infinity)
    const m = MARGE_CAPTURE * 2
    const largeur = Math.ceil(x1 - x0 + 2 * m)
    const hauteur = Math.ceil(y1 - y0 + 2 * m)
    copie.setAttribute('width', String(largeur))
    copie.setAttribute('height', String(hauteur))
    copie.style.width = `${largeur}px`
    copie.style.height = `${hauteur}px`
    copie.style.overflow = 'hidden'
    if (plan) plan.style.transform = `translate(${m - x0}px, ${m - y0}px)`
    figerPourCapture(copie)
    const canevas = await versCanevas(copie as unknown as HTMLElement, {
      ...options(fond ? fondDe(parent) : null, rapportDeCapture(largeur, 1)),
      width: largeur,
      height: hauteur,
      style: { position: 'static', left: '0', ...(fond ? {} : { background: 'none' }) },
    })
    return { canevas, largeur, hauteur }
  } finally {
    copie.remove()
  }
}

/** Une page A4 à 96 ppp, et sa marge (px d'écran). */
const PAGE = { l: 794, h: 1123, marge: 72 }
/** La netteté des pages d'un document. */
const RAPPORT_PAGES = 2
/** Le plus de pixels qu'on demande au canevas d'un document entier. */
const PIXELS_MAX = 40_000_000

/** Ce que portent les pages d'un document : une feuille blanche, le texte comme dans Notak. */
const STYLE_PAGES = [
  '.notak-export-pages{font:15px/1.6 system-ui,-apple-system,sans-serif;color:var(--notak-page-texte);background:#fff;box-sizing:border-box}',
  '.notak-export-pages *{box-sizing:border-box}',
  // Le titre et l'icône de la page, alignés sur le texte des blocs (6 px de marge, 2 px de jour).
  '.notak-export-pages .i{font-size:64px;line-height:1;margin:0 0 12px;padding:0 8px}',
  '.notak-export-pages h1.t{font-size:30px;line-height:1.2;font-weight:700;margin:0 0 24px;padding:0 8px;overflow-wrap:break-word}',
  // L'habillage de la page (le menu « ••• » du document) : sa police, son petit texte.
  ".notak-export-pages[data-police=serif]{font-family:Lyon-Text,Georgia,YuMincho,'Yu Mincho','Hiragino Mincho ProN','Songti TC',serif}",
  '.notak-export-pages[data-police=mono]{font-family:iawriter-mono,Nitti,Menlo,Courier,monospace}',
  '.notak-export-pages .notak-blocs{font-family:inherit}',
  '.notak-export-pages[data-petit] .notak-texte.notak-blocs>*,.notak-export-pages[data-petit] .notak-blocs-colonne>*{font-size:14px;line-height:21px}',
  '.notak-export-pages p{margin:0 0 12px}',
  '.notak-export-pages h1{font-size:26px;line-height:1.25;margin:28px 0 12px}',
  '.notak-export-pages h2{font-size:21px;line-height:1.3;margin:24px 0 10px}',
  '.notak-export-pages h3{font-size:17px;line-height:1.35;margin:20px 0 8px}',
  '.notak-export-pages ul,.notak-export-pages ol{margin:0 0 12px;padding-left:24px}',
  '.notak-export-pages li{margin:0 0 4px}.notak-export-pages li p{margin:0}',
  '.notak-export-pages ul[data-type=taskList]{list-style:none;padding-left:4px}',
  '.notak-export-pages ul[data-type=taskList] li{display:flex;gap:8px}',
  '.notak-export-pages pre{margin:0 0 12px;padding:12px;border-radius:6px;background:#f5f6f8;white-space:pre-wrap;font:13px/1.5 ui-monospace,monospace}',
  '.notak-export-pages code{font:0.9em ui-monospace,monospace;background:#f5f6f8;border-radius:4px;padding:1px 4px}',
  '.notak-export-pages pre code{background:none;padding:0}',
  '.notak-export-pages blockquote{margin:0 0 12px;padding-left:14px;border-left:3px solid #d5d9e0;color:#56606f}',
  '.notak-export-pages hr{border:0;border-top:1px solid #e3e6eb;margin:20px 0}',
  '.notak-export-pages img{max-width:100%;height:auto;border-radius:4px}',
  '.notak-export-pages a{color:#2f6feb;text-decoration:underline}',
  '.notak-export-pages table{border-collapse:collapse;margin:0 0 12px}.notak-export-pages td,.notak-export-pages th{border:1px solid #d5d9e0;padding:4px 8px}',
].join('')

/** L'habillage d'une page de document qui passe dans ses pages A4 : son icône, sa police, son petit texte. */
export interface HabillagePages {
  icone?: string | undefined
  police?: 'serif' | 'mono' | undefined
  petitTexte?: boolean | undefined
}

/**
 * Les pages A4 d'un document : son titre, puis son texte (`html`, déjà rendu), mis en page hors de l'écran puis
 * coupé entre deux blocs, ou entre deux éléments d'une liste, plutôt qu'au milieu d'une ligne. `adresse` donne
 * l'adresse d'une image rangée dans l'espace.
 */
export async function capturerPages(
  titre: string,
  html: string,
  adresse?: (fichier: string) => Promise<string | null>,
  habillage: HabillagePages = {},
): Promise<HTMLCanvasElement[]> {
  const largeur = PAGE.l - 2 * PAGE.marge
  const hauteurUtile = PAGE.h - 2 * PAGE.marge
  const hote = document.createElement('div')
  hote.className = 'notak-export-pages'
  hote.style.cssText = `position:fixed;left:-100000px;top:0;width:${largeur}px`
  if (habillage.police) hote.dataset.police = habillage.police
  if (habillage.petitTexte) hote.dataset.petit = ''
  const style = document.createElement('style')
  style.textContent = STYLE_PAGES
  const tete = document.createElement('h1')
  tete.className = 't'
  tete.textContent = titre
  // Le texte comme la lecture le montre : les classes du moteur de blocs, leurs puces, leurs numéros, leurs encadrés.
  const corps = document.createElement('div')
  corps.className = 'notak-texte notak-blocs'
  corps.innerHTML = html
  const icone = habillage.icone ? Object.assign(document.createElement('div'), { className: 'i', textContent: habillage.icone }) : null
  hote.append(style, ...(icone ? [icone] : []), tete, corps)
  document.body.appendChild(hote)
  annoterPage(corps)
  colorerCode(corps)
  try {
    // Une image du document est un fichier de l'espace : on va chercher son adresse, comme la lecture.
    if (adresse)
      await Promise.all(
        [...corps.querySelectorAll<HTMLElement>('figure[data-fichier]')].map(async (f) => {
          const img = f.querySelector('img')
          const u = img && !img.getAttribute('src') ? await adresse(f.dataset.fichier!).catch(() => null) : null
          if (u) img!.setAttribute('src', u)
        }),
      )
    const rapatriees = await rapatrierLesImages(hote)
    const defiger = figerPourCapture(hote)
    const rendre = () => (defiger(), rapatriees())
    await Promise.all([...hote.querySelectorAll('img')].map((i) => i.decode().catch(() => {})))
    const haut = hote.getBoundingClientRect().top
    const total = hote.scrollHeight
    // Où l'on peut couper : avant chaque bloc, et avant chaque élément d'une liste ou d'une citation.
    const coupes = [...corps.children, ...corps.querySelectorAll(':scope > :is(ul, ol, blockquote) > *')]
      .map((e) => e.getBoundingClientRect().top - haut)
      .filter((y) => y > 0)
      .sort((a, b) => a - b)
    // Un très long document se capture moins finement : un canevas trop grand, le navigateur le rend vide.
    const k = Math.max(0.75, Math.min(RAPPORT_PAGES, Math.sqrt(PIXELS_MAX / (largeur * Math.max(1, total)))))
    let canevas: HTMLCanvasElement
    try {
      canevas = await versCanevas(hote, {
        ...options('#ffffff', k),
        style: { position: 'static', left: '0' },
        filter: (n: Node) => !(n instanceof HTMLStyleElement),
      })
    } finally {
      rendre()
    }
    // Le rapport réel : un canevas trop haut pour le navigateur a été réduit.
    const r = canevas.width / largeur
    const pages = decouper(total, coupes, hauteurUtile).map(([debut, fin]) => {
      const page = feuille(r)
      const h = Math.min(fin, canevas.height / r) - debut
      if (h > 0) page.getContext('2d')!.drawImage(canevas, 0, debut * r, canevas.width, h * r, PAGE.marge * r, PAGE.marge * r, canevas.width, h * r)
      return page
    })
    return pages.length > 0 ? pages : [feuille(1)]
  } finally {
    hote.remove()
  }
}

/**
 * Où couper un texte de `total` px de haut en pages de `hauteur` px : à la dernière coupe permise qui tient dans la
 * page, si elle n'en laisse pas les trois quarts vides ; sinon au bas de la page. Rend le haut et le bas de chacune.
 */
export function decouper(total: number, coupes: readonly number[], hauteur: number): [number, number][] {
  const pages: [number, number][] = []
  for (let debut = 0; debut < total - 1;) {
    let fin = debut + hauteur
    if (fin < total) {
      const coupe = coupes.filter((y) => y > debut + hauteur / 4 && y <= fin).pop()
      if (coupe !== undefined) fin = coupe
    } else fin = total
    pages.push([debut, fin])
    debut = fin
  }
  return pages
}

/** Une feuille A4 blanche, à ce rapport de pixels. */
function feuille(k: number): HTMLCanvasElement {
  const page = document.createElement('canvas')
  page.width = Math.round(PAGE.l * k)
  page.height = Math.round(PAGE.h * k)
  const c = page.getContext('2d')!
  c.fillStyle = '#ffffff'
  c.fillRect(0, 0, page.width, page.height)
  return page
}

/** Un canevas en fichier image. */
export const enBlob = (c: HTMLCanvasElement, type: string, qualite?: number) =>
  new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error('capture vide'))), type, qualite))

const jpeg = async (c: HTMLCanvasElement) => new Uint8Array(await (await enBlob(c, 'image/jpeg', 0.92)).arrayBuffer())

/** Une capture en PDF d'une page, à sa taille. */
export async function pdfDeCapture(c: Capture): Promise<Blob> {
  return pdfEnBlob([{ jpeg: await jpeg(c.canevas), largeur: c.canevas.width, hauteur: c.canevas.height, page: { l: c.largeur * 0.75, h: c.hauteur * 0.75 } }])
}

/** Des pages A4 en PDF. */
export async function pdfDePagesA4(pages: readonly HTMLCanvasElement[]): Promise<Blob> {
  const faites: PagePdf[] = []
  for (const p of pages) faites.push({ jpeg: await jpeg(p), largeur: p.width, hauteur: p.height, page: A4 })
  return pdfEnBlob(faites)
}

const pdfEnBlob = (pages: PagePdf[]) => new Blob([pdfDePages(pages) as Uint8Array<ArrayBuffer>], { type: 'application/pdf' })

/**
 * Les images, lues par nous avant la prise de vue, puis données à la capture sous une adresse neuve et déjà décodée.
 * Celles d'un autre site (aperçus de lien, favicons, images d'un document) passent par le relais de l'application : le
 * navigateur refuse de les lire pour la capture. Celles du site aussi : la capture garde en cache une image qu'elle
 * n'a pas pu lire une fois, et la rendrait vide jusqu'au rechargement. Après la prise de vue, chacune retrouve son
 * adresse ; une image qu'on ne peut pas lire reste telle quelle.
 */
async function rapatrierLesImages(racine: HTMLElement, retenu: (el: Element) => boolean = () => true): Promise<() => void> {
  const relais = imageDistante
  const adresse = (src: string): string | null => {
    if (!/^https?:/.test(src)) return null
    if (new URL(src).origin === location.origin) return src
    return relais ? relais(src) : null
  }
  const images = [...racine.querySelectorAll('img')].filter((i) => retenu(i) && adresse(i.currentSrc || i.src) !== null)
  const locales = new Map<string, string | null>()
  await Promise.all(
    [...new Set(images.map((i) => i.currentSrc || i.src))].map(async (src) => {
      const r = await fetch(adresse(src)!, { credentials: 'same-origin' }).catch(() => null)
      locales.set(src, r?.ok ? URL.createObjectURL(await r.blob()) : null)
    }),
  )
  const remises: (() => void)[] = []
  for (const img of images) {
    const locale = locales.get(img.currentSrc || img.src)
    if (!locale) continue
    const { srcset } = img
    const src = img.getAttribute('src')
    img.srcset = ''
    img.src = locale
    remises.push(() => {
      if (src === null) img.removeAttribute('src')
      else img.setAttribute('src', src)
      img.srcset = srcset
    })
  }
  await Promise.all(images.map((i) => i.decode().catch(() => {})))
  return () => {
    for (const r of remises) r()
    for (const l of locales.values()) if (l) URL.revokeObjectURL(l)
  }
}
