import { HAUTEUR_NOTE_MIN, type Note, nouvelleNote } from '../../coeur/tableau'
import { registre } from '../registre'
import { RenduNote } from './Note'

registre.type<Note>({
  type: 'note',
  Rendu: RenduNote,
  editable: true,
  hauteurParDefaut: HAUTEUR_NOTE_MIN,
  outil: {
    libelle: 'Note',
    icone: '¶',
    creer: (ou) => [{ type: 'creer', element: nouvelleNote(Math.round(ou.x), Math.round(ou.y)) }],
  },
})
