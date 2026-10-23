import { lignesASupprimer } from '../../coeur/lignes'
import type { Ligne } from '../../coeur/tableau'
import { registre } from '../registre'
import { RenduLigne } from './Ligne'
import { LigneRapide } from './LigneRapide'
import { OutilsLigne } from './Outils'
import { TAILLE_LIGNE_NEUVE, ligneLibre } from './creation'
import './ligne.css'
import { entreeRelier, raccourciRelier } from './raccourci'
import { couleurDuContenu } from '../couleur'
import { t } from '../../langue'
import { ico } from '../../icones'

registre.type<Ligne>({
  type: 'ligne',
  get nom() {
    return t('type.ligne')
  },
  resume: (c) => c.libelle ?? '',
  calque: 'lignes',
  Rendu: RenduLigne,
  Outils: OutilsLigne,
  couleur: couleurDuContenu<Ligne>(),
  emporterAvec: lignesASupprimer,
  suivant: () => null,
  outils: [
    {
      get libelle() {
        return t('type.ligne')
      },
      icone: ico('ligne'),
      rang: 40,
      fantome: () => ligneLibre({ x: 0, y: 0 }),
      prise: { x: TAILLE_LIGNE_NEUVE / 2, y: TAILLE_LIGNE_NEUVE / 2 },
      creer(ou, contexte) {
        const ligne = ligneLibre(ou)
        // La barre de gauche ne sélectionne que ce qui s'édite : une ligne se choisit ici.
        contexte.choisir([ligne.id])
        return [{ type: 'creer', element: ligne }]
      },
    },
  ],
})

registre.outilCommun(LigneRapide)
registre.raccourci(raccourciRelier)
registre.entreeMenu(entreeRelier)
