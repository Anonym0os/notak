import type { Image, Recadrage } from '../../coeur/tableau'
import { rotationDe } from './geometrie'

/** Le cadre qu'on règle, en fractions de l'image montrée en entier (déjà tournée) : coin haut gauche, largeur, hauteur. */
export interface Cadre {
  x: number
  y: number
  l: number
  h: number
}

export const CADRE_PLEIN: Cadre = { x: 0, y: 0, l: 1, h: 1 }

/** Le plus petit côté qu'on laisse au cadre, en fraction de l'image. */
export const COTE_MIN = 0.05

/** Les quatre coins, puis les milieux des quatre bords (un bord tiré ne bouge que lui). */
export type Poignee = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w'

const entre = (v: number, bas: number, haut: number) => Math.max(bas, Math.min(haut, v))

/** Le cadre glissé de `du`, `dv` (fractions de l'image) sans sortir de l'image. */
export function deplacerCadre(c: Cadre, du: number, dv: number): Cadre {
  return { ...c, x: entre(c.x + du, 0, 1 - c.l), y: entre(c.y + dv, 0, 1 - c.h) }
}

/** Un coin ou un bord du cadre tiré de `du`, `dv` ; ce qui lui fait face reste en place. */
export function tirerCadre(c: Cadre, poignee: Poignee, du: number, dv: number): Cadre {
  let [gauche, haut, droite, bas] = [c.x, c.y, c.x + c.l, c.y + c.h]
  if (poignee.includes('w')) gauche = entre(gauche + du, 0, droite - COTE_MIN)
  else if (poignee.includes('e')) droite = entre(droite + du, gauche + COTE_MIN, 1)
  if (poignee.includes('n')) haut = entre(haut + dv, 0, bas - COTE_MIN)
  else if (poignee.includes('s')) bas = entre(bas + dv, haut + COTE_MIN, 1)
  return { x: gauche, y: haut, l: droite - gauche, h: bas - haut }
}

const arrondi = (v: number) => Math.round(v * 10_000) / 10_000

/**
 * Ce que le cadre garde, en fractions de l'image d'origine : on défait le quart de tour. `undefined` : toute l'image.
 */
export function versSource(c0: Cadre, rotation: 0 | 90 | 180 | 270, miroirs: { h?: boolean; v?: boolean } = {}): Recadrage | undefined {
  // Le miroir est celui de l'écran, appliqué après le quart de tour : on le défait d'abord.
  const c: Cadre = { x: miroirs.h ? 1 - (c0.x + c0.l) : c0.x, y: miroirs.v ? 1 - (c0.y + c0.h) : c0.y, l: c0.l, h: c0.h }
  let r: Recadrage
  if (rotation === 90) r = { x: c.y, y: 1 - (c.x + c.l), largeur: c.h, hauteur: c.l }
  else if (rotation === 180) r = { x: 1 - (c.x + c.l), y: 1 - (c.y + c.h), largeur: c.l, hauteur: c.h }
  else if (rotation === 270) r = { x: 1 - (c.y + c.h), y: c.x, largeur: c.h, hauteur: c.l }
  else r = { x: c.x, y: c.y, largeur: c.l, hauteur: c.h }
  const propre = { x: arrondi(r.x), y: arrondi(r.y), largeur: arrondi(r.largeur), hauteur: arrondi(r.hauteur) }
  return propre.largeur >= 0.999 && propre.hauteur >= 0.999 ? undefined : propre
}

/**
 * Le chemin inverse : le cadre à montrer pour un recadrage déjà posé, sur l'image entière tournée et retournée comme
 * à l'écran. Rouvrir l'outil part ainsi de ce qu'on voit, et valider sans rien toucher ne change rien. Le recadrage
 * vient du tableau (un autre appareil, une autre version) : un cadre hors de l'image y est ramené.
 */
export function depuisSource(r: Recadrage | undefined, rotation: 0 | 90 | 180 | 270, miroirs: { h?: boolean; v?: boolean } = {}): Cadre {
  if (!r || ![r.x, r.y, r.largeur, r.hauteur].every(Number.isFinite)) return CADRE_PLEIN
  const largeur = entre(r.largeur, COTE_MIN, 1)
  const hauteur = entre(r.hauteur, COTE_MIN, 1)
  const s = { x: entre(r.x, 0, 1 - largeur), y: entre(r.y, 0, 1 - hauteur), largeur, hauteur }
  let c: Cadre
  if (rotation === 90) c = { x: 1 - (s.y + s.hauteur), y: s.x, l: s.hauteur, h: s.largeur }
  else if (rotation === 180) c = { x: 1 - (s.x + s.largeur), y: 1 - (s.y + s.hauteur), l: s.largeur, h: s.hauteur }
  else if (rotation === 270) c = { x: s.y, y: 1 - (s.x + s.largeur), l: s.hauteur, h: s.largeur }
  else c = { x: s.x, y: s.y, l: s.largeur, h: s.hauteur }
  // Le miroir de l'écran vient après le quart de tour : on le rejoue en dernier.
  return { x: miroirs.h ? 1 - (c.x + c.l) : c.x, y: miroirs.v ? 1 - (c.y + c.h) : c.y, l: c.l, h: c.h }
}

/** Le cadre à montrer quand on ouvre le recadrage de cette image : sa partie gardée, telle qu'elle est à l'écran. */
export const cadreDe = (c: Image): Cadre => depuisSource(c.recadrage, rotationDe(c), { h: c.miroirH, v: c.miroirV })

/** L'image avec ce recadrage, ou sans la clé quand elle est entière. */
export function avecRecadrage(c: Image, cadre: Cadre): Image {
  const { recadrage: _, ...reste } = c
  const r = versSource(cadre, rotationDe(c), { h: c.miroirH, v: c.miroirV })
  // Un recadrage choisi à la main remplace le cadrage libre : le cadre suit ce qui est gardé.
  const { rapportCadre: _c, ...propre } = reste
  return r ? { ...propre, recadrage: r } : reste
}

const memeRecadrage = (a: Recadrage | undefined, b: Recadrage | undefined) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.largeur === b.largeur && a.hauteur === b.hauteur)

/**
 * Valider ce cadre change-t-il l'image ? Comparé valeur à valeur : l'ordre des clés d'un recadrage venu d'ailleurs
 * ne doit pas laisser dans l'historique un pas qui ne fait rien.
 */
export function recadrageChange(c: Image, cadre: Cadre): boolean {
  const apres = avecRecadrage(c, cadre)
  return !memeRecadrage(apres.recadrage, c.recadrage) || apres.rapportCadre !== c.rapportCadre
}
