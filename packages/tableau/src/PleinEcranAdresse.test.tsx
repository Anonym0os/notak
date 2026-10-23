// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { creerMagasin } from './coeur/magasin'
import { type Element, nouvelId } from './coeur/tableau'
import './elements'
import { fermerMenus } from './menuUnique'
import { Toile } from './Toile'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class ObservateurMuet {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ObservateurMuet
  document.elementFromPoint ??= () => null
  ;(globalThis as { CSS?: { escape(s: string): string } }).CSS ??= { escape: (s) => s }
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  fermerMenus()
})

const texte = { type: 'doc', content: [{ type: 'paragraph' }] }
const document_: Element = { id: nouvelId(), x: 2, y: 2, largeur: 17, contenu: { type: 'document', titre: 'Notes', texte } }
const note: Element = { id: nouvelId(), x: 30, y: 2, largeur: 17, contenu: { type: 'note', texte } }

describe('le plein écran d’un élément a une adresse', () => {
  it('l’adresse qui nomme un document le choisit et l’ouvre en grand, sans le redire à l’application', async () => {
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [document_, note] })
    const pleinEcran = vi.fn()
    act(() => racine.render(<Toile magasin={magasin} services={{ elementAdresse: document_.id, pleinEcran }} />))
    await act(async () => {})
    expect(document.querySelector('.notak-document-fond')).not.toBeNull()
    expect(pleinEcran).not.toHaveBeenCalled()
  })

  it('une adresse qui nomme un élément absent ou sans plein écran n’ouvre rien', async () => {
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [document_, note] })
    act(() => racine.render(<Toile magasin={magasin} services={{ elementAdresse: note.id }} />))
    await act(async () => {})
    expect(document.querySelector('.notak-document-fond')).toBeNull()
    act(() => racine.render(<Toile magasin={magasin} services={{ elementAdresse: 'inconnu' }} />))
    await act(async () => {})
    expect(document.querySelector('.notak-document-fond')).toBeNull()
  })

  it('quand l’adresse perd l’élément (retour du navigateur), le document se referme', async () => {
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [document_] })
    act(() => racine.render(<Toile magasin={magasin} services={{ elementAdresse: document_.id }} />))
    await act(async () => {})
    expect(document.querySelector('.notak-document-fond')).not.toBeNull()
    act(() => racine.render(<Toile magasin={magasin} services={{ elementAdresse: null }} />))
    await act(async () => {})
    expect(document.querySelector('.notak-document-fond')).toBeNull()
  })
})
