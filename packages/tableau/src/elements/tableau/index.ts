import { type Element, type RenvoiTableau, nouvelId } from '../../coeur/tableau'
import { registre } from '../registre'
import type { Raccourci } from '../types'
import { OutilsRenvoi } from './Outils'
import { RenduRenvoi } from './Renvoi'
import { demanderRenommage } from './renommage'
import './tableau.css'

const LARGEUR_RENVOI = 12

/** Cmd+Entrée, la carte seule choisie : ouvre le tableau. */
export const raccourciOuvrir: Raccourci = (e, contexte) => {
  if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return false
  if (contexte.selection.size !== 1) return false
  const id = [...contexte.selection][0]
  const contenu = contexte.magasin.lire().elements.find((x) => x.id === id)?.contenu
  if (contenu?.type !== 'tableau' || !contexte.services.ouvrirTableau) return false
  contexte.services.ouvrirTableau(contenu.cible)
  return true
}

registre.type<RenvoiTableau>({
  type: 'tableau',
  Rendu: RenduRenvoi,
  Outils: OutilsRenvoi,
  sansFond: true,
  ouvrir: (e, contexte) => contexte.services.ouvrirTableau?.(e.contenu.cible),
  hauteurParDefaut: 14,
  largeurMin: LARGEUR_RENVOI,
  outils: [
    {
      libelle: 'Tableau',
      icone: '▣',
      creer(ou, contexte) {
        const cible = contexte.services.creerTableau?.('Nouveau tableau')
        if (!cible) return []
        const element: Element<RenvoiTableau> = {
          id: nouvelId(),
          x: Math.round(ou.x),
          y: Math.round(ou.y),
          largeur: LARGEUR_RENVOI,
          contenu: { type: 'tableau', cible },
        }
        demanderRenommage(element.id)
        return [{ type: 'creer', element }]
      },
    },
  ],
})

registre.raccourci(raccourciOuvrir)
