import { generateJSON } from '@tiptap/react'
import { HAUTEUR_NOTE_MIN, type Note, type NoeudTexte, nouvelleNote, texteBrut } from '../../coeur/tableau'
import { registre } from '../registre'
import { RenduNote } from './Note'
import { OutilsNote } from './Outils'
import { adresseSeule, docDepuisCollage } from './conversion'
import { EXTENSIONS_NOTE } from './extensions'
import './note.css'
import { couleurDuContenu } from '../couleur'

const enNote = (x: number, y: number, texte?: NoeudTexte) => {
  const note = nouvelleNote(Math.round(x), Math.round(y))
  return texte ? { ...note, contenu: { ...note.contenu, texte } } : note
}

const enTitre = (x: number, y: number) => {
  const note = enNote(x, y, { type: 'doc', content: [{ type: 'heading', attrs: { level: 1, textAlign: 'center' } }] })
  return { ...note, contenu: { ...note.contenu, couleur: 'transparent' as const, variante: 'titre' as const } }
}

registre.type<Note>({
  type: 'note',
  nom: 'Note',
  resume: (c) => texteBrut(c.texte),
  Rendu: RenduNote,
  Outils: OutilsNote,
  couleur: couleurDuContenu<Note>(),
  editable: true,
  hauteurParDefaut: HAUTEUR_NOTE_MIN,
  sansFond: (c) => c.couleur === 'transparent',
  hauteurBornable: true,
  // La note suivante garde la largeur ; hors édition, toute la mise en forme (couleur, titre), sans le texte.
  suivant: (e, places, format) => {
    const neuve = e.contenu.variante === 'titre' && format ? enTitre(places.dessous.x, places.dessous.y) : enNote(places.dessous.x, places.dessous.y)
    const couleur = format && e.contenu.couleur ? { couleur: e.contenu.couleur } : {}
    return { ...neuve, largeur: e.largeur, contenu: { ...neuve.contenu, ...couleur } }
  },
  convertir: (c) => {
    const url = adresseSeule(c.texte)
    return url ? { type: 'lien', url, statut: 'attente' } : null
  },
  outils: [
    {
      libelle: 'Note',
      icone: '¶',
      rang: 10,
      fantome: () => enNote(0, 0),
      creer: (ou) => [{ type: 'creer', element: enNote(ou.x, ou.y) }],
    },
    {
      libelle: 'Titre',
      icone: 'T',
      rang: 10,
      tiroir: true,
      fantome: () => enTitre(0, 0),
      creer: (ou) => [{ type: 'creer', element: enTitre(ou.x, ou.y) }],
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
