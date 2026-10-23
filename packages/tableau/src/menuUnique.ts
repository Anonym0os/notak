import { type RefObject, useEffect, useId, useRef, useSyncExternalStore } from 'react'

/**
 * Les menus qui s'ouvrent sous un bouton (une palette, une échéance, des réactions, le tiroir de la barre) : un seul
 * à la fois. En ouvrir un referme l'autre, et un appui hors de son ancre le referme.
 */

let courant: string | null = null
const abonnes = new Set<() => void>()
const ecouter = (f: () => void) => {
  abonnes.add(f)
  return () => abonnes.delete(f)
}
const changer = (id: string | null) => {
  if (courant === id) return
  courant = id
  abonnes.forEach((f) => f())
}

/** Ferme le menu ouvert, quel qu'il soit. */
export const fermerMenus = () => changer(null)

const ancres = new Map<string, RefObject<HTMLElement | null>>()

/**
 * Ce menu est-il ouvert ? Oui s'il est le menu courant, ou s'il contient le menu courant : le « … » d'une barre
 * reste ouvert quand l'un des menus qu'il porte s'ouvre à son tour.
 */
function estOuvert(id: string): boolean {
  if (courant === id) return true
  if (courant === null) return false
  const moi = ancres.get(id)?.current
  const lui = ancres.get(courant)?.current
  return !!moi && !!lui && moi !== lui && moi.contains(lui)
}

/** Le menu le plus proche qui contient `ancre` et le point visé : il reste ouvert quand le menu interne se ferme. */
function parentContenant(id: string, cible: Node): string | null {
  const moi = ancres.get(id)?.current
  let meilleur: { id: string; el: HTMLElement } | null = null
  for (const [autre, ref] of ancres) {
    const el = ref.current
    if (autre === id || !el || !moi || !el.contains(moi) || !el.contains(cible)) continue
    if (!meilleur || meilleur.el.contains(el)) meilleur = { id: autre, el }
  }
  return meilleur?.id ?? null
}

export interface OptionsMenu {
  /** Un appui hors de l'ancre referme le menu (vrai par défaut). Faux pour ce qui s'ouvre ailleurs que sous le bouton. */
  fermerAuClicDehors?: boolean
}

/**
 * L'état d'un menu : ouvert ou non, la façon de l'ouvrir ou de le fermer, et l'ancre à poser sur ce qui contient
 * le bouton et le menu (un appui dedans ne le ferme pas). Un menu posé dans l'ancre d'un autre ne le ferme pas.
 */
export function useMenu<T extends HTMLElement = HTMLDivElement>(options: OptionsMenu = {}): [boolean, (ouvert: boolean) => void, RefObject<T | null>] {
  const id = useId()
  const ancre = useRef<T>(null)
  const dehorsFerme = options.fermerAuClicDehors ?? true
  const ouvert = useSyncExternalStore(ecouter, () => estOuvert(id))

  useEffect(() => {
    ancres.set(id, ancre)
    return () => void ancres.delete(id)
  }, [id])
  useEffect(() => {
    if (!ouvert || !dehorsFerme) return
    const dehors = (e: PointerEvent) => {
      // Seul le menu courant se referme : ses parents restent ouverts si l'appui tombe chez eux.
      if (courant !== id || ancre.current?.contains(e.target as Node)) return
      changer(parentContenant(id, e.target as Node))
    }
    document.addEventListener('pointerdown', dehors, true)
    return () => document.removeEventListener('pointerdown', dehors, true)
  }, [ouvert, dehorsFerme, id])
  // Un menu qui disparaît (la sélection a changé) ne reste pas « ouvert » pour personne.
  useEffect(() => () => void (courant === id && changer(null)), [id])

  const basculer = (v: boolean) => {
    if (v) changer(id)
    // Refermer un menu interne laisse ouvert celui qui le porte ; refermer un menu qui porte un autre ferme les deux.
    else if (courant === id) changer(parentContenant(id, ancre.current ?? document.body))
    else if (estOuvert(id)) changer(null)
  }
  return [ouvert, basculer, ancre]
}
