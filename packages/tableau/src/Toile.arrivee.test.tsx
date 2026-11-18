// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  // Une vue mesurée : l'arrivée n'attend que la taille connue de la toile.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(800)
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  fermerMenus()
  vi.restoreAllMocks()
})

/** Une note au-dessus de l'origine : ce qu'un lien visiteur montre d'abord, et que l'origine seule rogne. */
const elementHaut = { id: 'haut', x: 2, y: -2, largeur: 10, contenu: { type: 'note' as const, texte: { type: 'doc' as const, content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'En haut' }] }] } } }

const glisse = () => (hote.querySelector('.notak-glisse') as HTMLElement).style.transform

describe("l'arrivée sur une toile", () => {
  it('la première visite cadre le contenu : son haut descend sous les barres au lieu de rester hors de l’écran', () => {
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [elementHaut] })
    act(() => racine.render(<Toile magasin={magasin} arriver />))
    const m = glisse().match(/,\s*([0-9.]+)px\)$/)
    expect(m).not.toBeNull()
    // Le haut du contenu (y négatif) se retrouve à l'écran : la caméra a quitté l'origine.
    expect(Number(m![1])).toBeGreaterThan(0)
  })

  it('sans demande d’arrivée, la caméra centre l’origine : le haut du contenu reste hors de l’écran (ce que voyait un lien visiteur)', () => {
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [elementHaut] })
    act(() => racine.render(<Toile magasin={magasin} />))
    // La vue 1200×800 met l'origine (0, 0) au centre (600, 400) : une note posée à y −2 ug commence au-dessus de l'écran.
    expect(glisse()).toBe('translate(600px, 400px)')
  })
})
