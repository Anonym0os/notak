import type { EntreeBibliotheque } from '../api'

/**
 * Ce qu'on choisit dans la bibliothèque, comme dans le Finder : un clic choisit une tuile, ⌘ en ajoute ou en retire,
 * ⇧ prend tout ce qui sépare de la dernière choisie (l'ancre), un cadre tracé sur le fond prend ce qu'il touche, et les
 * flèches passent d'une tuile à sa voisine. Rien ici ne touche au DOM : les boîtes des tuiles sont données.
 */

/** La clé d'une tuile : sa toile, et son élément s'il en est un. */
export const cleDe = (e: Pick<EntreeBibliotheque, 'tableau' | 'element'>) => `${e.tableau}/${e.element ?? ''}`

export interface Selection {
  choisies: ReadonlySet<string>
  /** D'où part une suite prise avec ⇧ ; la dernière tuile choisie d'un clic. */
  ancre: string | null
}

export const RIEN: Selection = { choisies: new Set(), ancre: null }

export interface Touches {
  /** ⌘ (ou Ctrl) : ajoute ou retire. */
  ajout?: boolean
  /** ⇧ : la suite depuis l'ancre. */
  suite?: boolean
}

/** Un clic sur une tuile ; `ordre` : les tuiles dans l'ordre où on les lit, de section en section. */
export function cliquer(s: Selection, cle: string, ordre: readonly string[], { ajout = false, suite = false }: Touches = {}): Selection {
  if (suite && s.ancre !== null && ordre.includes(s.ancre)) {
    const [a, b] = [ordre.indexOf(s.ancre), ordre.indexOf(cle)]
    const plage = ordre.slice(Math.min(a, b), Math.max(a, b) + 1)
    return { choisies: new Set(ajout ? [...s.choisies, ...plage] : plage), ancre: s.ancre }
  }
  if (ajout) {
    const choisies = new Set(s.choisies)
    if (choisies.has(cle)) choisies.delete(cle)
    else choisies.add(cle)
    return { choisies, ancre: cle }
  }
  return { choisies: new Set([cle]), ancre: cle }
}

/** Tout, dans l'ordre de lecture. */
export const toutChoisir = (ordre: readonly string[]): Selection => ({ choisies: new Set(ordre), ancre: ordre[0] ?? null })

/** Ce qui reste choisi quand la liste change : ce qui n'y est plus en sort. */
export function garder(s: Selection, ordre: readonly string[]): Selection {
  const la = new Set(ordre)
  if ([...s.choisies].every((c) => la.has(c)) && (s.ancre === null || la.has(s.ancre))) return s
  return { choisies: new Set([...s.choisies].filter((c) => la.has(c))), ancre: s.ancre !== null && la.has(s.ancre) ? s.ancre : null }
}

export interface Boite {
  gauche: number
  haut: number
  droite: number
  bas: number
}

const touche = (a: Boite, b: Boite) => a.gauche < b.droite && b.gauche < a.droite && a.haut < b.bas && b.haut < a.bas

/** Le cadre tendu entre deux points, dans un sens ou dans l'autre. */
export const cadreEntre = (x0: number, y0: number, x1: number, y1: number): Boite => ({
  gauche: Math.min(x0, x1),
  haut: Math.min(y0, y1),
  droite: Math.max(x0, x1),
  bas: Math.max(y0, y1),
})

/**
 * Ce que choisit un cadre : les tuiles qu'il touche. Avec ⌘ ou ⇧, il s'ajoute à ce qui était choisi avant lui (⌘
 * retourne ce qu'il touche, comme le Finder) ; sinon, il le remplace.
 */
export function cadrer(avant: Selection, boites: ReadonlyMap<string, Boite>, cadre: Boite, { ajout = false, suite = false }: Touches = {}): Selection {
  const prises = [...boites].flatMap(([cle, b]) => (touche(b, cadre) ? [cle] : []))
  let choisies: Set<string>
  if (ajout) {
    choisies = new Set(avant.choisies)
    for (const c of prises) if (avant.choisies.has(c)) choisies.delete(c)
    for (const c of prises) if (!avant.choisies.has(c)) choisies.add(c)
  } else if (suite) choisies = new Set([...avant.choisies, ...prises])
  else choisies = new Set(prises)
  return { choisies, ancre: prises[0] ?? avant.ancre }
}

export type Direction = 'gauche' | 'droite' | 'haut' | 'bas'

/**
 * La tuile voisine dans une direction : à gauche et à droite, la précédente et la suivante dans l'ordre de lecture
 * (on passe d'une ligne à l'autre) ; en haut et en bas, la plus proche du même axe sur la ligne d'au-dessus ou
 * d'en dessous, d'une section à l'autre. `null` au bord.
 */
export function voisine(boites: ReadonlyMap<string, Boite>, ordre: readonly string[], depuis: string | null, direction: Direction): string | null {
  if (ordre.length === 0) return null
  if (depuis === null || !boites.has(depuis)) return ordre[0]!
  const i = ordre.indexOf(depuis)
  if (direction === 'gauche') return i > 0 ? ordre[i - 1]! : null
  if (direction === 'droite') return i < ordre.length - 1 ? ordre[i + 1]! : null
  const ici = boites.get(depuis)!
  const centre = (b: Boite) => (b.gauche + b.droite) / 2
  const versLeBas = direction === 'bas'
  const candidates = [...boites].filter(([, b]) => (versLeBas ? b.haut >= ici.bas - 1 : b.bas <= ici.haut + 1))
  if (candidates.length === 0) return null
  // La ligne la plus proche, puis la tuile la plus proche sur cette ligne.
  const ligne = versLeBas ? Math.min(...candidates.map(([, b]) => b.haut)) : Math.max(...candidates.map(([, b]) => b.bas))
  const surLaLigne = candidates.filter(([, b]) => Math.abs((versLeBas ? b.haut : b.bas) - ligne) < 2)
  surLaLigne.sort(([, a], [, b]) => Math.abs(centre(a) - centre(ici)) - Math.abs(centre(b) - centre(ici)))
  return surLaLigne[0]![0]
}

/**
 * Les toiles où l'on ne peut pas ranger ces tuiles : chaque toile choisie, et tout ce qu'elle contient, de dossier en
 * dossier (par `dans`).
 */
export function horsDAtteinte(entrees: readonly EntreeBibliotheque[], choisies: readonly EntreeBibliotheque[]): Set<string> {
  const interdites = new Set(choisies.flatMap((e) => (e.element === null ? [e.tableau] : [])))
  const toiles = entrees.filter((e) => e.element === null)
  for (let ajoute = true; ajoute; ) {
    ajoute = false
    for (const e of toiles) {
      if (e.dans && interdites.has(e.dans) && !interdites.has(e.tableau)) {
        interdites.add(e.tableau)
        ajoute = true
      }
    }
  }
  return interdites
}

/** La toile qui porte une entrée : la sienne pour une carte ou un document, son dossier pour une toile. */
export const porteuseDe = (e: Pick<EntreeBibliotheque, 'tableau' | 'element' | 'dans'>): string | null => (e.element === null ? e.dans : e.tableau)
