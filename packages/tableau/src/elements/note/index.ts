import { generateJSON } from '@tiptap/react'
import { HAUTEUR_NOTE_MIN, type Note, type NoeudTexte, nouvelleNote, texteBrut } from '../../coeur/tableau'
import { registre } from '../registre'
import { RenduNote } from './Note'
import { OutilsNote } from './Outils'
import { adresseSeule, couleurSeule, docDepuisCollage, enDocument, tachesDepuisTexte } from './conversion'
import { legendeVide } from './legende'
import { nouvelleListeTaches } from '../taches/liste'
import { EXTENSIONS_NOTE } from './extensions'
import './note.css'
import { couleurDuContenu } from '../couleur'
import { t } from '../../langue'
import { ico } from '../../icones'

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
  get nom() {
    return t('type.note')
  },
  resume: (c) => texteBrut(c.texte),
  Rendu: RenduNote,
  Outils: OutilsNote,
  // Une couleur nommée remplace le fond libre.
  couleur: {
    lire: couleurDuContenu<Note>().lire,
    vers: (c, couleur) => {
      const { fond: _, ...reste } = c
      return couleurDuContenu<Note>().vers(reste, couleur)
    },
  },
  editable: true,
  outilsEdition: true,
  hauteurParDefaut: HAUTEUR_NOTE_MIN,
  sansFond: (c) => c.couleur === 'transparent' && !c.fond,
  hauteurBornable: true,
  // La note suivante garde la largeur ; la mise en forme (couleurs, barre), sans le texte.
  suivant: (e, places, format) => {
    // Sous un titre, la note neuve reprend la mise en forme (transparente) mais son texte est un paragraphe ordinaire.
    const neuve = enNote(places.dessous.x, places.dessous.y)
    // La mise en forme suit (couleurs, barre) ; le texte et la légende, non.
    const { couleur, fond, barre, couleurTexte } = e.contenu
    const forme = format ? { ...(couleur && { couleur }), ...(fond && { fond }), ...(barre && { barre }), ...(couleurTexte && { couleurTexte }) } : {}
    return { ...neuve, largeur: e.largeur, contenu: { ...neuve.contenu, ...forme } }
  },
  // À la sortie de l'édition : une adresse seule devient un lien, un code couleur seul un nuancier ; une légende
  // restée vide s'en va.
  convertir: (c) => {
    const url = adresseSeule(c.texte)
    if (url) return { type: 'lien', url, statut: 'attente' }
    const couleur = couleurSeule(c.texte)
    if (couleur) return { type: 'nuancier', couleur: couleur.couleur, format: couleur.format }
    if (c.legende !== undefined && legendeVide(c.legende)) {
      const { legende: _, ...reste } = c
      return reste
    }
    return null
  },
  outils: [
    {
      get libelle() {
        return t('type.note')
      },
      icone: ico('note'),
      rang: 10,
      vignette: 'note',
      fantome: () => enNote(0, 0),
      creer: (ou) => [{ type: 'creer', element: enNote(ou.x, ou.y) }],
    },
    {
      get libelle() {
        return t('outil.titre')
      },
      icone: ico('titre'),
      rang: 260,
      vignette: 'titre',
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

// Des lignes qui ne sont que des cases (`[ ] a`, `- [x] b`) deviennent une liste de tâches, pas une note.
registre.recepteur({
  priorite: 15,
  recevoir(donnees, ou) {
    const texte = tachesDepuisTexte(donnees.getData('text/plain'))
    if (!texte) return null
    const liste = nouvelleListeTaches(Math.round(ou.x), Math.round(ou.y))
    return [{ type: 'creer', element: { ...liste, contenu: { type: 'taches', texte } } }]
  },
})

registre.entreeMenu({
  get libelle() {
    return t('menu.convertirDocument')
  },
  visible: (els, contexte) => !contexte.services.lectureSeule && els.length > 0 && els.every((e) => e.contenu.type === 'note'),
  faire: (els, contexte) =>
    contexte.magasin.faire(els.flatMap((e) => (e.contenu.type === 'note' ? [{ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: enDocument(e.contenu) }] : []))),
})
