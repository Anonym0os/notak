import { createElement } from 'react'
import { lignesASupprimer } from '../../coeur/lignes'
import type { Ligne } from '../../coeur/tableau'
import { registre } from '../registre'
import { IconeLigne } from './Icone'
import { RenduLigne } from './Ligne'
import { OutilsLigne } from './Outils'
import { ligneLibre } from './creation'
import './ligne.css'
import { raccourciRelier } from './raccourci'

registre.type<Ligne>({
  type: 'ligne',
  calque: 'lignes',
  Rendu: RenduLigne,
  Outils: OutilsLigne,
  aussiSupprimer: lignesASupprimer,
  outils: [
    {
      libelle: 'Ligne',
      icone: createElement(IconeLigne),
      creer(ou, contexte) {
        const ligne = ligneLibre(ou)
        // La barre de gauche ne sélectionne que ce qui s'édite : une ligne se choisit ici.
        contexte.choisir([ligne.id])
        return [{ type: 'creer', element: ligne }]
      },
    },
  ],
})

registre.raccourci(raccourciRelier)
