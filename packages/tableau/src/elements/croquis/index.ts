import type { Croquis } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsCroquis, RenduCroquis } from './Croquis'
import './croquis.css'
import { nouveauCroquis, resume } from './trace'
import { t } from '../../langue'
import { ico } from '../../icones'
import { couleurDuContenu } from '../couleur'
import { OutilCouleurCarte } from '../couleur/OutilCouleurCarte'

registre.type<Croquis>({
  type: 'croquis',
  get nom() {
    return t('type.croquis')
  },
  resume,
  Rendu: RenduCroquis,
  Outils: OutilCouleurCarte,
  couleur: couleurDuContenu<Croquis>(),
  teinte: true,
  OutilsApres: OutilsCroquis,
  editable: true,
  aLaCreation: 'rien',
  hauteurParDefaut: 21,
  largeurMin: 12,
  suivant: () => null,
  outils: [
    {
      get libelle() {
        return t('type.croquis')
      },
      icone: ico('croquis'),
      rang: 200,
      vignette: 'croquis',
      tiroir: true,
      fantome: () => nouveauCroquis(0, 0),
      creer: (ou) => [{ type: 'creer', element: nouveauCroquis(Math.round(ou.x), Math.round(ou.y)) }],
    },
  ],
})
