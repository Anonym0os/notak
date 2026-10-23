import type { Trait } from '../../coeur/tableau'
import { traitVise } from './trace'

/**
 * La sélection de traits, commune au croquis et au dessin sur la toile : le rectangle d'un trait, la marquise, le
 * déplacement, le changement d'un réglage sur le choix, les flèches. Rien ici ne connaît le repère : les nombres
 * sont ceux de la feuille (croquis) ou du tableau (dessin), au choix de l'appelant.
 */

export interface Boite {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Le rectangle d'un trait, son épaisseur comprise, élargi de `marge` de chaque côté. */
export function boiteTrait(t: Trait, marge = 0): Boite {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (let i = 0; i < t.points.length; i += 2) {
    const [x, y] = [t.points[i]!, t.points[i + 1]!]
    ;[x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)]
  }
  const m = marge + t.epaisseur / 2
  return { x0: x0 - m, y0: y0 - m, x1: x1 + m, y1: y1 + m }
}

export const seTouchent = (a: Boite, b: Boite): boolean => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1

/** Les traits dont le rectangle rencontre la marquise (donnée dans n'importe quel sens). */
export function traitsDansMarquise(traits: readonly Trait[], m: Boite): Trait[] {
  const r = { x0: Math.min(m.x0, m.x1), y0: Math.min(m.y0, m.y1), x1: Math.max(m.x0, m.x1), y1: Math.max(m.y0, m.y1) }
  return traits.filter((t) => seTouchent(boiteTrait(t), r))
}

/** Les traits choisis, décalés de (dx, dy) ; les autres restent les mêmes objets. `choix` suit les nouveaux traits. */
export function deplacerTraits(traits: readonly Trait[], choix: ReadonlySet<Trait>, dx: number, dy: number): { traits: Trait[]; choix: Set<Trait> } {
  return appliquerAuChoix(traits, choix, (t) => ({ ...t, points: t.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) }))
}

/** Les traits choisis passés par `f` ; les autres restent les mêmes objets. `choix` suit les nouveaux traits. */
export function appliquerAuChoix(traits: readonly Trait[], choix: ReadonlySet<Trait>, f: (t: Trait) => Trait): { traits: Trait[]; choix: Set<Trait> } {
  const suivants = new Set<Trait>()
  const apres = traits.map((t) => {
    if (!choix.has(t)) return t
    const neuf = f(t)
    suivants.add(neuf)
    return neuf
  })
  return { traits: apres, choix: suivants }
}

/** La gomme par trait entier : ce qui reste quand on retire les traits `retires`. */
export const sansTraits = (traits: readonly Trait[], retires: ReadonlySet<Trait>): Trait[] => traits.filter((t) => !retires.has(t))

/**
 * Un appui de l'outil Sélection sur un trait. `ajoute` (Maj ou ⌘) bascule le trait dans le choix ; sinon un trait
 * déjà choisi garde tout le choix, et un autre le remplace. `glisse` : y a-t-il de quoi déplacer (retirer un trait
 * du choix n'ouvre pas de glisser).
 */
export function appuiSurTrait(choix: ReadonlySet<Trait>, trait: Trait, ajoute: boolean): { choix: ReadonlySet<Trait>; glisse: boolean } {
  let suite: ReadonlySet<Trait> = choix
  if (ajoute) {
    const c = new Set(choix)
    if (c.has(trait)) c.delete(trait)
    else c.add(trait)
    suite = c
  } else if (!choix.has(trait)) suite = new Set([trait])
  return { choix: suite, glisse: suite.has(trait) }
}

/** Le décalage qu'une flèche demande, en unités du repère : un pixel d'écran (dix avec Maj). `null` : ce n'est pas une flèche. */
export function decalageFleche(touche: string, maj: boolean, uniteParPixel: number): [number, number] | null {
  const k = touche.toLowerCase()
  if (!k.startsWith('arrow')) return null
  const pas = (maj ? 10 : 1) * uniteParPixel
  return [k === 'arrowleft' ? -pas : k === 'arrowright' ? pas : 0, k === 'arrowup' ? -pas : k === 'arrowdown' ? pas : 0]
}

/** La pipette : la couleur du trait le plus haut sous le point (x, y), ou `null`. */
export function couleurSous(traits: readonly Trait[], x: number, y: number, rayon: number): string | null {
  const i = traitVise(traits, x, y, rayon)
  return i < 0 ? null : traits[i]!.couleur
}

/**
 * Amener devant (⌘⇧↑) ou derrière (⌘⇧↓) les traits choisis : ils gardent leur ordre entre eux, les autres le leur.
 * Rend le même tableau si rien ne change.
 */
export function ordonnerTraits(traits: readonly Trait[], choix: ReadonlySet<Trait>, devant: boolean): Trait[] {
  const choisis = traits.filter((t) => choix.has(t))
  const autres = traits.filter((t) => !choix.has(t))
  const suite = devant ? [...autres, ...choisis] : [...choisis, ...autres]
  return suite.every((t, i) => t === traits[i]) ? (traits as Trait[]) : suite
}
