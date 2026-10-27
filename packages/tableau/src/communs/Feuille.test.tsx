// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MenuContextuel } from './Menu'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
const largeur = window.innerWidth
beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'innerWidth', { value: largeur, configurable: true })
})

/** Un téléphone : le pointeur est le doigt, l'écran fait 390 px. */
function auTelephone() {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {} }))
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })
}

describe('le menu du clic droit au doigt sur un téléphone', () => {
  it('monte du bas en feuille, et une ligne touchée fait son action puis la ferme', () => {
    auTelephone()
    const faire = vi.fn()
    const fermer = vi.fn()
    act(() => racine.render(<MenuContextuel x={10} y={10} entrees={[{ libelle: 'Dupliquer', raccourci: '⌘D', faire }]} fermer={fermer} />))
    expect(document.querySelector('.notak-tiroir-bas')).not.toBeNull()
    expect(document.querySelector('.notak-menu-ctx')).toBeNull()
    act(() => document.querySelector<HTMLButtonElement>('.notak-tiroir-bas .notak-e')!.click())
    expect(faire).toHaveBeenCalled()
    expect(fermer).toHaveBeenCalled()
  })

  it('le clic que la webview tire du doigt qui l’a ouverte ne la referme pas ; un toucher sur le voile, ensuite, oui', () => {
    vi.useFakeTimers()
    auTelephone()
    const fermer = vi.fn()
    act(() => racine.render(<MenuContextuel x={10} y={10} entrees={[{ libelle: 'Copier', faire() {} }]} fermer={fermer} />))
    const voile = document.querySelector<HTMLElement>('.notak-tiroir-bas-voile')!
    act(() => voile.click())
    expect(fermer).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(400))
    act(() => voile.click())
    expect(fermer).toHaveBeenCalled()
  })

  it('à la souris, il reste posé au point cliqué', () => {
    act(() => racine.render(<MenuContextuel x={10} y={10} entrees={[{ libelle: 'Copier', faire() {} }]} fermer={() => {}} />))
    expect(document.querySelector('.notak-menu-ctx')).not.toBeNull()
    expect(document.querySelector('.notak-tiroir-bas')).toBeNull()
  })
})
