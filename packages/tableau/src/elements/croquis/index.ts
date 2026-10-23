import type { Croquis } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsCroquis, RenduCroquis } from './Croquis'
import './croquis.css'
import { nouveauCroquis, resume } from './trace'

registre.type<Croquis>({
  type: 'croquis',
  nom: 'Croquis',
  resume,
  Rendu: RenduCroquis,
  Outils: OutilsCroquis,
  editable: true,
  hauteurParDefaut: 23,
  largeurMin: 12,
  suivant: () => null,
  outils: [
    {
      libelle: 'Croquis',
      icone: '✎',
      rang: 130,
      tiroir: true,
      fantome: () => nouveauCroquis(0, 0),
      creer: (ou) => [{ type: 'creer', element: nouveauCroquis(Math.round(ou.x), Math.round(ou.y)) }],
    },
  ],
})
