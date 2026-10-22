import { generateJSON } from '@tiptap/react'
import { HAUTEUR_NOTE_MIN, type Note, type NoeudTexte, nouvelleNote } from '../../coeur/tableau'
import { registre } from '../registre'
import { RenduNote } from './Note'
import { OutilsNote } from './Outils'
import { docDepuisCollage } from './conversion'
import { EXTENSIONS_NOTE } from './extensions'
import './note.css'

const enNote = (x: number, y: number, texte?: NoeudTexte) => {
  const note = nouvelleNote(Math.round(x), Math.round(y))
  return texte ? { ...note, contenu: { ...note.contenu, texte } } : note
}

registre.type<Note>({
  type: 'note',
  Rendu: RenduNote,
  Outils: OutilsNote,
  editable: true,
  hauteurParDefaut: HAUTEUR_NOTE_MIN,
  sansFond: (c) => c.couleur === 'transparent',
  outils: [
    {
      libelle: 'Note',
      icone: '¶',
      creer: (ou) => [{ type: 'creer', element: enNote(ou.x, ou.y) }],
    },
    {
      libelle: 'Titre',
      icone: 'T',
      creer: (ou) => {
        const note = enNote(ou.x, ou.y, {
          type: 'doc',
          content: [{ type: 'heading', attrs: { level: 1, textAlign: 'center' } }],
        })
        return [{ type: 'creer', element: { ...note, contenu: { ...note.contenu, couleur: 'transparent', variante: 'titre' } } }]
      },
    },
  ],
})

// Un texte collé devient une note. Après les liens et les images, qui passent avant (priorité plus haute).
registre.recepteur({
  priorite: 10,
  recevoir(donnees, ou) {
    const doc = docDepuisCollage(
      { html: donnees.getData('text/html'), texte: donnees.getData('text/plain') },
      (html) => generateJSON(html, EXTENSIONS_NOTE) as NoeudTexte,
    )
    return doc ? [{ type: 'creer', element: enNote(ou.x, ou.y, doc) }] : null
  },
})
