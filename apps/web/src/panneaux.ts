import { type RefObject, createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useSyncExternalStore } from 'react'

/**
 * Les panneaux de l'en-tête (partager, notifications, activité, compte, « … », exporter, importer) : un seul mécanisme
 * pour tous. Un seul est ouvert à la fois ; en ouvrir un referme l'autre ; Échap le ferme et rend le focus à son
 * bouton ; un appui dehors le ferme ; et il ne sort jamais de la fenêtre.
 *
 * Un panneau peut en contenir un autre (le menu « … » porte l'activité, l'import, l'export) : l'ouvrir garde ouverts
 * ceux qui le contiennent. On l'indique en entourant le contenu du parent de `<DansPanneau id={…}>`.
 */

/** La chaîne des panneaux ouverts : le plus profond d'abord, puis ceux qui le contiennent. */
let ouverts: readonly string[] = []
const parents = new Map<string, string | null>()
const abonnes = new Set<() => void>()
const ecouter = (f: () => void) => {
  abonnes.add(f)
  return () => abonnes.delete(f)
}
const poser = (suite: readonly string[]) => {
  if (suite.length === ouverts.length && suite.every((id, i) => id === ouverts[i])) return
  ouverts = suite
  abonnes.forEach((f) => f())
}

/** Ouvre `id` (avec ses parents) et ferme tout le reste. */
function ouvrir(id: string) {
  const chaine: string[] = []
  for (let c: string | null | undefined = id; c; c = parents.get(c)) chaine.push(c)
  poser(chaine)
}

/** Ferme `id` et ce qu'il contient ; ses parents restent ouverts. */
function fermer(id: string) {
  const rang = ouverts.indexOf(id)
  if (rang >= 0) poser(ouverts.slice(rang + 1))
}

/** Ferme tout panneau d'en-tête ouvert. */
export const fermerPanneaux = () => poser([])

const Parent = createContext<string | null>(null)

/** Entoure le contenu d'un panneau : les panneaux qui s'y trouvent ont `id` pour parent. */
export const DansPanneau = Parent.Provider

/** Reste de la fenêtre qu'on laisse autour d'un panneau. */
export const MARGE_FENETRE = 8

/**
 * Ramène un panneau dans la fenêtre : décalé vers la gauche ou la droite s'il déborde. Sans effet pour un panneau
 * en flux ou déjà posé par rapport à la fenêtre (mobile).
 */
export function borner(el: HTMLElement | null) {
  if (!el) return
  el.style.translate = ''
  const position = getComputedStyle(el).position
  if (position !== 'absolute') return
  const { left, right } = el.getBoundingClientRect()
  const largeur = document.documentElement.clientWidth || window.innerWidth
  let dx = 0
  if (right > largeur - MARGE_FENETRE) dx = largeur - MARGE_FENETRE - right
  if (left + dx < MARGE_FENETRE) dx = MARGE_FENETRE - left
  if (dx) el.style.translate = `${Math.round(dx)}px 0`
}

export interface Panneau<A extends HTMLElement, B extends HTMLElement> {
  ouvert: boolean
  /** Ouvre (et ferme les autres) ou ferme. */
  regler(ouvert: boolean): void
  basculer(): void
  /** À poser sur ce qui contient le bouton et le panneau : un appui dedans ne ferme pas le panneau. */
  ancre: RefObject<A | null>
  /** À poser sur le bouton, qui retrouve le focus à la fermeture par Échap. */
  bouton: RefObject<B | null>
  /** À poser sur le panneau lui-même, pour le tenir dans la fenêtre. */
  panneau: (el: HTMLElement | null) => void
  /** L'identité du panneau, à donner à `DansPanneau` s'il en contient d'autres. */
  id: string
}

export function usePanneau<A extends HTMLElement = HTMLDivElement, B extends HTMLElement = HTMLButtonElement>(): Panneau<A, B> {
  const id = useId()
  const parent = useContext(Parent)
  parents.set(id, parent)
  const ancre = useRef<A>(null)
  const bouton = useRef<B>(null)
  const el = useRef<HTMLElement | null>(null)
  const ouvert = useSyncExternalStore(ecouter, () => ouverts.includes(id))
  const dernier = useSyncExternalStore(ecouter, () => ouverts[0] === id)

  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: PointerEvent) => {
      if (!ancre.current?.contains(e.target as Node)) fermer(id)
    }
    document.addEventListener('pointerdown', dehors, true)
    return () => document.removeEventListener('pointerdown', dehors, true)
  }, [ouvert, id])

  // Échap ne ferme que le plus profond : le suivant au coup d'après.
  useEffect(() => {
    if (!dernier) return
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      fermer(id)
      bouton.current?.focus()
    }
    document.addEventListener('keydown', touche)
    return () => document.removeEventListener('keydown', touche)
  }, [dernier, id])

  useLayoutEffect(() => {
    if (!ouvert) return
    borner(el.current)
    const redessiner = () => borner(el.current)
    window.addEventListener('resize', redessiner)
    const obs = typeof ResizeObserver === 'undefined' || !el.current ? null : new ResizeObserver(redessiner)
    if (el.current) obs?.observe(el.current)
    return () => {
      window.removeEventListener('resize', redessiner)
      obs?.disconnect()
    }
  }, [ouvert])

  // Un panneau qui disparaît ne reste pas « ouvert » pour personne.
  useEffect(() => {
    parents.set(id, parent)
    return () => {
      fermer(id)
      parents.delete(id)
    }
  }, [id, parent])

  const regler = useCallback((v: boolean) => (v ? ouvrir(id) : fermer(id)), [id])
  const basculer = useCallback(() => (ouverts.includes(id) ? fermer(id) : ouvrir(id)), [id])
  const panneau = useCallback((n: HTMLElement | null) => {
    el.current = n
    borner(n)
  }, [])
  return { ouvert, regler, basculer, ancre, bouton, panneau, id }
}
