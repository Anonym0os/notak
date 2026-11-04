// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { auTelephone } from './doigt'

const largeur = window.innerWidth
const hauteur = window.innerHeight
const ecran = (doigt: boolean, l: number, h: number) => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: doigt && q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {} }))
  Object.defineProperty(window, 'innerWidth', { value: l, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true })
}
afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'innerWidth', { value: largeur, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: hauteur, configurable: true })
})

describe('le téléphone', () => {
  it('au doigt, en portrait comme couché', () => {
    ecran(true, 390, 844)
    expect(auTelephone()).toBe(true)
    // Un iPhone couché : large, mais 390 px de haut. Les menus y montent en feuille comme en portrait.
    ecran(true, 844, 390)
    expect(auTelephone()).toBe(true)
  })

  it('pas un iPad, ni un ordinateur étroit', () => {
    ecran(true, 1024, 1366)
    expect(auTelephone()).toBe(false)
    ecran(true, 1366, 1024)
    expect(auTelephone()).toBe(false)
    ecran(false, 390, 400)
    expect(auTelephone()).toBe(false)
  })
})
