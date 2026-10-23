// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Element, NoeudTexte, Taches } from '../../coeur/tableau'
import { ContexteOutils } from '../../BoutonOutil'
import { fermerMenus } from '../../menuUnique'
import type { ContexteToile } from '../types'
import { OutilsTaches } from './Taches'
import { OutilsEdition } from './OutilsEdition'
import { EXTENSIONS_TACHES } from './extensions'
import { docEditeur } from './titre'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
const ouverts: Editor[] = []
beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  fermerMenus()
  ouverts.splice(0).forEach((e) => e.destroy())
})

const tache = (texte: string): NoeudTexte => ({
  type: 'taskItem',
  attrs: { checked: false },
  content: [texte ? { type: 'paragraph', content: [{ type: 'text', text: texte }] } : { type: 'paragraph' }],
})
const contenu = (...textes: string[]): Taches => ({ type: 'taches', texte: { type: 'doc', content: [{ type: 'taskList', content: textes.map(tache) }] } })

function monter(c: Taches, curseur: number | [number, number]) {
  const editor = new Editor({ extensions: EXTENSIONS_TACHES, content: docEditeur(c) })
  ouverts.push(editor)
  const finir = vi.fn()
  const commenter = vi.fn()
  if (typeof curseur === 'number') editor.commands.setTextSelection(curseur)
  else editor.commands.setTextSelection({ from: curseur[0], to: curseur[1] })
  act(() =>
    racine.render(
      <OutilsEdition editor={editor} couleur={undefined} choisirCouleur={() => {}} titreCache={() => undefined} lien={null} surLien={() => {}} commenter={commenter} finir={finir} />,
    ),
  )
  return { editor, finir, commenter }
}
const noms = () => [...hote.querySelectorAll<HTMLButtonElement>('button[aria-label]:not(.notak-barre-retour)')].map((b) => b.getAttribute('aria-label'))
const outil = (nom: string) => hote.querySelector<HTMLButtonElement>(`button[aria-label="${nom}"]`)!

describe('la barre d’une liste en édition', () => {
  it('le curseur seul : Couleur, Titre, Échéance, Assigner, les deux retraits, Commentaire', () => {
    monter(contenu('a', 'b'), 3)
    expect(noms()).toEqual(['Couleur', 'Titre', 'Échéance', 'Assigner', 'Retrait +', 'Retrait −', 'Commenter'])
  })

  it('un passage choisi : Gras, Italique, Barré, Lien, Commentaire', () => {
    monter(contenu('abc'), [3, 5])
    expect(noms()).toEqual(['Gras', 'Italique', 'Barré', 'Lien', 'Commenter'])
  })

  it('Titre ajoute le titre, et le retire au second clic', () => {
    const { editor } = monter(contenu('a'), 3)
    act(() => outil('Titre').click())
    expect(editor.state.doc.firstChild?.type.name).toBe('titreListe')
    expect(outil('Titre').getAttribute('aria-pressed')).toBe('true')
    act(() => outil('Titre').click())
    expect(editor.state.doc.firstChild?.type.name).toBe('taskList')
  })

  it('Échéance allume la puce de la tâche sous le curseur, et l’éteint', () => {
    const { editor } = monter(contenu('a', 'b'), 8)
    act(() => outil('Échéance').click())
    const tache2 = editor.state.doc.firstChild!.child(1)
    expect(tache2.attrs.montreEcheance).toBe(true)
    expect(editor.state.doc.firstChild!.child(0).attrs.montreEcheance).toBeNull()
    expect(outil('Échéance').getAttribute('aria-pressed')).toBe('true')
    act(() => outil('Échéance').click())
    expect(editor.state.doc.firstChild!.child(1).attrs.montreEcheance).toBeNull()
  })

  it('Assigner repart vide quand on l’allume', () => {
    const { editor } = monter(contenu('a'), 3)
    editor.view.dispatch(editor.state.tr.setNodeMarkup(1, undefined, { ...editor.state.doc.firstChild!.child(0).attrs, assigne: 'Léa' }))
    act(() => outil('Assigner').click()) // déjà garnie : elle s'éteint
    expect(editor.state.doc.firstChild!.child(0).attrs.assigne).toBeNull()
    act(() => outil('Assigner').click())
    expect(editor.state.doc.firstChild!.child(0).attrs.montreAssigne).toBe(true)
  })

  it('Retrait + descend la tâche sous la précédente, Retrait − la remonte ; grisés quand c’est impossible', () => {
    const { editor } = monter(contenu('a', 'b'), 3)
    expect(outil('Retrait +').disabled).toBe(true)
    expect(outil('Retrait −').disabled).toBe(true)
    act(() => editor.commands.setTextSelection(8))
    act(() => racine.render(<OutilsEdition editor={editor} couleur={undefined} choisirCouleur={() => {}} titreCache={() => undefined} lien={null} surLien={() => {}} finir={() => {}} />))
    expect(outil('Retrait +').disabled).toBe(false)
    act(() => outil('Retrait +').click())
    expect(editor.state.doc.firstChild!.childCount).toBe(1)
    expect(outil('Retrait −').disabled).toBe(false)
    act(() => outil('Retrait −').click())
    expect(editor.state.doc.firstChild!.childCount).toBe(2)
  })

  it('Commentaire ouvre le fil de la liste ; la flèche termine l’écriture', () => {
    const { commenter, finir } = monter(contenu('a'), 3)
    act(() => outil('Commenter').click())
    expect(commenter).toHaveBeenCalled()
    act(() => hote.querySelector<HTMLButtonElement>('.notak-barre-retour')!.click())
    expect(finir).toHaveBeenCalled()
  })
})

describe('la barre d’une liste choisie', () => {
  const element = (c: Taches): Element<Taches> => ({ id: 'l1', x: 0, y: 0, largeur: 34, contenu: c })
  const contexte = () => ({ magasin: { faire: vi.fn() }, commencerEdition: vi.fn() }) as unknown as ContexteToile & { magasin: { faire: ReturnType<typeof vi.fn> } }
  const rendre = (c: Taches, ctx: ContexteToile) =>
    act(() =>
      racine.render(
        <ContexteOutils.Provider value={{ aGauche: true, plus: null }}>
          <OutilsTaches elements={[element(c)]} contexte={ctx} />
        </ContexteOutils.Provider>,
      ),
    )

  it('une seule tâche : Couleur, Titre, puis Échéance et Assigner de cette tâche', () => {
    rendre(contenu('a'), contexte())
    expect(noms()).toEqual(['Couleur', 'Titre', 'Échéance', 'Assigner'])
  })

  it('plusieurs tâches : Couleur et Titre seulement', () => {
    rendre(contenu('a', 'b'), contexte())
    expect(noms()).toEqual(['Couleur', 'Titre'])
  })

  it('Échéance pose la puce sur la tâche unique', () => {
    const ctx = contexte()
    rendre(contenu('a'), ctx)
    act(() => outil('Échéance').click())
    const [[ops]] = ctx.magasin.faire.mock.calls as [[{ apres: Taches }[]]]
    expect(ops![0]!.apres.texte.content![0]!.content![0]!.attrs).toMatchObject({ montreEcheance: true })
  })
})
