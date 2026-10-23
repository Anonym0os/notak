// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Element, NoeudTexte, Taches } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { RenduTaches } from './Taches'
import { EXTENSIONS_TACHES, remplacerListe } from './extensions'
import { docEditeur } from './titre'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
})

const tache = (texte: string, plus: Record<string, unknown> = {}): NoeudTexte => ({
  type: 'taskItem',
  attrs: { checked: false, ...plus },
  content: [texte ? { type: 'paragraph', content: [{ type: 'text', text: texte }] } : { type: 'paragraph' }],
})
const contenu = (taches: NoeudTexte[], plus: Partial<Taches> = {}): Taches => ({ type: 'taches', texte: { type: 'doc', content: [{ type: 'taskList', content: taches }] }, ...plus })
const jeter = vi.fn()
const contexte = (services: Record<string, unknown> = {}) => ({ services, magasin: {}, jeter }) as unknown as ContexteToile

function rendre(c: Taches, { seule = true, largeur = 34, services = {} }: { seule?: boolean; largeur?: number; services?: Record<string, unknown> } = {}) {
  const changer = vi.fn()
  const element: Element<Taches> = { id: 'l1', x: 0, y: 0, largeur, contenu: c }
  act(() => racine.render(<RenduTaches element={element} choisie seule={seule} enEdition={false} contexte={contexte(services)} brouillon={() => {}} changer={changer} />))
  return { changer }
}

describe('le dessin d’une tâche, pour la grille CSS', () => {
  // Les colonnes de `taches.css` (26 px, puis le texte) comptent sur cet ordre : la colonne de contenu se défait
  // (`display: contents`), ses enfants se rangent dans la grille de la tâche.
  it('hors édition : poignée, case, colonne (texte, sous-liste), puces, corbeille', () => {
    rendre(contenu([{ ...tache('a', { echeance: '2099-01-01' }), content: [...tache('a').content!, { type: 'taskList', content: [tache('sous')] }] }]))
    const li = hote.querySelector('li[data-type="taskItem"]')!
    expect([...li.children].map((n) => n.className || n.tagName.toLowerCase())).toEqual(['notak-tache-poignee', 'notak-case', 'div', 'notak-puces', 'notak-tache-suppr'])
    const colonne = li.children[2]!
    expect([...colonne.children].map((n) => n.tagName)).toEqual(['P', 'UL'])
    expect(li.querySelector(':scope > .notak-puces > .notak-puce')?.textContent).toMatch(/^Pour le /)
    expect(li.querySelector('li[data-type="taskItem"]')).not.toBeNull()
  })

  it('en édition : la même suite de nœuds, la colonne de contenu portant le texte et la sous-liste', () => {
    const editor = new Editor({
      extensions: EXTENSIONS_TACHES,
      content: docEditeur(contenu([{ ...tache('a'), content: [...tache('a').content!, { type: 'taskList', content: [tache('sous')] }] }])),
    })
    const dom = editor.view.dom.querySelector('li[data-type="taskItem"]')!
    expect([...dom.children].map((n) => n.className || n.tagName.toLowerCase())).toEqual(['notak-tache-poignee', 'notak-case', 'div', 'notak-puces', 'notak-tache-suppr'])
    expect([...dom.children[2]!.children].map((n) => n.tagName)).toEqual(['P', 'UL'])
    editor.destroy()
  })
})

describe('les suggestions sous la liste', () => {
  const faites = () => contenu([tache('a', { checked: true }), tache('b', { checked: true }), tache('c')])

  it('dès deux tâches faites, la liste choisie seule propose de les supprimer', () => {
    const { changer } = rendre(faites())
    expect(hote.querySelector('.notak-suggestion')?.textContent).toContain('Supprimer les tâches terminées ?')
    act(() => hote.querySelectorAll<HTMLButtonElement>('.notak-suggestion button')[0]!.click())
    const apres = changer.mock.calls[0]![0] as Taches
    expect(apres.texte.content![0]!.content!.map((t) => t.content![0]!.content![0]!.text)).toEqual(['c'])
  })

  it('« Non merci » écarte la suggestion pour cette liste', () => {
    const { changer } = rendre(faites())
    act(() => hote.querySelectorAll<HTMLButtonElement>('.notak-suggestion button')[1]!.click())
    expect((changer.mock.calls[0]![0] as Taches).refus).toEqual(['faites'])
  })

  it('rien quand la liste n’est pas choisie seule, trop étroite, déjà écartée ou en lecture seule', () => {
    rendre(faites(), { seule: false })
    expect(hote.querySelector('.notak-suggestion')).toBeNull()
    rendre(faites(), { largeur: 20 })
    expect(hote.querySelector('.notak-suggestion')).toBeNull()
    rendre({ ...faites(), refus: ['faites'] })
    expect(hote.querySelector('.notak-suggestion')).toBeNull()
    rendre(faites(), { services: { lectureSeule: true } })
    expect(hote.querySelector('.notak-suggestion')).toBeNull()
  })

  it('une seule tâche faite ne propose rien', () => {
    rendre(contenu([tache('a', { checked: true }), tache('b')]))
    expect(hote.querySelector('.notak-suggestion')).toBeNull()
  })
})

describe('remplacerListe', () => {
  it('remet la liste sans toucher au titre, en un seul pas', () => {
    const editor = new Editor({ extensions: EXTENSIONS_TACHES, content: docEditeur(contenu([tache('a'), tache('b')], { titre: 'T' })) })
    remplacerListe(editor, contenu([tache('seule')]).texte.content![0]!)
    expect(editor.state.doc.firstChild?.type.name).toBe('titreListe')
    expect(editor.state.doc.lastChild?.childCount).toBe(1)
    expect(editor.state.doc.lastChild?.textContent).toBe('seule')
    editor.destroy()
  })
})

describe('retirer la dernière tâche', () => {
  const corbeille = () => hote.querySelector<HTMLButtonElement>('.notak-tache-suppr')!

  it('sans titre, la liste part à la corbeille', () => {
    jeter.mockClear()
    const { changer } = rendre(contenu([tache('a', { checked: true })]))
    act(() => corbeille().click())
    expect(jeter).toHaveBeenCalledWith(['l1'])
    expect(changer).not.toHaveBeenCalled()
  })

  it('avec un titre, une tâche vide reste ; avec un titre caché de même', () => {
    jeter.mockClear()
    const { changer } = rendre(contenu([tache('a', { checked: true })], { titre: 'Courses' }))
    act(() => corbeille().click())
    expect(jeter).not.toHaveBeenCalled()
    expect((changer.mock.calls[0]![0] as Taches).texte.content![0]!.content).toHaveLength(1)
    const autre = rendre(contenu([tache('a', { checked: true })], { titreCache: 'Courses' }))
    act(() => corbeille().click())
    expect(jeter).not.toHaveBeenCalled()
    expect(autre.changer).toHaveBeenCalled()
  })

  it('avec d’autres tâches, seule la tâche part', () => {
    jeter.mockClear()
    const { changer } = rendre(contenu([tache('a', { checked: true }), tache('b')]))
    act(() => corbeille().click())
    expect(jeter).not.toHaveBeenCalled()
    expect((changer.mock.calls[0]![0] as Taches).texte.content![0]!.content).toHaveLength(1)
  })
})
