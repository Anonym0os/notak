// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { pres } from './apercuOutils'

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
