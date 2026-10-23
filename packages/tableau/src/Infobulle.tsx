import { type ReactElement, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { Raccourci } from './Menus'

/** Le temps qu'il faut rester sur un élément avant que son infobulle paraisse, en millisecondes. */
export const DELAI_INFOBULLE = 700
/** Le fondu, à l'entrée comme à la sortie. */
export const FONDU_INFOBULLE = 100
/** Une infobulle vient de se fermer depuis moins de ça : la suivante paraît tout de suite, sans attendre. */
export const REPRISE_INFOBULLE = 400

let fermeeA = Number.NEGATIVE_INFINITY

/** Combien attendre avant d'ouvrir une infobulle : rien si l'on vient d'en quitter une. */
export const delaiAvantInfobulle = (maintenant: number, derniereFermeture: number = fermeeA): number =>
  maintenant - derniereFermeture < REPRISE_INFOBULLE ? 0 : DELAI_INFOBULLE

/** Remet à zéro la mémoire de la dernière fermeture (pour les tests). */
export const oublierInfobulle = () => {
  fermeeA = Number.NEGATIVE_INFINITY
}

const ECART = 6
const BORD = 8

/**
 * Une infobulle maison, à la place de l'attribut `title` du navigateur : ardoise, texte blanc, un fondu court,
 * le raccourci en pastilles de touches. Elle entoure le bouton, paraît sous lui après un délai de survol (ou au
 * focus clavier), se ferme à la sortie, au clic et à Échap, et reste dans la fenêtre.
 */
export function Infobulle({
  libelle,
  raccourci,
  children,
  desactivee = false,
}: {
  libelle: string
  /** Les touches, comme dans les menus : « ⇧⌘Z ». */
  raccourci?: string
  children: ReactElement | ReactNode
  desactivee?: boolean
}) {
  const hote = useRef<HTMLSpanElement>(null)
  const bulle = useRef<HTMLDivElement>(null)
  const minuteur = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const retrait = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [present, setPresent] = useState(false)
  const [montre, setMontre] = useState(false)
  const [place, setPlace] = useState<{ x: number; y: number } | null>(null)

  const fermer = useCallback(() => {
    clearTimeout(minuteur.current)
    minuteur.current = undefined
    setMontre((m) => {
      if (m) fermeeA = performance.now()
      return false
    })
    clearTimeout(retrait.current)
    retrait.current = setTimeout(() => {
      setPresent(false)
      setPlace(null)
    }, FONDU_INFOBULLE)
  }, [])

  const ouvrir = useCallback(() => {
    if (desactivee) return
    clearTimeout(minuteur.current)
    clearTimeout(retrait.current)
    minuteur.current = setTimeout(() => {
      minuteur.current = undefined
      setPresent(true)
      setMontre(true)
    }, delaiAvantInfobulle(performance.now()))
  }, [desactivee])

  useEffect(
    () => () => {
      clearTimeout(minuteur.current)
      clearTimeout(retrait.current)
    },
    [],
  )

  // Posée sous l'hôte, centrée, ramenée dans la fenêtre ; mesurée avant d'être peinte.
  useEffect(() => {
    if (!present || !hote.current || !bulle.current) return
    const h = hote.current.getBoundingClientRect()
    const largeur = bulle.current.offsetWidth
    const fenetre = document.documentElement.clientWidth || window.innerWidth
    const x = Math.max(BORD, Math.min(h.left + h.width / 2 - largeur / 2, fenetre - largeur - BORD))
    setPlace({ x, y: h.bottom + ECART })
  }, [present, libelle, raccourci])

  useEffect(() => {
    if (!montre) return
    const touche = (e: KeyboardEvent) => e.key === 'Escape' && fermer()
    document.addEventListener('keydown', touche)
    return () => document.removeEventListener('keydown', touche)
  }, [montre, fermer])

  return (
    <span
      ref={hote}
      className="notak-infobulle-hote"
      onPointerEnter={(e) => e.pointerType !== 'touch' && ouvrir()}
      onPointerLeave={fermer}
      onPointerDown={fermer}
      onFocus={(e) => e.target.matches?.(':focus-visible') && ouvrir()}
      onBlur={fermer}
    >
      {children}
      {present && (
        <div
          ref={bulle}
          className="notak-infobulle"
          role="tooltip"
          data-montre={montre && place ? '' : undefined}
          style={{ left: place?.x ?? 0, top: place?.y ?? 0 }}
        >
          {libelle}
          {raccourci && <Raccourci touches={raccourci} />}
        </div>
      )}
    </span>
  )
}
