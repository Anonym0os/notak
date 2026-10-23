import type { Croquis } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsCroquis, RenduCroquis } from './Croquis'
import './croquis.css'
import { nouveauCroquis, resume } from './trace'
import { t } from '../../langue'
import { ico } from '../../icones'

registre.type<Croquis>({
  type: 'croquis',
  get nom() {
    return t('type.croquis')
  },
  resume,
  Rendu: RenduCroquis,
  Outils: OutilsCroquis,
  editable: true,
  hauteurParDefaut: 21,
  largeurMin: 12,
  suivant: () => null,
  outils: [
    {
      get libelle() {
        return t('type.croquis')
      },
      icone: ico('croquis'),
      rang: 130,
      vignette: 'croquis',
      tiroir: true,
      fantome: () => nouveauCroquis(0, 0),
      creer: (ou) => [{ type: 'creer', element: nouveauCroquis(Math.round(ou.x), Math.round(ou.y)) }],
    },
  ],
})
