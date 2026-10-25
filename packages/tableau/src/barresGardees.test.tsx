// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { creerMagasin } from './coeur/magasin'
import { nouvelleNote } from './coeur/tableau'
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
  document.elementsFromPoint ??= () => []
  ;(globalThis as { CSS?: { escape(s: string): string } }).CSS ??= { escape: (s) => s }
  HTMLElement.prototype.setPointerCapture ??= () => {}
  HTMLElement.prototype.releasePointerCapture ??= () => {}
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  fermerMenus()
})

const pointeur = (cible: Element, type: string, x: number, y: number, button: number) =>
  act(() => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, button, buttons: type === 'pointerup' ? 0 : button === 1 ? 4 : 1, clientX: x, clientY: y })
    Object.assign(e, { pointerId: 1, pointerType: 'mouse' })
    cible.dispatchEvent(e)
  })

/** Une note choisie, la barre de ses outils à gauche. */
async function choisir() {
  const note = nouvelleNote(0, 0, 'Une idée')
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [note] })
  act(() => racine.render(<Toile magasin={magasin} services={{ barreAGauche: true }} />))
  await act(async () => {})
  const carte = hote.querySelector(`[data-id="${note.id}"]`)!
  pointeur(carte, 'pointerdown', 20, 20, 0)
  pointeur(carte, 'pointerup', 20, 20, 0)
  await act(async () => {})
  expect(hote.querySelector('nav[data-selection]')).not.toBeNull()
  return { toile: hote.querySelector('.notak-toile')!, carte }
}

describe('les barres pendant un geste', () => {
  it('la toile tirée au bouton du milieu garde la barre de la sélection, pendant et après', async () => {
    const { toile } = await choisir()
    pointeur(toile, 'pointerdown', 400, 300, 1)
    for (let i = 1; i <= 5; i++) pointeur(toile, 'pointermove', 400 - i * 20, 300 - i * 10, 1)
    expect(hote.querySelector('nav[data-selection]')).not.toBeNull()
    expect(hote.querySelector('nav.notak-barre-outils:not([data-selection])')).toBeNull()
    pointeur(toile, 'pointerup', 300, 250, 1)
    await act(async () => {})
    expect(hote.querySelector('nav[data-selection]')).not.toBeNull()
  })

  it('un appui sur la note choisie, sans bouger, ne fait pas revenir la barre de création', async () => {
    const { carte } = await choisir()
    pointeur(carte, 'pointerdown', 20, 20, 0)
    expect(hote.querySelector('nav[data-selection]')).not.toBeNull()
    expect(hote.querySelector('nav.notak-barre-outils:not([data-selection])')).toBeNull()
    pointeur(carte, 'pointerup', 20, 20, 0)
  })

  it('la note glissée pour de bon rend la place à la barre de création, jusqu’au lâcher', async () => {
    const { carte } = await choisir()
    pointeur(carte, 'pointerdown', 20, 20, 0)
    pointeur(carte, 'pointermove', 80, 60, 0)
    expect(hote.querySelector('nav[data-selection]')).toBeNull()
    expect(hote.querySelector('nav.notak-barre-outils:not([data-selection])')).not.toBeNull()
    pointeur(carte, 'pointerup', 80, 60, 0)
  })
})
