// @vitest-environment jsdom
import { act, createElement, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { pres, useBarreRetenue } from './apercuOutils'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => document.body.replaceChildren())

function barre(droite: number) {
  const nav = document.createElement('nav')
  nav.className = 'notak-barre-outils'
  nav.getBoundingClientRect = () => ({ right: droite }) as DOMRect
  const outil = document.createElement('button')
  nav.append(outil)
  document.body.append(nav)
  return { nav, outil }
}

describe('la barre ramenée par le bord gauche', () => {
  it('reste tant que le pointeur est sur elle, son tiroir ou le bord', () => {
    const { nav, outil } = barre(88)
    const tiroir = document.createElement('div')
    tiroir.className = 'notak-tiroir'
    document.body.append(tiroir)
    expect(pres(outil, 500, nav)).toBe(true)
    expect(pres(tiroir, 500, nav)).toBe(true)
  })

  it('reste à moins de 24 px de son flanc, repart au-delà', () => {
    const { nav } = barre(88)
    const toile = document.createElement('div')
    document.body.append(toile)
    expect(pres(toile, 112, nav)).toBe(true)
    expect(pres(toile, 113, nav)).toBe(false)
  })
})

describe('la barre retenue par une sélection', () => {
  it('suit la barre de la sélection que dessine la toile : présente, le bouton est retenu ; partie, il est rendu', async () => {
    let retenue = false
    let espace: HTMLDivElement | null = null
    function Espace() {
      const racine = useRef<HTMLDivElement>(null)
      retenue = useBarreRetenue(racine)
      return createElement('div', { ref: (n: HTMLDivElement | null) => { racine.current = n; espace = n } })
    }
    const hote = document.createElement('div')
    document.body.append(hote)
    const r = createRoot(hote)
    act(() => r.render(createElement(Espace)))
    expect(retenue).toBe(false)
    const nav = document.createElement('nav')
    nav.className = 'notak-barre-outils'
    nav.dataset.selection = ''
    await act(async () => void espace!.append(nav))
    expect(retenue).toBe(true)
    await act(async () => void nav.remove())
    expect(retenue).toBe(false)
    act(() => r.unmount())
  })
})
