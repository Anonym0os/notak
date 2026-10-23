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

export type Poignee = 'nw' | 'ne' | 'sw' | 'se'

const entre = (v: number, bas: number, haut: number) => Math.max(bas, Math.min(haut, v))

/** Le cadre glissé de `du`, `dv` (fractions de l'image) sans sortir de l'image. */
export function deplacerCadre(c: Cadre, du: number, dv: number): Cadre {
  return { ...c, x: entre(c.x + du, 0, 1 - c.l), y: entre(c.y + dv, 0, 1 - c.h) }
}

/** Un coin du cadre tiré de `du`, `dv` ; le coin opposé reste en place. */
export function tirerCadre(c: Cadre, poignee: Poignee, du: number, dv: number): Cadre {
  let [gauche, haut, droite, bas] = [c.x, c.y, c.x + c.l, c.y + c.h]
  if (poignee === 'nw' || poignee === 'sw') gauche = entre(gauche + du, 0, droite - COTE_MIN)
  else droite = entre(droite + du, gauche + COTE_MIN, 1)
  if (poignee === 'nw' || poignee === 'ne') haut = entre(haut + dv, 0, bas - COTE_MIN)
  else bas = entre(bas + dv, haut + COTE_MIN, 1)
  return { x: gauche, y: haut, l: droite - gauche, h: bas - haut }
}

const arrondi = (v: number) => Math.round(v * 10_000) / 10_000

/**
 * Ce que le cadre garde, en fractions de l'image d'origine : on défait le quart de tour. `undefined` : toute l'image.
 */
export function versSource(c: Cadre, rotation: 0 | 90 | 180 | 270): Recadrage | undefined {
  let r: Recadrage
  if (rotation === 90) r = { x: c.y, y: 1 - (c.x + c.l), largeur: c.h, hauteur: c.l }
  else if (rotation === 180) r = { x: 1 - (c.x + c.l), y: 1 - (c.y + c.h), largeur: c.l, hauteur: c.h }
  else if (rotation === 270) r = { x: 1 - (c.y + c.h), y: c.x, largeur: c.h, hauteur: c.l }
  else r = { x: c.x, y: c.y, largeur: c.l, hauteur: c.h }
  const propre = { x: arrondi(r.x), y: arrondi(r.y), largeur: arrondi(r.largeur), hauteur: arrondi(r.hauteur) }
  return propre.largeur >= 0.999 && propre.hauteur >= 0.999 ? undefined : propre
}

/** L'image avec ce recadrage, ou sans la clé quand elle est entière. */
export function avecRecadrage(c: Image, cadre: Cadre): Image {
  const { recadrage: _, ...reste } = c
  const r = versSource(cadre, rotationDe(c))
  return r ? { ...reste, recadrage: r } : reste
}
