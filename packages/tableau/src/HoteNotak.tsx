import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ecrireOutilsCaches, lireOutilsCaches } from './EspaceNotak'
import { useHabillages } from './habillage/appliquer'
import type { OffreHabillages } from './habillage/bibliotheque'
import { useLangue } from './langue'
import { FenetreRaccourcis } from './Menus'
import { PageReglages } from './PageReglages'
import { type ServiceCompte, useReglages } from './reglages'
import { themeEffectif, useSystemeSombre, useThemeALaRacine } from './themeVivant'

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
  useThemeALaRacine(theme)
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
