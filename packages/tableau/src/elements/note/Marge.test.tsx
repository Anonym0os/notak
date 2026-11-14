// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Element, Note } from '../../coeur/tableau'
import type { PropsRendu } from '../types'
import { RenduNote } from './Note'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// La fiche d'un passage commenté (`Marge.tsx`), ouverte d'un clic hors édition : ses messages se suppriment de leur menu
// « ⋯ », le premier comme les autres, après confirmation.

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  hote = document.createElement('div')
  hote.className = 'notak-plan'
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
})

const ana = { id: 'ana', nom: 'Ana' }
const bob = { id: 'bob', nom: 'Bob' }

function ouvrir(messages: { id: string; auteur: { id: string; nom: string }; texte: string }[], services: Record<string, unknown> = {}) {
  let contenu = {
    type: 'note',
    texte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'un passage', marks: [{ type: 'commentaireTexte', attrs: { fil: 'f1' } }] }] }] },
    fils: { f1: { type: 'commentaire', messages: messages.map((m) => ({ ...m, date: 0 })) } },
  } as unknown as Note
  const rendre = () => {
    const element = { id: 'n', x: 0, y: 0, largeur: 34, contenu } as Element<Note>
    const contexte = { services: { presence: { moi: () => ana, autres: () => [], ecouter: () => () => {}, signaler() {} }, ...services }, magasin: {}, prendrePointEdition: () => null, finirEdition: () => {}, commencerEdition: () => {}, creerSuivant: () => {}, jeter: () => {} }
    const props = { element, choisie: false, enEdition: false, contexte, brouillon: () => {}, changer: (c: Note) => ((contenu = c), rendre()) } as unknown as PropsRendu<Note>
    act(() => racine.render(<RenduNote {...props} />))
  }
  rendre()
  act(() => hote.querySelector<HTMLElement>('[data-fil="f1"]')!.click())
  return { messages: () => contenu.fils?.f1?.messages.map((m) => m.id) }
}

const menus = () => [...hote.querySelectorAll<HTMLButtonElement>('.notak-fil-marge .notak-commentaire-survol button[aria-haspopup="menu"]')]
const lignes = () => [...document.querySelectorAll<HTMLButtonElement>('.notak-commentaire-menu .notak-e')].map((b) => b.textContent)
const choisir = (libelle: string) => act(() => [...document.querySelectorAll<HTMLButtonElement>('.notak-commentaire-menu .notak-e')].find((b) => b.textContent === libelle)!.click())
const confirmer = () => act(() => [...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')].find((b) => b.textContent === 'Supprimer')!.click())

describe('supprimer un message dans la marge', () => {
  it('le premier message se supprime comme les autres, et la réponse reste', () => {
    const f = ouvrir([
      { id: 'm1', auteur: ana, texte: 'Pastèque' },
      { id: 'm2', auteur: bob, texte: 'Melon' },
    ])
    act(() => menus()[0]!.click())
    expect(lignes()).toEqual(['Modifier', 'Supprimer'])
    choisir('Supprimer')
    confirmer()
    expect(f.messages()).toEqual(['m2'])
  })

  it('le dernier message parti, la fiche se ferme : le passage n’est plus commenté', () => {
    const f = ouvrir([{ id: 'm1', auteur: ana, texte: 'Pastèque' }])
    act(() => menus()[0]!.click())
    choisir('Supprimer')
    confirmer()
    expect(f.messages()).toEqual([])
    expect(hote.querySelector('.notak-note-marge')).toBeNull()
    expect(hote.querySelector('[data-fil="f1"]')).toBeNull()
  })

  it('un éditeur ne supprime pas le message d’un autre ; le propriétaire, si', () => {
    ouvrir([{ id: 'm2', auteur: bob, texte: 'Melon' }], { droits: { role: 'edition', elements: {} } })
    expect(menus()).toHaveLength(0)
    act(() => racine.render(<></>))
    const f = ouvrir([{ id: 'm2', auteur: bob, texte: 'Melon' }], { droits: { role: 'proprietaire', elements: {} } })
    act(() => menus()[0]!.click())
    expect(lignes()).toEqual(['Supprimer'])
    choisir('Supprimer')
    confirmer()
    expect(f.messages()).toEqual([])
  })
})
