// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { creerMagasin } from './coeur/magasin'
import { type Element, nouvelleNote } from './coeur/tableau'
import './elements'
import { fermerMenus } from './menuUnique'
import type { Services } from './elements/types'
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

/** La toile de ces éléments, montée ; on lui parle au clavier comme quand elle a le focus. */
async function monter(elements: Element[], services: Services = {}) {
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements })
  act(() => racine.render(<Toile magasin={magasin} services={services} />))
  await act(async () => {})
  const toile = hote.querySelector<HTMLElement>('.notak-toile')!
  const taper = (key: string, mods: KeyboardEventInit = {}) =>
    act(() => void toile.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods })))
  const place = (id: string) => {
    const e = magasin.lire().elements.find((x) => x.id === id)
    return e && [e.x, e.y]
  }
  return { magasin, toile, taper, place }
}

/** Tout choisir, au clavier. */
const toutChoisir = (taper: (key: string, mods?: KeyboardEventInit) => void) => taper('a', { code: 'KeyA', keyCode: 65, metaKey: true })

describe('les flèches et le verrou', () => {
  it('dans une sélection mêlée, les flèches déplacent les autres, de 1 puis de 5 avec Maj ; le verrouillé reste', async () => {
    const libre = nouvelleNote(0, 0, 'libre')
    const fige = { ...nouvelleNote(40, 0, 'fige'), verrou: true }
    const { taper, place } = await monter([libre, fige])
    toutChoisir(taper)
    taper('ArrowRight')
    expect(place(libre.id)).toEqual([1, 0])
    taper('ArrowDown', { shiftKey: true })
    expect(place(libre.id)).toEqual([1, 5])
    expect(place(fige.id)).toEqual([40, 0])
  })

  it('le verrouillé choisi seul ne bouge pas, et rien ne s’inscrit à annuler', async () => {
    const fige = { ...nouvelleNote(40, 0, 'fige'), verrou: true }
    const { taper, place, magasin } = await monter([fige])
    toutChoisir(taper)
    taper('ArrowLeft', { shiftKey: true })
    expect(place(fige.id)).toEqual([40, 0])
    expect(magasin.peutAnnuler()).toBe(false)
  })
})

