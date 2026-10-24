// @vitest-environment jsdom
import { TextSelection } from '@tiptap/pm/state'
import { Editor } from '@tiptap/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { NoeudTexte } from '../coeur/tableau'
import { definirLangue } from '../langue'
import { agirSurBlocs, idsCibles, lignesDe, listeBloc, listeCouleur, listeSlash, listeTransformer, suffixeDe, typeDeLaCible } from './menuActions'
import { ACTIONS_BLOC, ENTREES_COULEURS } from './catalogue'
import { poserIds } from './ids'
import { EXTENSIONS_BLOCS } from './schema'
import { choisir } from './selection'

definirLangue('fr')

let editeur: Editor | null = null
afterEach(() => {
  editeur?.destroy()
  editeur = null
})
const b = (type: string, text: string, attrs: Record<string, unknown> = {}): NoeudTexte => ({ type, attrs, ...(text ? { content: [{ type: 'text', text }] } : {}) })
function ouvrir(blocs: NoeudTexte[]): Editor {
  editeur = new Editor({ extensions: EXTENSIONS_BLOCS, content: { type: 'doc', content: blocs } })
  const ids = poserIds(editeur.state)
  if (ids) editeur.view.dispatch(ids)
  editeur.view.dispatch(editeur.state.tr.setSelection(TextSelection.create(editeur.state.doc, 2)))
  return editeur
}
const ids = (g: ReturnType<typeof listeBloc>) => lignesDe(g).map((e) => e.id)
const titres = (g: ReturnType<typeof listeBloc>) => g.map((x) => x.titre)

describe('NOTION.md § 3.2 : l’ordre du menu du bloc', () => {
  const complet = { lien: true, commenter: true, titre: 'Texte' }

  it('Transformer en, Couleur, trait, Copier le lien, Dupliquer, Supprimer, trait, Commenter', () => {
    const g = listeBloc('', complet)
    expect(g.map((x) => x.lignes.map((e) => e.id))).toEqual([['action-transformer', 'action-couleur'], ['action-lien', 'action-dupliquer', 'action-supprimer'], ['action-commenter']])
    // Seule la première section porte un titre : le type du bloc.
    expect(titres(g)).toEqual(['Texte', '', ''])
  })

  it('les raccourcis sont ceux de Notion ; Transformer et Couleur ouvrent des sous-menus', () => {
    const r = Object.fromEntries(ACTIONS_BLOC.map((e) => [e.id, e.raccourci]))
    expect(r['action-lien']).toBe('⌘⌃L')
    expect(r['action-dupliquer']).toBe('⌘D')
    expect(r['action-supprimer']).toBe('Suppr')
    expect(r['action-commenter']).toBe('⌘⇧M')
    expect(ACTIONS_BLOC.filter((e) => e.sousMenu).map((e) => e.sousMenu)).toEqual(['transformer', 'couleur'])
  })

  it('« copier le lien » se cache avec plusieurs blocs, commenter sans service de commentaire', () => {
    expect(ids(listeBloc('', { ...complet, lien: false }))).not.toContain('action-lien')
    expect(ids(listeBloc('', { ...complet, commenter: false }))).not.toContain('action-commenter')
  })

  it('une recherche traverse les sous-menus : « rouge » donne les deux couleurs sous leurs titres', () => {
    const g = listeBloc('rouge', complet)
    expect(ids(g)).toEqual(['couleur-rouge', 'couleur-rouge-fond'])
    expect(titres(g)).toEqual(['Couleur du texte', 'Couleur d’arrière-plan'])
  })

  it('une recherche trouve aussi les types de « Transformer en »', () => {
    const g = listeBloc('citation', complet)
    expect(ids(g)).toContain('vers-citation')
    expect(titres(g)).toContain('Transformer en')
  })
})

describe('NOTION.md § 3.4 : le sous-menu de couleur', () => {
  it('la dernière utilisée avec ⌘⇧H, puis dix couleurs de texte, puis dix de fond', () => {
    const g = listeCouleur('', { nom: 'jaune', fond: true })
    expect(g.map((x) => x.titre)).toEqual(['Utilisé dernièrement', 'Couleur du texte', 'Couleur d’arrière-plan'])
    expect(g[0]!.lignes).toHaveLength(1)
    expect(g[0]!.lignes[0]).toMatchObject({ libelle: 'Fond jaune', raccourci: '⌘⇧H' })
    expect(g[1]!.lignes.map((e) => e.libelle).slice(0, 3)).toEqual(['Texte par défaut', 'Texte gris', 'Texte marron'])
    expect(g[2]!.lignes).toHaveLength(10)
    expect(lignesDe(g)).toHaveLength(21)
  })

  it('l’ordre des couleurs est celui de Notion', () => {
    expect(ENTREES_COULEURS.slice(0, 10).map((e) => (e.effet.genre === 'couleur' ? e.effet.couleur.nom : ''))).toEqual(['defaut', 'gris', 'brun', 'orange', 'jaune', 'vert', 'bleu', 'violet', 'rose', 'rouge'])
  })
})

describe('NOTION.md § 2.2 et § 2.3 : la liste du menu « / »', () => {
  const dispo = { image: true, lien: true }

  it('sans texte : les sections dans l’ordre, avec leurs titres', () => {
    expect(listeSlash('', dispo).map((g) => g.titre)).toEqual(['Blocs de base', 'Média', 'Blocs avancés', 'Transformer en', 'Actions', 'Couleur du texte', 'Couleur d’arrière-plan'])
  })

  it('sans fonction d’image ni de lien, ces entrées ne sont pas proposées', () => {
    const tout = lignesDe(listeSlash('', { image: false, lien: false })).map((e) => e.id)
    expect(tout).not.toContain('image')
    expect(tout).not.toContain('slash-lien')
    expect(tout).toContain('slash-dupliquer')
  })

  it('avec du texte : une seule liste, « Résultats filtrés », la section dite derrière le nom', () => {
    const g = listeSlash('encadr', dispo)
    expect(g).toHaveLength(1)
    expect(g[0]).toMatchObject({ titre: 'Résultats filtrés', suffixe: true })
    expect(g[0]!.lignes.map((e) => `${e.libelle}${suffixeDe(e) ? ` · ${suffixeDe(e)}` : ''}`)).toEqual(['Encadré', 'Encadré · Transformer en'])
  })

  it('une liste sans résultat est vide : seul le pied du menu reste', () => {
    expect(listeSlash('zzzzzz', dispo)).toEqual([])
  })

  it('« Transformer en » : une section sans titre, filtrable', () => {
    expect(listeTransformer('')).toHaveLength(1)
    expect(lignesDe(listeTransformer('titre dép'))[0]!.id).toBe('vers-titreDeroulant1')
  })
})

describe('NOTION.md § 3.5 : le menu vise les blocs choisis, sinon le bloc du curseur', () => {
  it('sans choix : le bloc du curseur ; son type donne la coche et le titre', () => {
    const ed = ouvrir([b('heading', 'T', { level: 2 }), b('paragraph', 'x')])
    expect(idsCibles(ed)).toHaveLength(1)
    expect(typeDeLaCible(ed, idsCibles(ed))).toEqual({ vers: 'titre2', titre: 'Titre 2' })
  })

  it('plusieurs blocs de types différents : « N blocs », pas de coche', () => {
    const ed = ouvrir([b('heading', 'T', { level: 2 }), b('paragraph', 'x'), b('paragraph', 'y')])
    const tous = [...ed.state.doc.content.content.map((n) => n.attrs.id as string)]
    expect(typeDeLaCible(ed, tous)).toEqual({ vers: null, titre: '3 blocs' })
    expect(typeDeLaCible(ed, tous.slice(1))).toEqual({ vers: 'texte', titre: 'Texte' })
  })

  it('les actions valent pour tous les blocs choisis : couleur, duplication, suppression', () => {
    const ed = ouvrir([b('paragraph', 'a'), b('paragraph', 'b'), b('paragraph', 'c')])
    const [a, , c] = ed.state.doc.content.content.map((n) => n.attrs.id as string)
    ed.view.dispatch(choisir(ed.state, { ancre: a!, tete: c! }))
    expect(idsCibles(ed)).toHaveLength(3)
    agirSurBlocs(ed, { genre: 'couleur', couleur: { nom: 'bleu', fond: true } })
    expect(ed.state.doc.content.content.map((n) => n.attrs.couleur)).toEqual(['bleu-fond', 'bleu-fond', 'bleu-fond'])
    agirSurBlocs(ed, { genre: 'action', action: 'dupliquer' })
    expect(ed.state.doc.childCount).toBe(6)
    agirSurBlocs(ed, { genre: 'action', action: 'supprimer' })
    expect(ed.state.doc.childCount).toBe(3)
  })

  it('la couleur d’un bloc se pose sur le bloc, même quand du texte est choisi', () => {
    const ed = ouvrir([b('paragraph', 'abc')])
    ed.view.dispatch(ed.state.tr.setSelection(TextSelection.create(ed.state.doc, 1, 3)))
    agirSurBlocs(ed, { genre: 'couleur', couleur: { nom: 'rouge', fond: false } })
    expect(ed.state.doc.child(0).attrs.couleur).toBe('rouge')
  })
})
