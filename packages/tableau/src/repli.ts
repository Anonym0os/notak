import { type RefObject, useEffect, useRef, useState } from 'react'

/**
 * Le repli d'une barre de gauche trop courte pour ses outils. D'abord la taille des tuiles baisse en deux paliers
 * (grande 32 px dans 72 px de large, puis moyenne 28 px et petite 26 px dans 63 px) ; si cela ne suffit pas, on
 * retire l'outil au plus grand « ordre de repli » et on le range dans le « ••• » (grille de 3). Un outil d'ordre 0
 * ne se replie jamais ; d'ordre 10 000 il est toujours rangé ; un outil `masque` est retiré sans être rangé.
 */
export type Palier = 'grande' | 'moyenne' | 'petite'

export const PALIERS: Record<Palier, { largeur: number; icone: number; iconeLargeur: number; ecartTexte: number }> = {
  grande: { largeur: 72, icone: 32, iconeLargeur: 44, ecartTexte: 17 },
  moyenne: { largeur: 63, icone: 28, iconeLargeur: 40, ecartTexte: 15 },
  petite: { largeur: 63, icone: 26, iconeLargeur: 36, ecartTexte: 13 },
}
const ORDRE_PALIERS: Palier[] = ['grande', 'moyenne', 'petite']

export const ORDRE = { jamais: 0, tard: 10, defaut: 100, tot: 1000, toujours: 10000 } as const

/** `tuile` : icône et libellé ; `icone` : l'icône seule (outil de texte) ; `sep` : un séparateur. */
export type Genre = 'tuile' | 'icone' | 'sep'

export interface EntreeRepli {
  id: string
  genre: Genre
  ordre: number
  /** Retiré de la barre sans être rangé dans le « ••• ». */
  masque?: boolean
}

/** Le pas vertical d'une entrée, en px : sa hauteur plus l'écart qui la sépare de la suivante. */
export function pasDe(genre: Genre, palier: Palier, ecartBarre = 6): number {
  const p = PALIERS[palier]
  // Tuile : 4 + icône + 4 + libellé de 12 + 6 de marge basse.
  if (genre === 'tuile') return p.icone + 26 + ecartBarre
  if (genre === 'icone') return p.icone + p.ecartTexte
  return 13 + ecartBarre
}

export interface Repli {
  palier: Palier
  visibles: string[]
  /** Rangés dans le « ••• », dans l'ordre de la barre. */
  ranges: string[]
}

/**
 * Ce qui tient dans `hauteur` px : `fixe(palier)` est la place de ce qui ne se replie pas (marges, « ••• », corbeille).
 * Rend la taille de tuile retenue, les outils visibles et ceux qu'on range.
 */
export function replier({
  entrees,
  hauteur,
  fixe,
  ecartBarre = 6,
}: {
  entrees: readonly EntreeRepli[]
  hauteur: number
  fixe(palier: Palier): number
  ecartBarre?: number
}): Repli {
  const ranges = new Set<string>()
  const retires = new Set<string>()
  const retirer = (e: EntreeRepli) => {
    retires.add(e.id)
    if (!e.masque) ranges.add(e.id)
  }
  for (const e of entrees) if (e.ordre >= ORDRE.toujours) retirer(e)
  const restantes = () => entrees.filter((e) => !retires.has(e.id))
  const total = (palier: Palier) => fixe(palier) + restantes().reduce((s, e) => s + pasDe(e.genre, palier, ecartBarre), 0)

  let palier: Palier = 'petite'
  for (const p of ORDRE_PALIERS) {
    if (total(p) <= hauteur) {
      palier = p
      break
    }
  }
  // Même à la plus petite taille, cela déborde : on retire le plus grand ordre, le dernier de la barre d'abord.
  while (total(palier) > hauteur) {
    const candidats = restantes().filter((e) => e.ordre > ORDRE.jamais && e.genre !== 'sep')
    if (candidats.length === 0) break
    const plus = candidats.reduce((m, e) => (e.ordre >= m.ordre ? e : m))
    retirer(plus)
  }
  return {
    palier,
    visibles: restantes().map((e) => e.id),
    ranges: entrees.filter((e) => ranges.has(e.id)).map((e) => e.id),
  }
}

/**
 * Mesure la barre qui contient `ref` (le `nav` de la barre de gauche) par un ResizeObserver et la fenêtre, calcule
 * le repli, pose la taille des tuiles sur la barre (`data-palier`) et rend ce qui est rangé. La barre est
 * ancrée haut et bas : sa hauteur ne dépend pas de son contenu, donc le repli ne boucle pas.
 */
/**
 * La place de la barre, en ses propres pixels : de son haut au bas de ce qui la porte, moins 16 px de marge. La barre
 * se règle sur ses outils, sa hauteur ne dit donc pas la place qu'elle a. Le zoom de la taille de l'interface s'en
 * retire. Sans mise en page (un test), la hauteur de la fenêtre.
 */
function placeDe(barre: HTMLElement): number {
  const porteur = barre.offsetParent ?? barre.parentElement
  const p = porteur?.getBoundingClientRect()
  if (!p?.height) return window.innerHeight
  const zoom = Number.parseFloat(getComputedStyle(barre).zoom) || 1
  return (p.bottom - barre.getBoundingClientRect().top) / zoom - 16
}

export function useRepli(
  ref: RefObject<HTMLElement | null>,
  entrees: readonly EntreeRepli[],
  fixe: (palier: Palier) => number,
): { ranges: ReadonlySet<string>; visibles: { has(id: string): boolean }; palier: Palier } {
  const [etat, setEtat] = useState<{ cle: string; ranges: ReadonlySet<string>; visibles: ReadonlySet<string> | null; palier: Palier }>({ cle: '', ranges: new Set(), visibles: null, palier: 'grande' })
  const dernier = useRef({ entrees, fixe })
  dernier.current = { entrees, fixe }
  const cleEntrees = entrees.map((e) => `${e.id}:${e.genre}:${e.ordre}:${e.masque ? 1 : 0}`).join('|')

  useEffect(() => {
    const barre = ref.current?.closest<HTMLElement>('nav') ?? null
    if (!barre) return
    const calculer = () => {
      const { entrees: es, fixe: f } = dernier.current
      const r = replier({ entrees: es, hauteur: placeDe(barre), fixe: f })
      barre.dataset.palier = r.palier
      const cle = `${r.palier}/${r.ranges.join(',')}/${r.visibles.join(',')}`
      setEtat((e) => (e.cle === cle ? e : { cle, ranges: new Set(r.ranges), visibles: new Set(r.visibles), palier: r.palier }))
    }
    calculer()
    const obs = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(calculer)
    obs?.observe(barre)
    const porteur = barre.offsetParent ?? barre.parentElement
    if (porteur) obs?.observe(porteur)
    window.addEventListener('resize', calculer)
    return () => {
      obs?.disconnect()
      window.removeEventListener('resize', calculer)
    }
  }, [ref, cleEntrees])

  // Avant la première mesure, tout est visible.
  return { ranges: etat.ranges, visibles: etat.visibles ?? { has: () => true }, palier: etat.palier }
}
