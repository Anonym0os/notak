import { createTimeline } from 'animejs'
import { DUREE_BASE, ECRAN_DE_FIN, type Effet } from '../modele/gabarits'
import { courbe } from './courbes'
import { ANIMATIONS_DE_DECOR } from './decor'
import { type Mot, type Point, type Rect, type Trace, ecrireExterne, ecrireInterne, lireTransfo, partVisible, traceA } from './morphing'
import { type Copie, type Cote, type Genre, type Instantane, type Piste, type Plan, type Valeurs, type VueBoite, type VueElement, etatsInitiaux, minutage, piste, planAffichage, planifier, valeursA } from './transitions'

/**
 * L'exécution des transitions du Pitch : on mesure les deux diapositives montées l'une sur l'autre, on demande le plan
 * à `transitions.ts`, puis anime.js 4 fait avancer chaque piste sur sa courbe (celles de `courbes.ts`, données comme
 * fonctions) ; à chaque image on écrit les valeurs de la piste sur son élément. On ne touche qu'à `transform` et
 * `opacity`, sauf pour ce qui ne peut pas s'en contenter : le tracé d'une forme qui en devient une autre, le trait qui se
 * dessine (`stroke-dashoffset`), les attributs des décors SVG, les couleurs.
 *
 * Tout ce qu'on pose est noté, et effacé à la fin comme à l'arrêt : une transition interrompue ne laisse aucun élément
 * à moitié animé, la cible retrouve exactement son état naturel.
 */

/**
 * Une transition qui joue : `fini` se résout à la fin (vrai) ou à l'arrêt (faux) ; `arreter` saute à la fin et efface
 * tout.
 */
export interface Jeu {
  fini: Promise<boolean>
  arreter(): void
}

const FINIE: Jeu = { fini: Promise.resolve(true), arreter() {} }

/** L'utilisateur accepte le mouvement : le navigateur sait le dire et ne demande pas de le réduire. */
export function mouvementPermis(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// — Les éléments et ce qu'on y a posé —

type Sorte = 'html' | 'externe' | 'interne' | 'trace' | 'chemin' | 'bande' | 'copie-mots' | 'copie-trace'

interface Entree {
  els: Element[]
  sorte: Sorte
  /** Les valeurs de repos, pour les propriétés qu'une piste ne touche pas. */
  base: Valeurs
  /** Les valeurs courantes. */
  etat: Valeurs
  copie?: Copie
}

/** Ce qu'on a changé sur un élément, pour le rendre tel qu'il était. */
interface Avant {
  styles: Map<string, string>
  attributs: Map<string, string | null>
}

class Scene {
  readonly entrees = new Map<string, Entree>()
  private readonly avant = new Map<Element, Avant>()
  private longueurs = new WeakMap<Element, number>()

  inscrire(cote: Cote, ref: string, e: Omit<Entree, 'etat'>) {
    this.entrees.set(`${cote}|${ref}`, { ...e, etat: {} })
  }

  private noter(el: Element): Avant {
    let a = this.avant.get(el)
    if (!a) this.avant.set(el, (a = { styles: new Map(), attributs: new Map() }))
    return a
  }

  style(el: Element, propriete: string, valeur: string) {
    const s = (el as HTMLElement).style
    if (!s) return
    const a = this.noter(el)
    if (!a.styles.has(propriete)) a.styles.set(propriete, s.getPropertyValue(propriete))
    s.setProperty(propriete, valeur)
  }

  attribut(el: Element, nom: string, valeur: string) {
    const a = this.noter(el)
    if (!a.attributs.has(nom)) a.attributs.set(nom, el.getAttribute(nom))
    el.setAttribute(nom, valeur)
  }

  longueur(el: Element): number {
    let l = this.longueurs.get(el)
    if (l === undefined) {
      l = el.getAttribute('pathLength') === '1' ? 1 : typeof (el as SVGGeometryElement).getTotalLength === 'function' ? (el as SVGGeometryElement).getTotalLength() : 0
      this.longueurs.set(el, l)
    }
    return l
  }

  /** Écrit l'état courant d'une entrée sur ses éléments. */
  ecrire(e: Entree) {
    const v = { ...e.base, ...e.etat }
    for (const el of e.els) {
      if (v.opacite !== undefined && e.sorte !== 'copie-trace') this.style(el, 'opacity', String(v.opacite))
      switch (e.sorte) {
        case 'html':
        case 'copie-mots':
          if (['x', 'y', 'sx', 'sy'].some((k) => k in e.etat)) {
            this.style(el, 'transform-origin', '0 0')
            this.style(el, 'transform', `translate(${v.x ?? 0}px, ${v.y ?? 0}px) scale(${v.sx ?? 1}, ${v.sy ?? 1})`)
          }
          if (typeof v.couleur === 'string' && 'couleur' in e.etat) this.style(el, 'color', v.couleur)
          if (typeof v.fond === 'string' && 'fond' in e.etat) this.style(el, 'background-color', v.fond)
          break
        case 'externe':
          if ('cx' in e.etat || 'cy' in e.etat) this.attribut(el, 'transform', ecrireExterne({ cx: Number(v.cx ?? 0), cy: Number(v.cy ?? 0) }))
          break
        case 'interne':
          if (['rotation', 'sx', 'sy'].some((k) => k in e.etat)) this.attribut(el, 'transform', ecrireInterne({ rotation: Number(v.rotation ?? 0), sx: Number(v.sx ?? 1), sy: Number(v.sy ?? 1) }))
          break
        case 'trace':
        case 'chemin':
          if (typeof v.dessin === 'number') {
            const l = this.longueur(el)
            if (l > 0) {
              this.style(el, 'stroke-dasharray', `${l} ${l}`)
              this.style(el, 'stroke-dashoffset', String(l * (1 - v.dessin)))
            }
          }
          break
        case 'bande':
          for (const [k, nom] of [
            ['bx', 'x'],
            ['by', 'y'],
            ['bl', 'width'],
            ['bh', 'height'],
          ] as const)
            if (k in e.etat) this.attribut(el, nom, String(v[k]))
          break
        case 'copie-trace': {
          const c = e.copie
          if (c?.genre !== 'trace') break
          const t = traceA(c.de, c.a, Number(v.morph ?? 0))
          el.setAttribute('d', t.d)
          el.setAttribute('stroke-width', String(t.trait))
          el.setAttribute('stroke', t.contour)
          el.setAttribute('fill', t.remplissage)
          el.setAttribute('opacity', String(v.opacite !== undefined ? Number(v.opacite) : t.opacite))
          break
        }
      }
    }
  }

  /** Rend chaque élément tel qu'il était. */
  effacer() {
    for (const [el, a] of this.avant) {
      const s = (el as HTMLElement).style
      for (const [p, v] of a.styles) v ? s.setProperty(p, v) : s.removeProperty(p)
      for (const [n, v] of a.attributs) v === null ? el.removeAttribute(n) : el.setAttribute(n, v)
    }
    this.avant.clear()
  }
}

// — La mesure —

/** La diapositive à sa taille de base : son coin et son échelle à l'écran. */
interface Repere {
  x: number
  y: number
  k: number
}

const repereDe = (racine: HTMLElement): Repere => {
  const r = racine.getBoundingClientRect()
  const k = racine.offsetWidth > 0 && r.width > 0 ? r.width / racine.offsetWidth : 1
  return { x: r.left, y: r.top, k }
}

const enBase = (r: DOMRect | { left: number; top: number; width: number; height: number }, o: Repere): Rect => ({ x: (r.left - o.x) / o.k, y: (r.top - o.y) / o.k, l: r.width / o.k, h: r.height / o.k })

/** L'opacité qu'on voit : celle de l'élément et de ses ancêtres, jusqu'à la diapositive. */
function opaciteVue(el: Element, racine: Element): number {
  let o = 1
  for (let x: Element | null = el; x && x !== racine; x = x.parentElement) {
    const cs = getComputedStyle(x)
    o *= Number.parseFloat(cs.opacity || '1')
    if (cs.display === 'none') return 0
  }
  return Number.isNaN(o) ? 1 : o
}

const policeDe = (cs: CSSStyleDeclaration) => `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`

/** Les mots d'un bloc de texte, ligne par ligne (une ligne : un enfant du bloc) ; les marqueurs comptent pour un mot. */
function motsDe(el: Element, o: Repere): { mots: Mot[]; noeuds: (Text | Element)[] } {
  const mots: Mot[] = []
  const noeuds: (Text | Element)[] = []
  const doc = el.ownerDocument
  ;[...el.children].forEach((ligne, i) => {
    const marche = doc.createTreeWalker(ligne, 1 | 4)
    for (let n = marche.nextNode(); n; n = marche.nextNode()) {
      if (n instanceof Element) {
        if (!n.classList.contains('notak-arbre-diapo-marqueur')) continue
        const cs = getComputedStyle(n)
        if (cs.visibility === 'hidden') continue
        mots.push({ texte: `￼${n.innerHTML}`, rect: enBase(n.getBoundingClientRect(), o), ligne: i, police: policeDe(cs), couleur: cs.color, marqueur: true })
        noeuds.push(n)
        continue
      }
      const t = n as Text
      const parent = t.parentElement
      if (!parent || parent.closest('.notak-arbre-diapo-marqueur')) continue
      const cs = getComputedStyle(parent)
      if (cs.visibility === 'hidden') continue
      for (const m of t.data.matchAll(/\S+/g)) {
        const r = doc.createRange()
        r.setStart(t, m.index)
        r.setEnd(t, m.index + m[0].length)
        const b = r.getBoundingClientRect()
        mots.push({ texte: m[0], rect: enBase(b, o), ligne: i, police: policeDe(cs), couleur: cs.color })
        // Le mot seul, pour sa copie.
        const copie = doc.createTextNode(m[0])
        noeuds.push(copie)
        ;(copie as Text & { source?: Element }).source = parent
      }
    }
  })
  return { mots, noeuds }
}

/** Les tracés d'une forme, échantillonnés à un point tous les trois px (deux au moins, 240 au plus). */
function tracesDe(svg: Element, o: Repere): Trace[] {
  const traces: Trace[] = []
  for (const g of svg.querySelectorAll('path, circle, ellipse, rect, line, polyline, polygon')) {
    const geo = g as SVGGeometryElement
    if (typeof geo.getTotalLength !== 'function' || typeof geo.getScreenCTM !== 'function') continue
    const ctm = geo.getScreenCTM()
    if (!ctm) continue
    const l = geo.getTotalLength()
    const n = Math.min(240, Math.max(2, Math.ceil(l * 0.33)))
    const points: Point[] = []
    for (let i = 0; i < n; i++) {
      const p = geo.getPointAtLength((l * i) / (n - 1)).matrixTransform(ctm)
      points.push([(p.x - o.x) / o.k, (p.y - o.y) / o.k])
    }
    const cs = getComputedStyle(geo)
    const ferme = ['circle', 'ellipse', 'rect', 'polygon'].includes(geo.tagName.toLowerCase()) || /z\s*$/i.test(geo.getAttribute('d') ?? '')
    traces.push({ points, ferme, trait: (Number.parseFloat(cs.strokeWidth) || 0) * (Math.hypot(ctm.a, ctm.b) / o.k), contour: cs.stroke, remplissage: cs.fill, opacite: Number.parseFloat(cs.opacity || '1') })
  }
  return traces
}

const genreDe = (el: Element): Genre => {
  if (el.classList.contains('notak-arbre-diapo-texte')) return 'texte'
  if (el.classList.contains('notak-arbre-diapo-forme')) return 'forme'
  if (el.classList.contains('notak-arbre-diapo-image')) return 'image'
  return 'bloc'
}

/** Ce qu'on sait d'une diapositive sans la mesurer : ce que le modèle en dit. */
export interface Fiche {
  niveau?: string | undefined
  premiere?: boolean | undefined
}

/**
 * L'instantané d'une diapositive. On inscrit chaque élément mesuré dans la scène, sous la référence que le plan
 * utilisera. `traces` : les clés des formes dont on échantillonne les tracés (le morphing ne les demande qu'aux formes
 * communes).
 */
function instantane(racine: HTMLElement, cote: 'source' | 'cible', scene: Scene, fiche: Fiche, traces: ReadonlySet<string>, mots: Map<string, (Text | Element)[]>): Instantane {
  const o = repereDe(racine)
  const cadre = racine.parentElement
  const theme = cadre?.getAttribute('data-theme') ?? ''
  const l = racine.offsetWidth
  const h = racine.offsetHeight
  const diapo: Rect = { x: 0, y: 0, l, h }
  const contenu = racine.querySelector(':scope > .notak-arbre-diapo-contenu')
  const decor = racine.querySelector(':scope > .notak-arbre-diapo-decor')
  if (cadre) scene.inscrire(cote, 'cadre', { els: [cadre], sorte: 'html', base: {} })
  if (contenu) scene.inscrire(cote, 'contenu', { els: [contenu], sorte: 'html', base: {} })
  if (decor) scene.inscrire(cote, 'decor', { els: [decor], sorte: 'html', base: {} })

  const boites: VueBoite[] = []
  const vues = new Map<string, number>()
  let n = 0
  for (const el of contenu?.querySelectorAll('[data-boite]') ?? []) {
    // Une zone qui porte une clé et contient d'autres boîtes : ce sont elles qu'on anime.
    if (el.querySelector('[data-boite]')) continue
    const brut = el.getAttribute('data-boite')!
    const fois = (vues.get(brut) ?? 0) + 1
    vues.set(brut, fois)
    const cle = fois > 1 ? `${brut}#${fois}` : brut
    const ref = `b${n++}`
    const genre = genreDe(el)
    const rect = enBase(el.getBoundingClientRect(), o)
    const fenetres = [diapo, ...[...racine.querySelectorAll('.notak-arbre-diapo-zone')].filter((z) => z.contains(el)).map((z) => enBase(z.getBoundingClientRect(), o))]
    const cs = getComputedStyle(el)
    const b: VueBoite = { ref, cle, genre, rect, opacite: opaciteVue(el, racine), visible: partVisible(rect, fenetres), couleur: cs.color }
    const etat = el.getAttribute('data-etat')
    if (etat) b.etat = etat as VueBoite['etat']
    if (genre === 'texte') {
      const m = motsDe(el, o)
      b.mots = m.mots
      mots.set(`${cote}|${ref}`, m.noeuds)
    }
    if (genre === 'forme') {
      if (traces.has(cle)) b.traces = tracesDe(el, o)
      scene.inscrire(cote, `trace:${ref}`, { els: [...el.querySelectorAll('path, circle, ellipse, rect, line, polyline, polygon')], sorte: 'trace', base: {} })
    }
    if (genre === 'image') {
      const img = el.querySelector('img')
      const svg = el.querySelector('svg')
      b.image = img ? img.currentSrc || img.getAttribute('src') || '' : svg ? `svg:${svg.innerHTML}` : ''
      b.fond = el.classList.contains('notak-arbre-diapo-image-fond')
    }
    scene.inscrire(cote, ref, { els: [el], sorte: 'html', base: { x: 0, y: 0, sx: 1, sy: 1 } })
    boites.push(b)
  }

  const decors: Instantane['decors'] = []
  const groupes = [...(decor?.querySelectorAll('[data-decor][data-rang]') ?? [])]
  groupes.forEach((g, i) => {
    const interne = g.firstElementChild
    const t = lireTransfo(g.getAttribute('transform'), interne?.getAttribute('transform') ?? null)
    const ref = `d${i}`
    scene.inscrire(cote, ref, { els: [g], sorte: 'externe', base: { cx: t.cx, cy: t.cy } })
    if (interne) scene.inscrire(cote, `${ref}i`, { els: [interne], sorte: 'interne', base: { rotation: t.rotation, sx: t.sx, sy: t.sy } })
    decors.push({ ref, interne: `${ref}i`, nom: g.getAttribute('data-decor') ?? '', rang: Number(g.getAttribute('data-rang')), t, rect: enBase(g.getBoundingClientRect(), o), opacite: opaciteVue(g, decor ?? racine) })
  })
  const bandes = [...(decor?.querySelectorAll('[data-decor="bande"]') ?? [])].map((r, i) => {
    const ref = `bande${i}`
    const nombre = (a: string) => Number.parseFloat(r.getAttribute(a) ?? '0') || 0
    scene.inscrire(cote, ref, { els: [r], sorte: 'bande', base: { bx: nombre('x'), by: nombre('y'), bl: nombre('width'), bh: nombre('height') } })
    return { ref, rect: { x: nombre('x'), y: nombre('y'), l: nombre('width'), h: nombre('height') } }
  })

  // Ce que les animations du thème visent dans le décor.
  const correspondances: Record<string, VueElement[]> = {}
  let m = 0
  for (const a of ANIMATIONS_DE_DECOR) {
    if (a.theme !== theme || a.cible === 'contenu' || correspondances[a.cible] || !decor) continue
    correspondances[a.cible] = [...decor.querySelectorAll(a.cible)].map((el) => {
      const ref = `s${m++}`
      const rect = enBase(el.getBoundingClientRect(), o)
      const tag = el.tagName.toLowerCase()
      if (tag === 'g' && el.hasAttribute('data-rang')) {
        const t = lireTransfo(el.getAttribute('transform'), el.firstElementChild?.getAttribute('transform') ?? null)
        scene.inscrire(cote, ref, { els: [el], sorte: 'externe', base: { cx: t.cx, cy: t.cy } })
        return { ref, rect, t }
      }
      if (tag === 'g') {
        const t = lireTransfo(el.parentElement?.getAttribute('transform') ?? null, el.getAttribute('transform'))
        scene.inscrire(cote, ref, { els: [el], sorte: 'interne', base: { rotation: t.rotation, sx: t.sx, sy: t.sy } })
        return { ref, rect, t }
      }
      scene.inscrire(cote, ref, { els: [el], sorte: 'chemin', base: {} })
      return { ref, rect, unitaire: el.getAttribute('pathLength') === '1' }
    })
  }

  const type = (racine.getAttribute('data-type') ?? 'sujet') as Instantane['type']
  const moment = racine.getAttribute('data-moment')
  return {
    l,
    h,
    theme,
    sujet: racine.getAttribute('data-sujet') ?? '',
    type,
    gabarit: racine.getAttribute('data-gabarit') ?? '',
    ...(fiche.niveau ? { niveau: fiche.niveau } : {}),
    ...(fiche.premiere ? { premiere: true } : {}),
    ...(moment === 'entree' || moment === 'sortie' ? { moment } : {}),
    boites,
    decors,
    bandes,
    correspondances,
  }
}

// — Les copies du morphing —

/** Le calque des copies : par-dessus le contenu de la cible, à la taille de base. */
function poserCalque(racine: HTMLElement): { calque: HTMLDivElement; svg: SVGSVGElement } {
  const doc = racine.ownerDocument
  const calque = doc.createElement('div')
  calque.className = 'notak-arbre-diapo-calque'
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', `0 0 ${racine.offsetWidth} ${racine.offsetHeight}`)
  svg.setAttribute('preserveAspectRatio', 'none')
  calque.append(svg)
  racine.append(calque)
  return { calque, svg }
}

const COPIER = ['font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'text-shadow', 'font-variation-settings']

function poserCopie(c: Copie, calque: HTMLDivElement, svg: SVGSVGElement, instants: { source: Instantane | null; cible: Instantane }, mots: Map<string, (Text | Element)[]>): Element | null {
  const doc = calque.ownerDocument
  if (c.genre === 'trace') {
    const p = doc.createElementNS('http://www.w3.org/2000/svg', 'path')
    p.setAttribute('stroke-linecap', 'round')
    p.setAttribute('stroke-linejoin', 'round')
    svg.append(p)
    return p
  }
  const vue = (c.cote === 'source' ? instants.source : instants.cible)?.boites.find((b) => b.ref === c.boite)
  const noeuds = mots.get(`${c.cote}|${c.boite}`)
  if (!vue?.mots || !noeuds) return null
  const boite = doc.createElement('div')
  boite.className = 'notak-arbre-diapo-copie'
  Object.assign(boite.style, { left: `${c.rect.x}px`, top: `${c.rect.y}px`, width: `${c.rect.l}px`, height: `${c.rect.h}px`, color: vue.mots[c.mots[0]!]?.couleur ?? '' })
  for (const i of c.mots) {
    const m = vue.mots[i]!
    const n = noeuds[i]!
    let el: HTMLElement
    if (n instanceof Element) {
      el = n.cloneNode(true) as HTMLElement
    } else {
      el = doc.createElement('span')
      el.textContent = n.data
      const source = (n as Text & { source?: Element }).source
      if (source) {
        const cs = getComputedStyle(source)
        for (const p of COPIER) el.style.setProperty(p, cs.getPropertyValue(p))
      }
      el.style.lineHeight = `${m.rect.h}px`
    }
    Object.assign(el.style, { position: 'absolute', left: `${m.rect.x - c.rect.x}px`, top: `${m.rect.y - c.rect.y}px`, width: `${m.rect.l}px`, height: `${m.rect.h}px`, margin: '0' })
    boite.append(el)
  }
  calque.append(boite)
  return boite
}

// — Jouer un plan —

/** Fait avancer les pistes ; à la fin (ou à l'arrêt), tout est effacé. */
function executer(scene: Scene, pistes: readonly Piste[], caches: Plan['caches'], total: number, nettoyer: (auBout: boolean) => void): Jeu {
  const ecrire = (cote: Cote, ref: string, v: Valeurs) => {
    const e = scene.entrees.get(`${cote}|${ref}`)
    if (!e) return
    Object.assign(e.etat, v)
    scene.ecrire(e)
  }
  for (const e of etatsInitiaux({ pistes: [...pistes], caches }).values()) ecrire(e.cote, e.ref, e.valeurs)
  let finir: (auBout: boolean) => void = () => {}
  const fini = new Promise<boolean>((r) => (finir = r))
  let fait = false
  const tl = createTimeline({ autoplay: true })
  // `auBout` : la transition est allée à son terme (et non arrêtée parce qu'on démonte la présentation).
  const terminer = (auBout: boolean) => {
    if (fait) return
    fait = true
    clearTimeout(garde)
    tl.cancel()
    scene.effacer()
    nettoyer(auBout)
    finir(auBout)
  }
  for (const p of pistes) {
    const o = { t: 0 }
    tl.add(o, { t: 1, duration: Math.max(1, p.duree), ease: courbe(p.courbe), onUpdate: () => !fait && ecrire(p.cote, p.ref, valeursA(p, o.t)) }, p.debut)
  }
  tl.then(() => terminer(true))
  // Si le moteur s'arrête (onglet caché), la transition ne retient pas la présentation au-delà de sa durée.
  const garde = setTimeout(() => terminer(true), total + 1000)
  return { fini, arreter: () => terminer(false) }
}

/** Les deux diapositives d'une transition : leur `.notak-arbre-diapo`, et ce que le modèle sait d'elles. */
export interface Bout {
  racine: HTMLElement
  fiche: Fiche
}

/** Joue la transition d'un saut, de la diapositive source (absente au démarrage) à la diapositive cible. */
export function jouerTransition(effet: Effet, source: Bout | null, cible: Bout): Jeu {
  if (effet.nom === 'aucun' || effet.duree <= 0) return FINIE
  const scene = new Scene()
  const mots = new Map<string, (Text | Element)[]>()
  // Les tracés ne s'échantillonnent qu'au morphing, et seulement pour les formes des deux côtés.
  let traces = new Set<string>()
  if (effet.nom === 'morphing' && source) {
    const cles = (r: HTMLElement) => new Set([...r.querySelectorAll('.notak-arbre-diapo-forme[data-boite]')].map((e) => e.getAttribute('data-boite')!))
    const a = cles(source.racine)
    traces = new Set([...cles(cible.racine)].filter((k) => a.has(k)))
  }
  const S = source ? instantane(source.racine, 'source', scene, source.fiche, traces, mots) : null
  const C = instantane(cible.racine, 'cible', scene, cible.fiche, traces, mots)
  const plan = planifier(effet, S, C)
  if (!plan.pistes.length) return FINIE
  const { calque, svg } = poserCalque(cible.racine)
  for (const c of plan.copies) {
    const el = poserCopie(c, calque, svg, { source: S, cible: C }, mots)
    if (el) scene.inscrire('calque', c.id, { els: [el], sorte: c.genre === 'trace' ? 'copie-trace' : 'copie-mots', base: c.genre === 'trace' ? { morph: 0 } : { x: 0, y: 0, sx: 1, sy: 1 }, copie: c })
  }
  if (plan.fondTransparent) {
    const cadre = cible.racine.parentElement
    if (cadre) scene.style(cadre, 'background', 'transparent')
    scene.style(cible.racine, 'background', 'transparent')
  }
  return executer(scene, plan.pistes, plan.caches, plan.minutage.total, (auBout) => {
    calque.remove()
    // La source va être démontée : qu'elle ne reparaisse pas, rendue à son état, le temps d'une image.
    if (source && auBout) masquer(source.racine.parentElement)
  })
}

const masquer = (el: Element | null | undefined) => el instanceof HTMLElement && (el.style.visibility = 'hidden')

/** L'animation d'affichage d'une diapositive arrivée (les bulles de Hubble Bubble) ; elle ne retient rien. */
export function jouerAffichage(racine: HTMLElement): Jeu {
  const scene = new Scene()
  const C = instantane(racine, 'cible', scene, {}, new Set(), new Map())
  const pistes = planAffichage(C)
  if (!pistes.length) return FINIE
  return executer(scene, pistes, [], Math.max(...pistes.map((p) => p.debut + p.duree)), () => {})
}

/**
 * L'écran de fin paraît (relevé 10 § 5.5) : son fond et la carte en 1 000 ms easeInOutCubic, pendant que « Merci »
 * rétrécit de toute la scène jusqu'à sa vignette ; la diapositive quittée se fond en 400 ms.
 */
export function jouerFin(source: HTMLElement | null, fin: HTMLElement): Jeu {
  const scene = new Scene()
  const d = ECRAN_DE_FIN.apparition
  const pistes: Piste[] = []
  const carte = fin.querySelector('.notak-arbre-diapo-fin-carte')
  const vignette = fin.querySelector<HTMLElement>('.notak-arbre-diapo-fin-vignette')
  const fond = getComputedStyle(fin).backgroundColor
  scene.inscrire('cible', 'fin', { els: [fin], sorte: 'html', base: {} })
  pistes.push(piste('cible', 'fin', { fond: 'rgba(0, 0, 0, 0)' }, { fond }, 0, d, 'easeInOutCubic'))
  if (carte) {
    scene.inscrire('cible', 'carte', { els: [carte], sorte: 'html', base: {} })
    pistes.push(piste('cible', 'carte', { opacite: 0 }, { opacite: 1 }, 0, d, 'easeInOutCubic'))
  }
  if (vignette && fin.offsetWidth > 0) {
    // La vignette part de toute la scène : ce qui pose sa boîte sur celle de l'écran.
    const f = fin.getBoundingClientRect()
    const v = vignette.getBoundingClientRect()
    const k = v.width > 0 ? f.width / v.width : 1
    scene.inscrire('cible', 'vignette', { els: [vignette], sorte: 'html', base: { x: 0, y: 0, sx: 1, sy: 1 } })
    pistes.push(piste('cible', 'vignette', { x: f.left - v.left, y: f.top - v.top, sx: k, sy: k }, { x: 0, y: 0, sx: 1, sy: 1 }, 0, d, 'easeInOutCubic'))
  }
  if (source) {
    scene.inscrire('source', 'cadre', { els: [source], sorte: 'html', base: {} })
    pistes.push(piste('source', 'cadre', { opacite: 1 }, { opacite: 0 }, 0, DUREE_BASE, 'easeOutQuad'))
  }
  return executer(scene, pistes, [], minutage(0, d, 0).total, (auBout) => auBout && masquer(source))
}

/** « Suivant » sur l'écran de fin : il s'efface en 400 ms linéaires. */
export function jouerSortieFin(fin: HTMLElement): Jeu {
  const scene = new Scene()
  scene.inscrire('cible', 'fin', { els: [fin], sorte: 'html', base: {} })
  return executer(scene, [piste('cible', 'fin', { opacite: 1 }, { opacite: 0 }, 0, ECRAN_DE_FIN.disparition, 'linear')], [], ECRAN_DE_FIN.disparition, (auBout) => auBout && masquer(fin))
}

/** La durée d'ouverture et de fermeture de l'agrandissement d'une image. */
export const DUREE_ZOOM = 300

/**
 * L'agrandissement d'une image (relevé 12 § 8.5) : la copie part de la place de l'image et grandit jusqu'à la sienne
 * (300 ms easeInCubic) pendant que le voile passe de 0,01 à 0,2 ; la fermeture refait le chemin (easeOutCubic) et laisse
 * la fenêtre cachée, pour qu'elle disparaisse sans revenir le temps d'une image.
 */
export function jouerZoom(fenetre: HTMLElement, copie: HTMLElement, voile: HTMLElement, image: Rect, sens: 'ouvrir' | 'fermer'): Jeu {
  const scene = new Scene()
  const c = copie.getBoundingClientRect()
  const f = fenetre.getBoundingClientRect()
  const ici: Rect = { x: c.left - f.left, y: c.top - f.top, l: c.width, h: c.height }
  const la = ici.l > 0 && ici.h > 0 ? { x: image.x - ici.x, y: image.y - ici.y, sx: image.l / ici.l, sy: image.h / ici.h } : { x: 0, y: 0, sx: 1, sy: 1 }
  scene.inscrire('cible', 'copie', { els: [copie], sorte: 'html', base: { x: 0, y: 0, sx: 1, sy: 1 } })
  scene.inscrire('cible', 'voile', { els: [voile], sorte: 'html', base: {} })
  const pleine = { x: 0, y: 0, sx: 1, sy: 1 }
  const ouvrir = sens === 'ouvrir'
  const pistes = [
    piste('cible', 'copie', ouvrir ? la : pleine, ouvrir ? pleine : la, 0, DUREE_ZOOM, ouvrir ? 'easeInCubic' : 'easeOutCubic'),
    piste('cible', 'voile', { opacite: ouvrir ? 0.01 : 0.2 }, { opacite: ouvrir ? 0.2 : 0.01 }, 0, DUREE_ZOOM, ouvrir ? 'easeInCubic' : 'easeOutCubic'),
  ]
  return executer(scene, pistes, [], DUREE_ZOOM, (auBout) => !ouvrir && auBout && masquer(fenetre))
}
