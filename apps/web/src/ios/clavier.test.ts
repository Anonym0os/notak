// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { appliquerClavierDeLaCoque, ecouterClavier, hauteurDepuisViewport, lireClavier, suivreClavier } from './clavier'

describe('la hauteur du clavier', () => {
  it('se déduit de la viewport visible, sans bruit ni valeur négative', () => {
    expect(hauteurDepuisViewport(844, 844)).toBe(0)
    expect(hauteurDepuisViewport(844, 843.6)).toBe(0)
    expect(hauteurDepuisViewport(844, 500)).toBe(344)
    expect(hauteurDepuisViewport(844, 500, 20)).toBe(324)
    expect(hauteurDepuisViewport(500, 844)).toBe(0)
  })

  it('suit la visualViewport et le dit à la racine', () => {
    const d = window.document.implementation.createHTMLDocument('')
    const ecoutes = new Map<string, () => void>()
    const vv = { height: 844, offsetTop: 0, addEventListener: (type: string, f: () => void) => ecoutes.set(type, f) }
    const fenetre = { document: d, innerHeight: 844, visualViewport: vv }
    const vues: number[] = []
    const cesser = ecouterClavier((e) => vues.push(e.hauteur))
    suivreClavier(fenetre)
    expect(d.documentElement.hasAttribute('data-clavier')).toBe(false)
    vv.height = 500
    ecoutes.get('resize')!()
    expect(d.documentElement.style.getPropertyValue('--clavier')).toBe('344px')
    expect(d.documentElement.hasAttribute('data-clavier')).toBe(true)
    expect(lireClavier().hauteur).toBe(344)
    vv.height = 844
    ecoutes.get('resize')!()
    expect(d.documentElement.style.getPropertyValue('--clavier')).toBe('0px')
    expect(vues).toEqual([344, 0])
    cesser()
  })

  it('sans visualViewport, ne fait rien', () => {
    const d = window.document.implementation.createHTMLDocument('')
    suivreClavier({ document: d, innerHeight: 800, visualViewport: null })
    expect(d.documentElement.style.getPropertyValue('--clavier')).toBe('')
  })

  it('prend aussi l’événement de la coque, avec la durée de l’animation, et ignore une valeur illisible', () => {
    const d = window.document.implementation.createHTMLDocument('')
    appliquerClavierDeLaCoque(d, { hauteur: 336.5, duree: 0.25 })
    expect(d.documentElement.style.getPropertyValue('--clavier')).toBe('337px')
    expect(d.documentElement.style.getPropertyValue('--clavier-duree')).toBe('0.25s')
    appliquerClavierDeLaCoque(d, { hauteur: Number.NaN })
    expect(d.documentElement.style.getPropertyValue('--clavier')).toBe('337px')
    appliquerClavierDeLaCoque(d, { hauteur: 0 })
    expect(d.documentElement.hasAttribute('data-clavier')).toBe(false)
  })
})
