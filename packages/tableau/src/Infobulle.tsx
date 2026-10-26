import { type ReactElement, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Touches } from './communs'

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
 * Dans l'espace, la bulle se pose à sa racine : la barre du haut est sous la barre des outils, et une bulle restée dans
 * son bouton passerait dessous. Hors de l'espace, elle reste près de son bouton.
 */
const portee = (bulle: ReactElement, espace: HTMLElement | null | undefined) => (espace ? createPortal(bulle, espace) : bulle)

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
  cote = 'bas',
  contenu = false,
}: {
  libelle: string
  /** Les touches, comme dans les menus : « ⇧⌘Z ». */
  raccourci?: string
  children: ReactElement | ReactNode
  desactivee?: boolean
  /** Où elle paraît : sous le bouton (défaut), ou à sa droite pour un outil de la barre de gauche. */
  cote?: 'bas' | 'droite'
  /** L'enveloppe ne pèse rien dans la mise en page (`display: contents`) : le bouton garde sa place dans la barre. */
  contenu?: boolean
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

  // Posée sous le bouton (ou à sa droite), centrée, ramenée dans la fenêtre ; mesurée avant d'être peinte.
  useEffect(() => {
    if (!present || !hote.current || !bulle.current) return
    const cible = hote.current.firstElementChild ?? hote.current
    const h = cible.getBoundingClientRect()
    const largeur = bulle.current.offsetWidth
    const hauteur = bulle.current.offsetHeight
    const fenetre = document.documentElement.clientWidth || window.innerWidth
    if (cote === 'droite') {
      const y = Math.max(BORD, Math.min(h.top + h.height / 2 - hauteur / 2, (window.innerHeight || 0) - hauteur - BORD))
      setPlace({ x: Math.min(h.right + ECART, Math.max(BORD, fenetre - largeur - BORD)), y })
      return
    }
    const x = Math.max(BORD, Math.min(h.left + h.width / 2 - largeur / 2, fenetre - largeur - BORD))
    setPlace({ x, y: h.bottom + ECART })
  }, [present, libelle, raccourci, cote])

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
      data-contenu={contenu ? '' : undefined}
      onPointerEnter={(e) => e.pointerType !== 'touch' && ouvrir()}
      onPointerLeave={fermer}
      onPointerDown={fermer}
      onFocus={(e) => e.target.matches?.(':focus-visible') && ouvrir()}
      onBlur={fermer}
    >
      {children}
      {present && portee(
        <div
          ref={bulle}
          className="notak-infobulle"
          role="tooltip"
          data-montre={montre && place ? '' : undefined}
          style={{ left: place?.x ?? 0, top: place?.y ?? 0 }}
        >
          {libelle}
          {raccourci && <Touches touches={raccourci} />}
        </div>,
        hote.current?.closest<HTMLElement>('.notak-espace'),
      )}
    </span>
  )
}
