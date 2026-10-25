import { describe, expect, it } from 'vitest'
import { lireHabillage } from './format'
import { cssDeHabillage } from './variables'

const h = lireHabillage({
  notak: 'habillage',
  version: 1,
  id: 'silak',
  nom: 'Silak',
  couleurs: { clair: { fond: '#f5f2ee', accent: '#356673' }, sombre: { fond: '#000c12' } },
  rayons: { panneau: 20 },
  polices: { titre: ['Familjen Grotesk', 'sans-serif'] },
})

describe('cssDeHabillage', () => {
  const css = cssDeHabillage(h)

  it('pose les rayons et les polices dans les deux modes', () => {
    expect(css).toContain(":root[data-habillage='silak'],\n:root[data-habillage='silak'] :is(")
    expect(css).toContain('--notak-rayon-panneau: 20px;')
    expect(css).toContain('--notak-serif: "Familjen Grotesk", sans-serif;')
  })

  it('ne repeint chaque mode qu’avec ses propres couleurs', () => {
    const regles = css.split('}\n')
    const clair = regles.find((r) => r.startsWith(":root[data-habillage='silak']:not([data-mode='sombre'])"))!
    expect(clair).toContain('--notak-fond: #f5f2ee;')
    expect(clair).toContain('--fond: #f5f2ee;')
    expect(clair).toContain('--notak-m-accent: #356673;')
    const sombre = regles.find((r) => r.startsWith(":root[data-habillage='silak'][data-mode='sombre']"))!
    expect(sombre).toContain('--notak-fond: #000c12;')
    expect(sombre).not.toContain('#356673')
  })

  it('n’écrit rien pour un habillage qui ne dit rien', () => {
    expect(cssDeHabillage(lireHabillage({ notak: 'habillage', version: 1, id: 'vide', nom: 'Vide' }))).toBe('')
  })
})
