import type { Arbre, Id } from '../../../coeur/tableau'
import type { Boite, Disposition } from '../disposition'
import { type Lecture, branche, enfantsDe } from './sujets'

/** Où va un sujet qu'on lâche (docs/XMIND.md § 4). */
export type Lacher =
  /** Il devient le dernier enfant de `parent`. */
  | { type: 'enfant'; parent: Id }
  /** Il s'insère parmi les enfants de `parent`, au rang `index`. */
  | { type: 'inserer'; parent: Id; index: number }
  /** Il reste là où on l'a lâché : un flottant. */
  | { type: 'libre' }

/** Plus loin que ça de tout sujet, un sujet lâché devient flottant (px de carte). */
export const PORTEE_LACHER = 48

const distance = (b: Boite, p: { x: number; y: number }) => {
  const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.l))
  const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.h))
  return Math.hypot(dx, dy)
}

/**
 * Où lâcher `glisse` quand le pointeur est en `p` (px de carte). Sur un sujet : il en devient l'enfant. Près d'un sujet
 * (à moins de `PORTEE_LACHER`) : il s'insère à côté de lui, avant ou après selon le côté du pointeur. Ailleurs : libre.
 * Jamais dans sa propre branche. `inverse` (Maj tenue) échange l'attaché et le libre, comme Xmind.
 *
 * Deux réglages de la carte (onglet Carte) y changent : « Sujet flottant flexible » (un flottant glissé ne se rattache
 * à rien, Maj le permet le temps du geste) et « Chevauchement des sujets » (un sujet lâché sur un autre reste là, au
 * lieu d'en devenir l'enfant, sauf avec Maj ; l'insertion à côté d'un frère reste possible).
 */
export function ouLacher(l: Lecture, d: Disposition, glisse: Id, p: { x: number; y: number }, inverse = false, options: Arbre['options'] = {}): Lacher {
  if (options?.flottantSouple && l.sujets.get(glisse)?.genre === 'detache') return inverse ? ouLacher(l, d, glisse, p, false, { ...options, flottantSouple: false }) : { type: 'libre' }
  const interdits = new Set(branche(l, glisse))
  let proche: { id: Id; b: Boite; dist: number } | null = null
  for (const [id, b] of d.boites) {
    if (interdits.has(id)) continue
    const dist = distance(b, p)
    if (!proche || dist < proche.dist) proche = { id, b, dist }
  }
  // Chevauchement : sur un sujet, il se pose librement ; l'inverse (Maj) lui rend le rattachement.
  const posable = !!options?.chevauchement && !inverse
  const attache: Lacher | null = !proche
    ? null
    : proche.dist === 0
      ? posable
        ? { type: 'libre' }
        : { type: 'enfant', parent: proche.id }
      : proche.dist <= PORTEE_LACHER
        ? insertionPres(l, proche.id, proche.b, p, glisse)
        : null
  // Chevauchement : Maj rend le rattachement qu'il retient d'ordinaire, sur un sujet.
  if (inverse && options?.chevauchement && proche?.dist === 0) return { type: 'enfant', parent: proche.id }
  if (inverse) return attache ? { type: 'libre' } : proche ? { type: 'enfant', parent: proche.id } : { type: 'libre' }
  return attache ?? { type: 'libre' }
}

/** S'insérer à côté de `voisin` : parmi ses frères, avant lui si le pointeur est au-dessus de son milieu. Le central n'a pas de frères. */
function insertionPres(l: Lecture, voisin: Id, b: Boite, p: { x: number; y: number }, glisse: Id): Lacher {
  const s = l.sujets.get(voisin)
  if (!s || s.parent === undefined || s.genre === 'detache') return { type: 'enfant', parent: voisin }
  const freres = enfantsDe(l, s.parent).filter((x) => x !== glisse)
  const i = freres.indexOf(voisin)
  return { type: 'inserer', parent: s.parent, index: p.y < b.y + b.h / 2 ? i : i + 1 }
}
