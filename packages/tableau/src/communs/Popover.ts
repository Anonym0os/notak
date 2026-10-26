import { type RefObject, useEffect, useRef } from 'react'

/**
 * Le popover commun est `PanneauFlottant` (placement, flèche, suivi de la cible), dessiné par `.notak-pop`
 * (popover.css). La carte mentale a son propre placement (`Flottant`, qui borne et fait défiler) mais le même dessin
 * et les mêmes gestes de fermeture : ce fichier les porte.
 */
export { PanneauFlottant, horsPanneau } from '../PanneauFlottant'

interface OptionsFermeture {
  /** La fenêtre : un appui dedans ne la ferme pas. */
  racine: RefObject<Element | null>
  /** Ce qui l'ouvre : son bouton la bascule lui-même, un appui dessus ne la ferme pas. */
  ancre?: RefObject<Element | null> | Element | null | undefined
  /** Un sélecteur : ce qui s'ouvre depuis elle, posé à côté (un menu, une boîte), ne la ferme pas non plus. */
  aussi?: string
  /** Faux : ni appui dehors ni Échap n'écoutent (une fenêtre fermée qui reste montée). */
  actif?: boolean
  fermer(): void
}

/**
 * Se ferme à un appui dehors et à Échap. Échap ne remonte pas : il ne ferme pas aussi la carte ou le dialogue
 * qui porte la fenêtre.
 */
export function useFermeture({ racine, ancre, aussi, actif = true, fermer }: OptionsFermeture) {
  const dernier = useRef({ ancre, aussi, fermer })
  dernier.current = { ancre, aussi, fermer }
  useEffect(() => {
    if (!actif) return
    // Un dialogue modal ouvert depuis la fenêtre, posé par-dessus, a ses propres appuis et son propre Échap.
    const surUnDialogue = (cible: EventTarget | null) => {
      const d = (cible as Element | null)?.closest?.('dialog')
      return !!d && !d.contains(racine.current)
    }
    const dehors = (e: PointerEvent) => {
      const cible = e.target as Node
      if (surUnDialogue(cible)) return
      const { ancre: a, aussi: sel } = dernier.current
      const bouton = a && 'current' in a ? a.current : a
      if (racine.current?.contains(cible) || bouton?.contains(cible) || (sel && (cible as Element).closest?.(sel))) return
      dernier.current.fermer()
    }
    const echap = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || surUnDialogue(e.target)) return
      e.stopPropagation()
      e.preventDefault()
      dernier.current.fermer()
    }
    document.addEventListener('pointerdown', dehors, true)
    document.addEventListener('keydown', echap, true)
    return () => {
      document.removeEventListener('pointerdown', dehors, true)
      document.removeEventListener('keydown', echap, true)
    }
  }, [actif, racine])
}

/**
 * À sa fermeture, rend le clavier à `fond` (la carte, le document) si personne ne l'a repris : sans quoi le focus tombe
 * sur la page et les touches de ce qu'elle ouvrait ne répondent plus jusqu'au prochain clic.
 */
export function useRendreFocus(fond: () => Element | null | undefined) {
  const lire = useRef(fond)
  lire.current = fond
  useEffect(
    () => () => {
      const actif = document.activeElement
      const cible = lire.current()
      if ((!actif || actif === document.body) && cible?.isConnected) (cible as HTMLElement).focus?.({ preventScroll: true })
    },
    [],
  )
}
