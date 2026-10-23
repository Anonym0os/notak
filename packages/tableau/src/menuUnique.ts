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

/**
 * L'état d'un menu : ouvert ou non, la façon de l'ouvrir ou de le fermer, et l'ancre à poser sur ce qui contient
 * le bouton et le menu (un appui dedans ne le ferme pas).
 */
export function useMenu<T extends HTMLElement = HTMLDivElement>(): [boolean, (ouvert: boolean) => void, RefObject<T | null>] {
  const id = useId()
  const ancre = useRef<T>(null)
  const ouvert = useSyncExternalStore(ecouter, () => courant === id)

  useEffect(() => {
    if (!ouvert) return
    const dehors = (e: PointerEvent) => {
      if (!ancre.current?.contains(e.target as Node)) changer(null)
    }
    document.addEventListener('pointerdown', dehors, true)
    return () => document.removeEventListener('pointerdown', dehors, true)
  }, [ouvert])
  // Un menu qui disparaît (la sélection a changé) ne reste pas « ouvert » pour personne.
  useEffect(() => () => void (courant === id && changer(null)), [id])

  return [ouvert, (v) => changer(v ? id : courant === id ? null : courant), ancre]
}
