// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { creerMagasin } from './coeur/magasin'
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

/** Un double-clic sur le vide crée une note et l'édite. */
function ecrire(barreAGauche: boolean) {
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [] })
  act(() => racine.render(<Toile magasin={magasin} services={{ barreAGauche }} />))
  act(() => {
    hote.querySelector('.notak-toile')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 300, clientY: 200 }))
  })
}

describe('une note en édition, avec la barre à gauche', () => {
  it('ses outils de texte prennent la barre de gauche, sans barre flottante', async () => {
    ecrire(true)
    await act(async () => {})
    const nav = hote.querySelector('nav[data-edition]')!
    expect(nav).not.toBeNull()
    expect(nav.querySelector('button[aria-label="Gras"]')).not.toBeNull()
    expect(nav.querySelector('.notak-barre-retour')).not.toBeNull()
    expect(nav.querySelector('[data-corbeille]')).not.toBeNull()
    expect(hote.querySelector('.notak-note-barre')).toBeNull()
    // La barre de création a cédé la place.
    expect(hote.querySelectorAll('nav.notak-barre-outils')).toHaveLength(1)
  })

  it('la flèche retour termine l’écriture : la note reste choisie, la barre passe à ses outils de sélection', async () => {
    ecrire(true)
    await act(async () => {})
    act(() => hote.querySelector<HTMLButtonElement>('nav[data-edition] .notak-barre-retour')!.click())
    await act(async () => {})
    expect(hote.querySelector('nav[data-edition]')).toBeNull()
    const nav = hote.querySelector('nav[data-selection]')!
    expect(nav).not.toBeNull()
    expect([...nav.querySelectorAll('.notak-outil-libelle')].map((l) => l.textContent)).toContain('Couleur')
  })

  it('avec la barre flottante, la note garde sa barre au-dessus et la barre de création reste à gauche', async () => {
    ecrire(false)
    await act(async () => {})
    expect(hote.querySelector('.notak-note-barre')).not.toBeNull()
    expect(hote.querySelector('nav[data-edition]')).toBeNull()
    expect(hote.querySelector('nav.notak-barre-outils:not([data-selection])')).not.toBeNull()
  })
})
