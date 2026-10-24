import type { Id, StructureArbre } from '../../../coeur/tableau'
import { type Lecture, enfantsDe } from '../modele/sujets'
import { type Boite, type Disposition, type Ecarts, type Lien, type Taille, ECART_CENTRAL, ECARTS } from './commun'

export type { Boite, Cote, Disposition, Lien, Taille, Trait } from './commun'
export { ECARTS, ECARTS_COMPACTS, emprise } from './commun'

/**
 * Comment un sujet range ses enfants. C'est la structure de docs/XMIND.md § 2 vue d'un sujet : une famille déclarée
 * (`structureClass`) agit sur ses enfants directs ; ses descendants en héritent une « suite » (sous une carte, chaque
 * moitié est un diagramme logique ; sous une chronologie, les branches pendent en arbre, alternativement dessous et
 * dessus).
 */
type Famille =
  | 'carte'
  | 'logique-d'
  | 'logique-g'
  | 'accolade-d'
  | 'accolade-g'
  | 'org-b'
  | 'org-h'
  | 'arbre-d'
  | 'arbre-g'
  /** Un arbre qui pousse vers le haut : les branches d'une chronologie, une sur deux. */
  | 'arbre-hd'
  | 'chrono-h'
  | 'chrono-v'
  | 'arete-g'
  | 'arete-d'
  | 'matrice-l'
  | 'matrice-c'

const FAMILLE: Record<StructureArbre, Famille> = {
  carte: 'carte',
  'carte-libre': 'carte',
  'carte-horaire': 'carte',
  'carte-antihoraire': 'carte',
  'logique-droite': 'logique-d',
  'logique-gauche': 'logique-g',
  'accolade-droite': 'accolade-d',
  'accolade-gauche': 'accolade-g',
  'organigramme-bas': 'org-b',
  'organigramme-haut': 'org-h',
  'arbre-droite': 'arbre-d',
  'arbre-gauche': 'arbre-g',
  'chronologie-horizontale': 'chrono-h',
  'chronologie-verticale': 'chrono-v',
  'arete-gauche': 'arete-g',
  'arete-droite': 'arete-d',
  'matrice-lignes': 'matrice-l',
  'matrice-colonnes': 'matrice-c',
}

/** La famille qu'un enfant hérite, au rang `i` parmi ses frères, quand il n'en déclare pas. */
function suite(f: Famille, i: number): Famille {
  switch (f) {
    case 'chrono-h':
      return i % 2 === 0 ? 'arbre-d' : 'arbre-hd'
    case 'chrono-v':
      return i % 2 === 0 ? 'logique-d' : 'logique-g'
    case 'arete-g':
    case 'matrice-l':
    case 'matrice-c':
      return 'logique-d'
    case 'arete-d':
      return 'logique-g'
    case 'carte':
      return 'logique-d'
    default:
      return f
  }
}

/** Un sujet posé relativement à son parent (le coin haut gauche de l'un depuis celui de l'autre). */
interface Place {
  dx: number
  dy: number
}

/** Ce qu'une famille a posé sous un sujet, pour tracer ensuite ses branches. */
interface Rangement {
  famille: Famille
  enfants: Id[]
  /** Sous une carte : les principaux de gauche. */
  aGauche?: Set<Id>
}

/** Le tracé indenté d'un arbre (organigramme, arbre) : à cette distance du bord du parent. */
const RETRAIT_ARBRE = 24
/** L'écart vertical d'un organigramme ou d'un arbre. */
const ECART_VERTICAL = 32
/** La marge intérieure d'une case de matrice. */
const MARGE_CASE = 14

/**
 * Où va chaque sujet d'une carte. Chaque branche se dispose comme un bloc rigide, du bas vers le haut : un sujet
 * range les blocs de ses enfants selon sa famille, puis son propre bloc est rangé par son parent. Le central est
 * centré en (0, 0) ; les flottants restent là où on les a posés. Linéaire en nombre de sujets.
 */
/** Un résumé à poser : son sujet, et les sujets de sa plage (déjà disposés) que son accolade rassemble. */
export interface ResumeAPoser {
  sujet: Id
  plage: Id[]
}

export function disposer(l: Lecture, taille: (id: Id) => Taille, e: Ecarts = ECARTS, libre = false, resumes: readonly ResumeAPoser[] = []): Disposition {
  const sortie: Disposition = { boites: new Map(), liens: [], traits: [] }
  if (!l.central) return sortie
  const places = new Map<Id, Place>()
  const rangements = new Map<Id, Rangement>()
  const visibles = (id: Id) => (l.sujets.get(id)?.replie ? [] : enfantsDe(l, id))
  const famille = (id: Id, heritee: Famille): Famille => {
    const s = l.sujets.get(id)?.structure
    if (!s) return heritee
    const f = FAMILLE[s]
    // Une carte ne rayonne qu'autour du central ; déclarée ailleurs, c'est un diagramme logique.
    return f === 'carte' && id !== l.central ? heritee : f
  }

  /** Range la branche de `id` ; rend son cadre, relatif au coin haut gauche du sujet. */
  const bloc = (id: Id, fam: Famille): Boite => {
    const t = taille(id)
    const cadre: Boite = { x: 0, y: 0, ...t }
    const enfants = visibles(id)
    if (enfants.length === 0) return cadre
    const ecart = id === l.central ? (e.central ?? ECART_CENTRAL) : e.principal
    const ranger = (ids: readonly Id[], f: (i: number) => Famille) => ids.map((x, i) => ({ id: x, t: taille(x), c: bloc(x, famille(x, f(i))) }))
    const poser = (id2: Id, dx: number, dy: number, c: Boite) => {
      const dec = libre ? l.sujets.get(id2)?.decalage : undefined
      const [px, py] = [dx + (dec?.x ?? 0), dy + (dec?.y ?? 0)]
      places.set(id2, { dx: px, dy: py })
      etendre(cadre, { x: c.x + px, y: c.y + py, l: c.l, h: c.h })
    }

    if (fam === 'carte') {
      const [droite, gauche] = partager(l, id, enfants)
      const d = ranger(droite, () => 'logique-d')
      const g = ranger(gauche, () => 'logique-g')
      empiler(d, t, e.secondaire, () => t.l + ecart, poser)
      empiler(g, t, e.secondaire, (b) => -ecart - b.t.l, poser)
      rangements.set(id, { famille: fam, enfants: [...droite, ...gauche], aGauche: new Set(gauche) })
      return cadre
    }
    rangements.set(id, { famille: fam, enfants: [...enfants] })
    const blocs = ranger(enfants, (i) => suite(fam, i))
    switch (fam) {
      case 'logique-d':
        empiler(blocs, t, e.secondaire, () => t.l + ecart, poser)
        break
      case 'logique-g':
        empiler(blocs, t, e.secondaire, (b) => -ecart - b.t.l, poser)
        break
      case 'accolade-d':
        empiler(blocs, t, e.secondaire, () => t.l + ecart + 12, poser)
        break
      case 'accolade-g':
        empiler(blocs, t, e.secondaire, (b) => -ecart - 12 - b.t.l, poser)
        break
      case 'org-b':
      case 'org-h': {
        const total = blocs.reduce((s, b, i) => s + b.c.l + (i > 0 ? e.secondaire * 2 : 0), 0)
        let x = t.l / 2 - total / 2
        for (const b of blocs) {
          const dy = fam === 'org-b' ? t.h + ECART_VERTICAL - b.c.y : -ECART_VERTICAL - (b.c.y + b.c.h)
          poser(b.id, x - b.c.x, dy, b.c)
          x += b.c.l + e.secondaire * 2
        }
        break
      }
      case 'arbre-d':
      case 'arbre-g':
      case 'arbre-hd': {
        const haut = fam === 'arbre-hd'
        let y = haut ? -e.secondaire * 2 : t.h + e.secondaire * 2
        for (const b of blocs) {
          const dx = fam === 'arbre-g' ? t.l - RETRAIT_ARBRE - b.t.l : RETRAIT_ARBRE
          if (haut) {
            poser(b.id, dx, y - (b.c.y + b.c.h), b.c)
            y -= b.c.h + e.secondaire
          } else {
            poser(b.id, dx, y - b.c.y, b.c)
            y += b.c.h + e.secondaire
          }
        }
        break
      }
      case 'chrono-h': {
        let x = t.l + ecart
        for (const b of blocs) {
          poser(b.id, x - Math.min(0, b.c.x), t.h / 2 - b.t.h / 2, b.c)
          x += b.c.l + ecart / 2
        }
        break
      }
      case 'chrono-v': {
        let y = t.h + ecart
        for (const b of blocs) {
          poser(b.id, t.l / 2 - b.t.l / 2, y - Math.min(0, b.c.y), b.c)
          y += b.c.h + ecart / 2
        }
        break
      }
      case 'arete-g':
      case 'arete-d': {
        // L'arête part du sujet ; les principaux pendent au-dessus puis au-dessous, chacun le long de son os.
        const sens = fam === 'arete-g' ? 1 : -1
        const curseurs = [ecart, ecart + 40]
        for (const [i, b] of blocs.entries()) {
          const dessus = i % 2 === 0
          const x0 = curseurs[i % 2]!
          const dx = sens > 0 ? t.l + x0 - b.c.x : -x0 - (b.c.x + b.c.l)
          const dy = dessus ? t.h / 2 - ECART_VERTICAL - (b.c.y + b.c.h) : t.h / 2 + ECART_VERTICAL - b.c.y
          poser(b.id, dx, dy, b.c)
          curseurs[i % 2] = x0 + b.c.l + ecart
        }
        break
      }
      case 'matrice-l':
      case 'matrice-c': {
        // Une ligne (ou une colonne) par principal : le principal dans la première case, ses enfants dans les suivantes.
        const lignes = blocs.map((b) => [{ ...b, c: { x: 0, y: 0, ...b.t } }, ...ranger(visibles(b.id), () => 'logique-d')])
        const transpose = fam === 'matrice-c'
        const n = Math.max(...lignes.map((x) => x.length))
        const plus = (v: number) => v + 2 * MARGE_CASE
        // Lignes : une colonne par rang de case. Colonnes : une colonne par principal.
        const colL = transpose
          ? lignes.map((x) => plus(Math.max(...x.map((c) => c.c.l))))
          : Array.from({ length: n }, (_, j) => plus(Math.max(0, ...lignes.map((x) => x[j]?.c.l ?? 0))))
        const ligH = transpose
          ? Array.from({ length: n }, (_, j) => plus(Math.max(0, ...lignes.map((x) => x[j]?.c.h ?? 0))))
          : lignes.map((x) => plus(Math.max(...x.map((c) => c.c.h))))
        const xs = cumul(colL, 0)
        const ys = cumul(ligH, t.h + ECART_VERTICAL)
        lignes.forEach((ligne, i) => {
          const tete = ligne[0]!
          ligne.forEach((c, j) => {
            const [col, lig] = transpose ? [i, j] : [j, i]
            const [cx, cy] = [xs[col]! + MARGE_CASE - c.c.x, ys[lig]! + MARGE_CASE - c.c.y]
            if (j === 0) poser(c.id, cx, cy, c.c)
            else {
              // Une case relève de son principal : sa place se compte depuis lui.
              const p = places.get(tete.id)!
              places.set(c.id, { dx: cx - p.dx, dy: cy - p.dy })
            }
          })
          // Le principal ne trace pas de branches vers ses cases : la grille les relie.
          rangements.set(tete.id, { famille: 'matrice-l', enfants: ligne.slice(1).map((c) => c.id) })
        })
        grilles.set(id, { xs, ys })
        etendre(cadre, { x: xs[0]!, y: ys[0]!, l: xs.at(-1)! - xs[0]!, h: ys.at(-1)! - ys[0]! })
        break
      }
    }
    return cadre
  }
  const grilles = new Map<Id, { xs: number[]; ys: number[] }>()

  const tc = taille(l.central)
  bloc(l.central, famille(l.central, 'carte'))
  // Les positions absolues, en descendant depuis le central et depuis chaque flottant.
  const descendre = (id: Id, x: number, y: number) => {
    sortie.boites.set(id, { x, y, ...taille(id) })
    const r = rangements.get(id)
    if (!r) return
    for (const enfant of r.enfants) {
      const p = places.get(enfant)
      if (p) descendre(enfant, x + p.dx, y + p.dy)
    }
  }
  descendre(l.central, -tc.l / 2, -tc.h / 2)
  for (const f of l.flottants) {
    const s = l.sujets.get(f)!
    const t = taille(f)
    const p = s.position ?? { x: 0, y: 0 }
    bloc(f, famille(f, p.x < 0 ? 'logique-g' : 'logique-d'))
    descendre(f, p.x - t.l / 2, p.y - t.h / 2)
  }
  // Les résumés, une fois leurs plages posées : une accolade le long de la plage, le sujet de résumé derrière elle.
  for (const r of resumes) {
    const boites = r.plage.map((x) => sortie.boites.get(x)).filter((b): b is Boite => !!b)
    if (boites.length === 0 || !l.sujets.has(r.sujet)) continue
    const [x0, x1] = [Math.min(...boites.map((b) => b.x)), Math.max(...boites.map((b) => b.x + b.l))]
    const [y0, y1] = [Math.min(...boites.map((b) => b.y)), Math.max(...boites.map((b) => b.y + b.h))]
    const gauche = x0 + (x1 - x0) / 2 < 0
    const t = taille(r.sujet)
    const xa = gauche ? x0 - 12 : x1 + 12
    const ym = (y0 + y1) / 2
    bloc(r.sujet, famille(r.sujet, gauche ? 'logique-g' : 'logique-d'))
    descendre(r.sujet, gauche ? xa - 24 - t.l : xa + 24, ym - t.h / 2)
    // La pointe de l'accolade regarde le sujet de résumé, ses bouts la plage.
    sortie.traits.push({ de: r.sujet, d: accolade(xa, y0, y1, ym, gauche ? 1 : -1) })
  }
  for (const [id, r] of rangements) tracer(id, r, sortie, grilles.get(id))
  return sortie
}

/** Les cases d'une matrice : où commence chaque colonne, puis la fin de la dernière. */
function cumul(tailles: number[], depart: number): number[] {
  const sortie = [depart]
  for (const t of tailles) sortie.push(sortie.at(-1)! + t)
  return sortie
}

function etendre(c: Boite, b: Boite) {
  const [x1, y1] = [Math.max(c.x + c.l, b.x + b.l), Math.max(c.y + c.h, b.y + b.h)]
  c.x = Math.min(c.x, b.x)
  c.y = Math.min(c.y, b.y)
  c.l = x1 - c.x
  c.h = y1 - c.y
}

/** Empile des blocs en colonne, centrés sur le milieu du parent ; `x` dit où va le sujet de chacun. */
function empiler(
  blocs: { id: Id; t: Taille; c: Boite }[],
  parent: Taille,
  ecart: number,
  x: (b: { t: Taille; c: Boite }) => number,
  poser: (id: Id, dx: number, dy: number, c: Boite) => void,
) {
  const total = blocs.reduce((s, b, i) => s + b.c.h + (i > 0 ? ecart : 0), 0)
  let y = parent.h / 2 - total / 2
  for (const b of blocs) {
    poser(b.id, x(b), y - b.c.y, b.c)
    y += b.c.h + ecart
  }
}

/**
 * Les principaux d'une carte, partagés entre la droite et la gauche. Équilibrée : la moitié (arrondie au-dessus) à
 * droite, dans l'ordre de haut en bas, puis le reste à gauche, de haut en bas. Horaire : la gauche se lit de bas en
 * haut (on fait le tour). Antihoraire : la gauche d'abord, de haut en bas, puis la droite de bas en haut. Non
 * équilibrée : `aDroite` principaux à droite, le reste à gauche.
 */
function partager(l: Lecture, central: Id, principaux: readonly Id[]): [Id[], Id[]] {
  const c = l.sujets.get(central)!
  const structure = c.structure ?? 'carte'
  const n = principaux.length
  if (structure === 'carte-libre') {
    const k = Math.max(0, Math.min(n, c.aDroite ?? n))
    return [principaux.slice(0, k), principaux.slice(k)]
  }
  const k = Math.ceil(n / 2)
  const [a, b] = [principaux.slice(0, k), principaux.slice(k)]
  if (structure === 'carte-horaire') return [a, b.toReversed()]
  if (structure === 'carte-antihoraire') return [b.toReversed(), a]
  return [a, b]
}

const n = (v: number) => Math.round(v * 10) / 10

/** Les branches d'un sujet, et les traits propres à sa famille. */
function tracer(id: Id, r: Rangement, d: Disposition, grille: { xs: number[]; ys: number[] } | undefined) {
  const p = d.boites.get(id)
  if (!p || (r.enfants.length === 0 && !grille)) return
  const lien = (vers: Id, cote: Lien['cote'], forme: Lien['forme']) => d.liens.push({ de: id, vers, cote, forme })
  const boites = r.enfants.map((x) => d.boites.get(x)).filter((b): b is Boite => !!b)
  switch (r.famille) {
    case 'carte':
      for (const x of r.enfants) lien(x, r.aGauche?.has(x) ? 'gauche' : 'droite', 'courbe')
      break
    case 'logique-d':
    case 'logique-g':
      for (const x of r.enfants) lien(x, r.famille === 'logique-d' ? 'droite' : 'gauche', 'courbe')
      break
    case 'org-b':
    case 'org-h':
      for (const x of r.enfants) lien(x, r.famille === 'org-b' ? 'bas' : 'haut', 'coudee')
      break
    case 'arbre-d':
    case 'arbre-g':
    case 'arbre-hd':
      for (const x of r.enfants) lien(x, r.famille === 'arbre-hd' ? 'haut' : 'bas', r.famille === 'arbre-g' ? 'arbre-g' : 'arbre')
      break
    case 'chrono-h':
      for (const x of r.enfants) lien(x, 'droite', 'droite')
      break
    case 'chrono-v':
      for (const x of r.enfants) lien(x, 'bas', 'droite')
      break
    case 'accolade-d':
    case 'accolade-g': {
      if (boites.length === 0) break
      const droite = r.famille === 'accolade-d'
      const x = droite ? p.x + p.l + 18 : p.x - 18
      const [y0, y1] = [Math.min(...boites.map((b) => b.y)), Math.max(...boites.map((b) => b.y + b.h))]
      d.traits.push({ de: id, d: accolade(x, y0, y1, p.y + p.h / 2, droite ? 1 : -1) })
      break
    }
    case 'arete-g':
    case 'arete-d': {
      if (boites.length === 0) break
      const sens = r.famille === 'arete-g' ? 1 : -1
      const ym = p.y + p.h / 2
      const x0 = sens > 0 ? p.x + p.l : p.x
      const bout = sens > 0 ? Math.max(...boites.map((b) => b.x + b.l)) : Math.min(...boites.map((b) => b.x))
      d.traits.push({ de: id, d: `M${n(x0)} ${n(ym)}H${n(bout)}` })
      for (const b of boites) {
        // Un os oblique, de l'arête au pied du sujet.
        const dessus = b.y + b.h < ym
        const [xs, ys] = [sens > 0 ? b.x : b.x + b.l, dessus ? b.y + b.h : b.y]
        d.traits.push({ de: id, d: `M${n(xs - sens * 28)} ${n(ym)}L${n(xs)} ${n(ys)}` })
      }
      break
    }
    case 'matrice-l':
    case 'matrice-c': {
      if (!grille) break
      const X = grille.xs.map((v) => n(p.x + v))
      const Y = grille.ys.map((v) => n(p.y + v))
      d.traits.push({ de: id, d: [...X.map((x) => `M${x} ${Y[0]}V${Y.at(-1)}`), ...Y.map((y) => `M${X[0]} ${y}H${X.at(-1)}`)].join('') })
      break
    }
  }
}

/** Une accolade verticale de `y0` à `y1`, à l'abscisse `x`, sa pointe vers `ym`, ouverte vers `sens`. */
function accolade(x: number, y0: number, y1: number, ym: number, sens: 1 | -1): string {
  const r = Math.min(8, (y1 - y0) / 4)
  const [a, b] = [x + sens * r, x]
  return `M${n(a)} ${n(y0)}Q${n(b)} ${n(y0)} ${n(b)} ${n(y0 + r)}V${n(ym - r)}Q${n(b)} ${n(ym)} ${n(b - sens * r)} ${n(ym)}Q${n(b)} ${n(ym)} ${n(b)} ${n(ym + r)}V${n(y1 - r)}Q${n(b)} ${n(y1)} ${n(a)} ${n(y1)}`
}
