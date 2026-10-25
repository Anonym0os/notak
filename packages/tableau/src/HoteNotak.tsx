import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { type EspaceNavigable } from './coeur/espace'
import { type Element, type Id, type RenvoiTableau, nouvelId } from './coeur/tableau'
import { nouveauDocument } from './elements/document/texte'
import { nouvelleCarteMentale } from './elements/arbre'
import { ecrireOutilsCaches, lireOutilsCaches, placerALaSuite } from './EspaceNotak'
import { useHabillages } from './habillage/appliquer'
import type { OffreHabillages } from './habillage/bibliotheque'
import { t, useLangue } from './langue'
import { FenetreRaccourcis } from './Menus'
import { PageReglages } from './PageReglages'
import { type ServiceCompte, useReglages } from './reglages'
import { themeEffectif, useSystemeSombre } from './themeVivant'

/** Ce qu'un écran hors de la toile peut ouvrir : les réglages et la fenêtre des raccourcis, les mêmes que sur la toile. */
export interface FenetresNotak {
  reglages(): void
  aide(): void
}

/**
 * Un écran de l'application hors de la toile (la bibliothèque) : il prend le thème, l'habillage, la taille et la langue
 * de Notak, et ouvre les mêmes réglages et la même aide que la toile. ⌘, ouvre les réglages.
 */
export function HoteNotak({
  compte,
  habillages: offre,
  className,
  children,
}: {
  compte?: ServiceCompte
  habillages?: OffreHabillages
  className?: string
  children(fenetres: FenetresNotak): ReactNode
}) {
  const [reglages, changer] = useReglages()
  const theme = themeEffectif(reglages.theme, useSystemeSombre())
  const habillages = useHabillages(offre, reglages.habillage, theme)
  useLangue()
  const [ouverte, setOuverte] = useState<'reglages' | 'aide' | null>(null)
  const [outilsCaches, setOutilsCaches] = useState(lireOutilsCaches)
  const basculerOutils = useCallback(() => setOutilsCaches((c) => (ecrireOutilsCaches(!c), !c)), [])
  const fermer = useCallback(() => setOuverte(null), [])
  const [fenetres] = useState<FenetresNotak>(() => ({ reglages: () => setOuverte('reglages'), aide: () => setOuverte('aide') }))
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === ',') {
        e.preventDefault()
        setOuverte('reglages')
      }
    }
    window.addEventListener('keydown', touche)
    return () => window.removeEventListener('keydown', touche)
  }, [])
  return (
    <div className={`notak-espace${className ? ` ${className}` : ''}`} data-theme={theme} data-taille={reglages.taille}>
      {children(fenetres)}
      {ouverte &&
        createPortal(
          <div className="notak-espace notak-par-dessus" data-theme={theme} data-taille={reglages.taille}>
            {ouverte === 'aide' && <FenetreRaccourcis fermer={fermer} />}
            {ouverte === 'reglages' && (
              <PageReglages reglages={reglages} changer={changer} fermer={fermer} habillages={habillages} compte={compte} outils={{ caches: outilsCaches, basculer: basculerOutils }} />
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}

/** Ce que le bouton « Nouveau » de la bibliothèque sait créer. */
export type GenreNeuf = 'toile' | 'arbre' | 'document'

/** La largeur de la carte d'une toile posée sur une autre, en UG (comme l'outil Toile). */
const LARGEUR_RENVOI = 10

/**
 * Crée une toile, une carte mentale ou un document sur la toile d'accueil, à la suite de ce qui y est déjà : une toile
 * neuve y laisse sa carte. Rend où aller : la toile neuve, ou l'élément à ouvrir en grand sur l'accueil.
 */
export function creerSurLAccueil(espace: EspaceNavigable, genre: GenreNeuf): { tableau: Id; element: Id | null } {
  const racine = espace.racine
  const magasin = espace.magasin(racine)
  const cible = genre === 'toile' ? espace.creerTableau(t('tableau.nouveau'), racine) : null
  const neuf: Element =
    cible !== null
      ? ({ id: nouvelId(), x: 0, y: 0, largeur: LARGEUR_RENVOI, contenu: { type: 'tableau', cible } } satisfies Element<RenvoiTableau>)
      : genre === 'arbre'
        ? nouvelleCarteMentale(0, 0)
        : nouveauDocument(0, 0)
  const [pose] = placerALaSuite(magasin.lire(), [neuf])
  magasin.faire([{ type: 'creer', element: pose! }])
  return cible !== null ? { tableau: cible, element: null } : { tableau: racine, element: pose!.id }
}
