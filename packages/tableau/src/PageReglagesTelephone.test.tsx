// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PageReglages } from './PageReglages'
import type { Reglages } from './reglages'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const reglages: Reglages = { theme: 'clair', taille: 'moyenne', doubleClic: true, grille: 10, barre: 'flottante' }

let racine: Root
let hote: HTMLElement
const largeur = window.innerWidth
beforeEach(() => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'innerWidth', { value: largeur, configurable: true })
})

describe('les réglages sur un téléphone', () => {
  it('montrent la liste des rubriques, puis la rubrique touchée, et « Réglages » y ramène', () => {
    const fermer = vi.fn()
    act(() => racine.render(<PageReglages reglages={reglages} changer={() => {}} fermer={fermer} />))
    const rg = () => document.querySelector('.notak-rg')!
    expect(rg().classList.contains('notak-rg-telephone')).toBe(true)
    expect(rg().classList.contains('notak-rg-poussee')).toBe(false)
    act(() => document.querySelector<HTMLButtonElement>('.notak-rg-lien')!.click())
    expect(rg().classList.contains('notak-rg-poussee')).toBe(true)
    act(() => document.querySelector<HTMLButtonElement>('.notak-rg-retour')!.click())
    expect(rg().classList.contains('notak-rg-poussee')).toBe(false)
    act(() => document.querySelector<HTMLButtonElement>('.notak-rg-ok')!.click())
    expect(fermer).toHaveBeenCalled()
  })
})
