// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import { type Contenu, type Element, nouvelleNote } from '../../coeur/tableau'
import '../index'
import type { ContexteToile } from '../types'
import { RenduClone } from './Clone'
import { nouveauClone } from './original'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class ObservateurMuet {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ObservateurMuet

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

function monde() {
  const note: Element = { ...nouvelleNote(0, 0, 'Une idée'), id: 'n' }
  const clone = nouveauClone(20, 0, 'n', 30)
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [note, clone] })
  const brouillons: [string, Contenu][] = []
  const contexte = {
    magasin,
    choisir: () => {},
    rect: () => null,
    commencerEdition: () => {},
    finirEdition: () => {},
    prendrePointEdition: () => null,
    brouillonDe: (el: Element, apres: Contenu) => void brouillons.push([el.id, apres]),
    services: {},
  } as unknown as ContexteToile
  return { note, clone, contexte, brouillons }
}

describe('le clone, sur place', () => {
  it('hors édition, il montre l’original sans éditeur', () => {
    const { clone, contexte } = monde()
    act(() =>
      racine.render(<RenduClone element={clone} choisie={false} enEdition={false} contexte={contexte} brouillon={() => {}} changer={() => {}} />),
    )
    expect(hote.textContent).toContain('Une idée')
    expect(hote.querySelector('[contenteditable="true"]')).toBeNull()
  })

  it('en édition, l’éditeur de l’original s’ouvre dans le clone, et le brouillon va à l’original', () => {
    const { clone, contexte, brouillons } = monde()
    let brouillonDuClone = 0
    act(() =>
      racine.render(<RenduClone element={clone} choisie enEdition contexte={contexte} brouillon={() => void brouillonDuClone++} changer={() => {}} />),
    )
    const editeur = hote.querySelector<HTMLElement>('[contenteditable="true"]')
    expect(editeur).not.toBeNull()
    expect(editeur!.textContent).toContain('Une idée')
    // Ce que le clone passe à l’original écrit l’original, jamais le clone.
    expect(brouillonDuClone).toBe(0)
    expect(brouillons.every(([id]) => id === 'n')).toBe(true)
  })
})
