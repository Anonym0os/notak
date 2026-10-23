import type { Table } from '../../coeur/tableau'
import { registre } from '../registre'
import { OutilsTable, RenduTable } from './Table'
import { nouvelleTable, resume } from './grille'
import './table.css'

registre.type<Table>({
  type: 'table',
  nom: 'Table',
  resume,
  Rendu: RenduTable,
  Outils: OutilsTable,
  editable: true,
  hauteurParDefaut: 25,
  largeurMin: 12,
  suivant: (e, places) => ({ ...nouvelleTable(places.dessous.x, places.dessous.y), largeur: e.largeur }),
  outils: [
    {
      libelle: 'Table',
      icone: '▦',
      rang: 100,
      tiroir: true,
      fantome: () => nouvelleTable(0, 0),
      creer: (ou) => [{ type: 'creer', element: nouvelleTable(Math.round(ou.x), Math.round(ou.y)) }],
    },
  ],
})
