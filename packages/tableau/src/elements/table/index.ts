import type { Table } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsTable, RenduTable } from './Table'
import { nouvelleTable, resume } from './grille'
import { t } from '../../langue'
import './table.css'
import { ico } from '../../icones'

registre.type<Table>({
  type: 'table',
  get nom() {
    return t('type.table')
  },
  resume,
  Rendu: RenduTable,
  Outils: OutilsTable,
  editable: true,
  hauteurParDefaut: 25,
  largeurMin: 12,
  suivant: (e, places) => ({ ...nouvelleTable(places.dessous.x, places.dessous.y), largeur: e.largeur }),
  outils: [
    {
      get libelle() {
        return t('type.table')
      },
      icone: ico('table'),
      rang: 100,
      tiroir: true,
      fantome: () => nouvelleTable(0, 0),
      creer: (ou) => [{ type: 'creer', element: nouvelleTable(Math.round(ou.x), Math.round(ou.y)) }],
    },
  ],
})
