// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DocumentTexte, Element } from '../../coeur/tableau'
import { definirLangue } from '../../langue'
import type { ContexteToile } from '../types'
import { RenduDocument } from './Document'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  definirLangue('fr')
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
})

const doc = (texte: string, plus: Partial<DocumentTexte> = {}): Element<DocumentTexte> => ({
  id: 'D',
  x: 0,
  y: 0,
  largeur: 10,
  contenu: { type: 'document', titre: 'Notes', texte: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: texte }] }] }, ...plus },
})

function monter(element: Element<DocumentTexte>, options: { lectureSeule?: boolean; enEdition?: boolean }) {
  const contexte = {
    services: { lectureSeule: !!options.lectureSeule },
    finirEdition: () => {},
    choisir: () => {},
    selection: new Set(['D']),
  } as unknown as ContexteToile
  act(() =>
    racine.render(
      <RenduDocument element={element} choisie enEdition={!!options.enEdition} contexte={contexte} brouillon={() => {}} changer={() => {}} />,
    ),
  )
}

describe('le document ouvert en grand', () => {
  it('en édition, la colonne d’outils finit par l’outil Commentaire, et la boîte est l’ancre des fils', () => {
    monter(doc('bonjour'), { enEdition: true })
    expect(document.querySelector('.notak-document-boite[data-marge-ancre]')).not.toBeNull()
    const noms = [...document.querySelectorAll<HTMLButtonElement>('.notak-document-outils button.notak-outil-texte')].map((b) => b.getAttribute('aria-label'))
    expect(noms.some((n) => n === 'Commenter le passage')).toBe(true)
  })

  it('en lecture seule, la colonne d’outils est réduite et vide', () => {
    monter(doc('bonjour'), { lectureSeule: true })
    act(() => void hote.querySelector('.notak-document')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    const boite = document.querySelector('.notak-document-boite')!
    expect(boite.getAttribute('data-lecture')).toBe('true')
    expect(boite.querySelector('.notak-document-cote')!.children).toHaveLength(0)
  })

  it('un bloc d’une version plus récente ouvre le document en lecture seule, sans rien perdre (NOTION.md § 1)', () => {
    const recent = doc('', {
      texte: { type: 'doc', content: [{ type: 'blocDuFutur', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'gardé' }] }] }] },
    })
    monter(recent, { enEdition: true })
    const boite = document.querySelector('.notak-document-boite')!
    expect(boite.getAttribute('data-lecture')).toBe('true')
    expect(boite.querySelector('.ProseMirror')).toBeNull()
    expect(boite.querySelector('.notak-document-plus-recent')).not.toBeNull()
    expect(boite.querySelector('.notak-texte')!.textContent).toBe('gardé')
  })
})
