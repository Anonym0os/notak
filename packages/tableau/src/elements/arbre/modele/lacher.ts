import type { Arbre, Id } from '../../../coeur/tableau'
import type { Boite, Disposition } from '../disposition'
import { coller, extraire } from './insertions'
import { type Lecture, basculerRepli, branche, enfantsDe, lire, rattacher } from './sujets'

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
 * Jamais dans sa propre branche, ni dans celle d'un `compagnons` (les autres sujets qu'on glisse avec lui).
 *
 * Maj (`inverse`), comme Xmind : un sujet attaché se détache, quelle que soit la cible (il flotte là où on le lâche) ;
 * un flottant, lui, peut alors se rattacher (cf. « Sujet flottant flexible »).
 *
 * Deux réglages de la carte (onglet Carte) y changent : « Sujet flottant flexible » (un flottant glissé ne se rattache
 * à rien, Maj le permet le temps du geste) et « Chevauchement des sujets » (un sujet lâché sur un autre reste là, au
 * lieu d'en devenir l'enfant, sauf avec Maj ; l'insertion à côté d'un frère reste possible).
 */
export function ouLacher(l: Lecture, d: Disposition, glisse: Id, p: { x: number; y: number }, inverse = false, options: Arbre['options'] = {}, compagnons: readonly Id[] = []): Lacher {
  const flottant = l.sujets.get(glisse)?.genre === 'detache'
  if (options?.flottantSouple && flottant) return inverse ? ouLacher(l, d, glisse, p, false, { ...options, flottantSouple: false }, compagnons) : { type: 'libre' }
  const tetes = new Set([glisse, ...compagnons])
  const interdits = new Set([...tetes].flatMap((x) => branche(l, x)))
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
        ? insertionPres(l, proche.id, proche.b, p, tetes)
        : null
  // Chevauchement : Maj rend le rattachement qu'il retient d'ordinaire, sur un sujet.
  if (inverse && options?.chevauchement && proche?.dist === 0) return { type: 'enfant', parent: proche.id }
  if (inverse) return flottant && !attache && proche ? { type: 'enfant', parent: proche.id } : { type: 'libre' }
  return attache ?? { type: 'libre' }
}

/** S'insérer à côté de `voisin` : parmi ses frères, avant lui si le pointeur est au-dessus de son milieu. Le central n'a pas de frères. */
function insertionPres(l: Lecture, voisin: Id, b: Boite, p: { x: number; y: number }, glisses: ReadonlySet<Id>): Lacher {
  const s = l.sujets.get(voisin)
  if (!s || s.parent === undefined || s.genre === 'detache') return { type: 'enfant', parent: voisin }
  const freres = enfantsDe(l, s.parent).filter((x) => !glisses.has(x))
  const i = freres.indexOf(voisin)
  return { type: 'inserer', parent: s.parent, index: p.y < b.y + b.h / 2 ? i : i + 1 }
}

/** Le frère devant lequel s'insèrent les sujets déplacés, parmi ceux qui ne bougent pas : `undefined` pour la fin de la liste. */
function ancreDe(l: Lecture, cible: Lacher, deplaces: ReadonlySet<Id>): Id | undefined {
  return cible.type === 'inserer' ? enfantsDe(l, cible.parent).filter((x) => !deplaces.has(x))[cible.index] : undefined
}

/** Le rang où ranger `id` parmi les enfants de `parent` pour qu'il tombe juste devant `ancre` (à la fin s'il n'y en a pas). */
const rangAvant = (a: Arbre, parent: Id, id: Id, ancre: Id | undefined): number =>
  ancre === undefined ? Number.MAX_SAFE_INTEGER : enfantsDe(lire(a), parent).filter((x) => x !== id).indexOf(ancre)

/**
 * Lâche ces sujets sur une cible (`enfant` ou `inserer`) : ils se rattachent ensemble, dans l'ordre donné, à la place
 * que le repère montrait. Une branche repliée qui les reçoit se déplie, pour qu'on les voie. Un lâcher libre n'est pas
 * l'affaire de cette fonction : la carte reste telle quelle.
 */
export function deplacerSujets(a: Arbre, ids: readonly Id[], cible: Lacher): Arbre {
  if (cible.type === 'libre') return a
  const ancre = ancreDe(lire(a), cible, new Set(ids))
  let arbre = a
  for (const id of ids) arbre = rattacher(arbre, id, cible.parent, rangAvant(arbre, cible.parent, id, ancre))
  return lire(arbre).sujets.get(cible.parent)?.replie ? basculerRepli(arbre, cible.parent) : arbre
}

/**
 * Comme `deplacerSujets`, mais ⌥ : ce sont des copies de leurs branches qui se posent, les originaux restent. Rend la
 * carte et les copies. Pour un lâcher libre, chaque copie flotte à son `centres` (le centre de sa boîte, px de carte).
 */
export function copierSujets(a: Arbre, ids: readonly Id[], cible: Lacher, centres: ReadonlyMap<Id, { x: number; y: number }> = new Map()): [Arbre, Id[]] {
  const ancre = ancreDe(lire(a), cible, new Set(ids))
  let arbre = a
  const copies: Id[] = []
  for (const id of ids) {
    const fragment = extraire(arbre, [id])
    if (!fragment) continue
    if (cible.type === 'libre') {
      const [neuf, collees] = coller(arbre, fragment, { position: centres.get(id) ?? { x: 0, y: 0 } })
      arbre = neuf
      copies.push(...collees)
      continue
    }
    const [neuf, collees] = coller(arbre, fragment, { parent: cible.parent })
    arbre = neuf
    for (const copie of collees) {
      arbre = rattacher(arbre, copie, cible.parent, rangAvant(arbre, cible.parent, copie, ancre))
      copies.push(copie)
    }
  }
  if (cible.type !== 'libre' && copies.length > 0 && lire(arbre).sujets.get(cible.parent)?.replie) arbre = basculerRepli(arbre, cible.parent)
  return [arbre, copies]
}
