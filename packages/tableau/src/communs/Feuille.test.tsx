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
    act(() => document.querySelector<HTMLButtonElement>('.notak-tiroir-bas .notak-actions-ligne')!.click())
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

  it('se ferme quand on la tire vers le bas depuis n’importe où, et revient si on la lâche trop tôt', () => {
    vi.useFakeTimers()
    auTelephone()
    const fermer = vi.fn()
    act(() => racine.render(<MenuContextuel x={10} y={10} entrees={[{ libelle: 'Copier', faire() {} }, { libelle: 'Coller', faire() {} }]} fermer={fermer} />))
    act(() => void vi.advanceTimersByTime(400))
    const feuille = document.querySelector<HTMLElement>('.notak-tiroir-bas')!
    const ligne = document.querySelector<HTMLElement>('.notak-actions-ligne')!
    const doigt = (type: string, y: number, cible: EventTarget = window, t = 0) =>
      act(() => {
        const e = Object.assign(new Event(type, { bubbles: true }), { pointerId: 1, pointerType: 'touch', clientX: 50, clientY: y, button: 0 })
        Object.defineProperty(e, 'timeStamp', { value: t })
        cible.dispatchEvent(e)
      })
    // Un peu : elle suit le doigt, puis remonte.
    doigt('pointerdown', 300, ligne)
    doigt('pointermove', 320, window, 100)
    doigt('pointermove', 350, window, 200)
    expect(feuille.style.transform).toBe('translateY(30px)')
    doigt('pointerup', 350, window, 1000)
    expect(fermer).not.toHaveBeenCalled()
    expect(feuille.style.transform).toBe('')
    // Assez bas : elle se ferme, et le clic du relâchement ne déclenche pas la ligne.
    doigt('pointerdown', 300, ligne, 2000)
    doigt('pointermove', 320, window, 2100)
    doigt('pointermove', 600, window, 3000)
    doigt('pointerup', 600, window, 3500)
    expect(fermer).toHaveBeenCalled()
  })

  it('à la souris, il reste posé au point cliqué', () => {
    act(() => racine.render(<MenuContextuel x={10} y={10} entrees={[{ libelle: 'Copier', faire() {} }]} fermer={() => {}} />))
    expect(document.querySelector('.notak-menu-ctx')).not.toBeNull()
    expect(document.querySelector('.notak-tiroir-bas')).toBeNull()
  })
})
