// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NoeudTexte, Taches } from '../../coeur/tableau'
import { EXTENSIONS_TACHES, clavierListe } from './extensions'
import { ajouterTitre, avecTitre, contenuDepuis, docEditeur, retirerTitre, sansTitre, texteDuTitre } from './titre'

const tache = (texte: string): NoeudTexte => ({
  type: 'taskItem',
  attrs: { checked: false },
  content: [texte ? { type: 'paragraph', content: [{ type: 'text', text: texte }] } : { type: 'paragraph' }],
})
const liste = (...textes: string[]): NoeudTexte => ({ type: 'doc', content: [{ type: 'taskList', content: textes.map(tache) }] })
const contenu = (titre: string | undefined, ...textes: string[]): Taches => ({ type: 'taches', ...(titre !== undefined ? { titre } : {}), texte: liste(...textes) })

describe('Le titre dans le document', () => {
  it('docEditeur met le titre en tête, contenuDepuis le ressort', () => {
    const c = contenu('Courses', 'pain', 'lait')
    const doc = docEditeur(c)
    expect(doc.content?.map((n) => n.type)).toEqual(['titreListe', 'taskList'])
    expect(contenuDepuis(doc, c)).toEqual(c)
  })

  it('sans titre, le document ne commence que par la liste', () => {
    const c = contenu(undefined, 'a')
    expect(docEditeur(c).content?.map((n) => n.type)).toEqual(['taskList'])
    expect(contenuDepuis(docEditeur(c), c)).toEqual(c)
  })

  it('un titre sur deux lignes garde son saut de ligne', () => {
    const c = contenu('un\ndeux', 'a')
    const titre = docEditeur(c).content![0]!
    expect(titre.content?.map((n) => n.type)).toEqual(['text', 'hardBreak', 'text'])
    expect(texteDuTitre(titre)).toBe('un\ndeux')
  })

  it('un titre retiré garde ses mots, qui reviennent au prochain ajout', () => {
    const c = contenu('Courses', 'pain')
    const sans = sansTitre(c)
    expect(sans.titre).toBeUndefined()
    expect(sans.titreCache).toBe('Courses')
    expect(avecTitre(sans)).toEqual(c)
    expect(avecTitre(contenu(undefined, 'pain')).titre).toBe('')
  })

  it('un titre retiré dans l’éditeur passe en titre caché', () => {
    const c = contenu('Courses', 'pain')
    const apres = contenuDepuis(liste('pain'), c)
    expect(apres.titre).toBeUndefined()
    expect(apres.titreCache).toBe('Courses')
    // Et il reste caché tant qu'on n'en écrit pas un autre.
    expect(contenuDepuis(liste('pain', 'lait'), apres).titreCache).toBe('Courses')
    expect(contenuDepuis(docEditeur({ ...apres, titre: 'Autre' }), apres).titreCache).toBeUndefined()
  })
})

let editeur: Editor
const ouvrir = (c: Taches, gestes = { jeter: () => {} }) => {
  editeur = new Editor({ extensions: [...EXTENSIONS_TACHES, clavierListe({ current: gestes })], content: docEditeur(c) })
  return editeur
}
afterEach(() => editeur?.destroy())
const sortie = (): Taches => contenuDepuis(editeur.getJSON() as NoeudTexte, contenu(undefined))
const touche = (key: string) => editeur.view.someProp('handleKeyDown', (f) => f(editeur.view, new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))) === true
const taper = (texte: string) => {
  const { from, to } = editeur.state.selection
  const pris = editeur.view.someProp('handleTextInput', (f) => f(editeur.view, from, to, texte, () => editeur.state.tr))
  if (!pris) editeur.view.dispatch(editeur.state.tr.insertText(texte, from, to))
}
const textes = () => sortie().texte.content![0]!.content!.map((t) => t.content![0]!.content?.[0]?.text ?? '')

describe('Dans le titre', () => {
  it('Entrée crée une tâche vide en tête, curseur dedans', () => {
    ouvrir(contenu('Titre', 'a', 'b'))
    editeur.commands.setTextSelection(3)
    expect(touche('Enter')).toBe(true)
    expect(textes()).toEqual(['', 'a', 'b'])
    taper('x')
    expect(textes()).toEqual(['x', 'a', 'b'])
    expect(sortie().titre).toBe('Titre')
  })

  it('Retour arrière dans le titre vide le retire, curseur au début de la première tâche', () => {
    ouvrir(contenu('', 'a', 'b'))
    editeur.commands.setTextSelection(1)
    expect(touche('Backspace')).toBe(true)
    expect(sortie().titre).toBeUndefined()
    taper('z')
    expect(textes()).toEqual(['za', 'b'])
  })

  it('Retour arrière dans un titre qui a du texte ne le retire pas', () => {
    ouvrir(contenu('Mot', 'a'))
    editeur.commands.setTextSelection(4)
    touche('Backspace')
    expect(editeur.state.doc.firstChild?.type.name).toBe('titreListe')
  })

  it('« [] » au début du titre le change en tâche, le reste du titre en est le texte', () => {
    ouvrir(contenu('', 'a'))
    editeur.commands.setTextSelection(1)
    taper('[')
    taper(']')
    taper(' ')
    expect(editeur.state.doc.firstChild?.type.name).toBe('taskList')
    expect(textes()).toEqual(['', 'a'])
  })

  it('« [x] » donne une tâche cochée', () => {
    ouvrir(contenu('', 'a'))
    editeur.commands.setTextSelection(1)
    for (const c of '[x] ') taper(c)
    expect(editeur.state.doc.firstChild?.type.name).toBe('taskList')
    expect(editeur.state.doc.firstChild?.firstChild?.attrs.checked).toBe(true)
  })

  it('ajouterTitre et retirerTitre vont et viennent', () => {
    ouvrir(contenu(undefined, 'a'))
    expect(ajouterTitre(editeur, 'Mots')).toBe(true)
    expect(sortie().titre).toBe('Mots')
    expect(ajouterTitre(editeur)).toBe(false)
    expect(retirerTitre(editeur)).toBe('Mots')
    expect(sortie().titre).toBeUndefined()
    expect(retirerTitre(editeur)).toBeNull()
  })
})

describe('« # » dans la première tâche', () => {
  it('la tâche vide devient le titre quand d’autres suivent', () => {
    ouvrir(contenu(undefined, '', 'b'))
    editeur.commands.setTextSelection(3)
    taper('#')
    taper(' ')
    const s = sortie()
    expect(s.titre).toBe('')
    expect(textes()).toEqual(['b'])
    taper('T')
    expect(sortie().titre).toBe('T')
  })

  it('seule, la tâche n’est vidée que du « # »', () => {
    ouvrir(contenu(undefined, ''))
    editeur.commands.setTextSelection(3)
    taper('#')
    taper(' ')
    expect(sortie().titre).toBe('')
    expect(textes()).toEqual([''])
  })

  it('rien quand la liste a déjà un titre', () => {
    ouvrir(contenu('T', ''))
    editeur.commands.setTextSelection(editeur.state.doc.firstChild!.nodeSize + 3)
    taper('#')
    taper(' ')
    expect(textes()).toEqual(['# '])
  })
})

describe('Retour arrière au début de la première tâche', () => {
  const debutPremiere = () => editeur.commands.setTextSelection((editeur.state.doc.firstChild?.type.name === 'titreListe' ? editeur.state.doc.firstChild.nodeSize : 0) + 3)

  it('vide, avec d’autres tâches et un titre : elle part, le curseur monte au titre', () => {
    ouvrir(contenu('T', '', 'b'))
    debutPremiere()
    expect(touche('Backspace')).toBe(true)
    expect(textes()).toEqual(['b'])
    taper('!')
    expect(sortie().titre).toBe('T!')
  })

  it('vide, sans titre, avec d’autres tâches : elle devient le titre', () => {
    ouvrir(contenu(undefined, '', 'b'))
    debutPremiere()
    touche('Backspace')
    expect(sortie().titre).toBe('')
    expect(textes()).toEqual(['b'])
  })

  it('avec du texte et un titre, seul le curseur monte', () => {
    ouvrir(contenu('T', 'abc'))
    debutPremiere()
    expect(touche('Backspace')).toBe(true)
    taper('!')
    expect(sortie().titre).toBe('T!')
    expect(textes()).toEqual(['abc'])
  })

  it('seule et vide, avec un titre : le curseur monte, la liste reste', () => {
    let jetee = false
    ouvrir(contenu('T', ''), { jeter: () => (jetee = true) })
    debutPremiere()
    touche('Backspace')
    expect(jetee).toBe(false)
    taper('!')
    expect(sortie().titre).toBe('T!')
  })

  it('seule et vide, sans titre : la liste part à la corbeille', () => {
    let jetee = false
    ouvrir(contenu(undefined, ''), { jeter: () => (jetee = true) })
    debutPremiere()
    expect(touche('Backspace')).toBe(true)
    expect(jetee).toBe(true)
  })
})
