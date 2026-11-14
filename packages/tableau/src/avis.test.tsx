// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BandeauAvis, annoncer, retirerAvis } from './avis'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let toile: HTMLElement
let pleinEcran: HTMLElement
let racines: Root[]
beforeEach(() => {
  toile = document.createElement('div')
  pleinEcran = document.createElement('div')
  document.body.append(toile, pleinEcran)
  racines = [createRoot(toile), createRoot(pleinEcran)]
  act(() => racines[0]!.render(<BandeauAvis />))
})
afterEach(() => {
  act(() => {
    retirerAvis()
    racines.forEach((r) => r.unmount())
  })
  toile.remove()
  pleinEcran.remove()
})

describe('l’avis d’un plein écran', () => {
  it('sans plein écran, l’avis est celui de la toile', () => {
    act(() => annoncer({ texte: 'Enregistré dans Téléchargements' }))
    expect(toile.querySelector('.notak-avis')!.textContent).toContain('Enregistré dans Téléchargements')
  })

  it('un plein écran ouvert le montre par-dessus lui, et celui de la toile, qu’il cache, se tait', () => {
    act(() => racines[1]!.render(<BandeauAvis enGrand />))
    act(() => annoncer({ texte: 'Enregistré dans Téléchargements', action: { libelle: 'Afficher dans le Finder', faire: () => {} } }))
    expect(toile.querySelector('.notak-avis')).toBeNull()
    const avis = pleinEcran.querySelector<HTMLElement>('.notak-avis')!
    expect(avis.dataset.enGrand).toBe('true')
    // Un appui dessus ne referme pas la visionneuse : il est de ce qu'elle garde.
    expect(avis.hasAttribute('data-garder')).toBe(true)
    expect([...avis.querySelectorAll('button')].map((b) => b.textContent)).toContain('Afficher dans le Finder')
    // Refermé, la toile reprend l'avis encore là.
    act(() => racines[1]!.render(null))
    expect(toile.querySelector('.notak-avis')!.textContent).toContain('Enregistré dans Téléchargements')
  })
})
