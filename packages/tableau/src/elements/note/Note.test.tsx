// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type Element, type Note, docDepuisTexte } from '../../coeur/tableau'
import type { PropsRendu } from '../types'
import { RenduNote } from './Note'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
})

const rendre = (contenu: Partial<Note>, services: object = {}) => {
  const element = { id: 'n', x: 0, y: 0, largeur: 34, contenu: { type: 'note', texte: docDepuisTexte('Bonjour'), ...contenu } } as Element<Note>
  const props = { element, choisie: false, enEdition: false, contexte: { services }, brouillon: () => {}, changer: () => {} } as unknown as PropsRendu<Note>
  act(() => racine.render(<RenduNote {...props} />))
}

describe('la légende de la note, hors édition', () => {
  it('un texte brut d\'avant se lit comme une légende, une ligne par paragraphe', () => {
    rendre({ legende: 'un\ndeux' })
    const paragraphes = [...hote.querySelectorAll('.notak-note-legende p')].map((p) => p.textContent)
    expect(paragraphes).toEqual(['un', 'deux'])
  })

  it('un texte riche garde sa mise en forme', () => {
    rendre({ legende: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'gras', marks: [{ type: 'bold' }] }] }] } })
    expect(hote.querySelector('.notak-note-legende strong')?.textContent).toBe('gras')
  })

  it('une légende vide n\'occupe aucune place', () => {
    rendre({ legende: { type: 'doc', content: [{ type: 'paragraph' }] } })
    expect(hote.querySelector('.notak-note-legende')).toBeNull()
  })
})

describe('un passage commenté, hors édition', () => {
  const commentee = {
    texte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'un passage', marks: [{ type: 'commentaireTexte', attrs: { fil: 'f1' } }] }] }] },
    fils: { f1: { type: 'commentaire', messages: [{ id: 'm', auteur: { id: 'a', nom: 'Ana' }, date: 0, texte: 'Une remarque' }] } },
  } as unknown as Partial<Note>

  it('un clic sur le passage ouvre son fil, un second le referme', () => {
    hote.className = 'notak-plan'
    rendre(commentee)
    const passage = () => hote.querySelector<HTMLElement>('[data-fil="f1"]')!
    expect(hote.querySelector('.notak-note-marge')).toBeNull()
    act(() => passage().click())
    expect(hote.querySelector('.notak-note-marge')?.textContent).toContain('Une remarque')
    act(() => passage().click())
    expect(hote.querySelector('.notak-note-marge')).toBeNull()
  })

  it('un clic ailleurs le referme', () => {
    hote.className = 'notak-plan'
    rendre(commentee)
    act(() => hote.querySelector<HTMLElement>('[data-fil="f1"]')!.click())
    expect(hote.querySelector('.notak-note-marge')).not.toBeNull()
    act(() => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })
    expect(hote.querySelector('.notak-note-marge')).toBeNull()
  })
})

describe('la note en lecture seule', () => {
  it('son texte se choisit (l\'attribut le dit au CSS)', () => {
    rendre({}, { lectureSeule: true })
    expect(hote.querySelector('.notak-note')?.hasAttribute('data-lecture-seule')).toBe(true)
  })
})
