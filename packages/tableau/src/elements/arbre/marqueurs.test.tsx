import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { GROUPES_MARQUEURS, MARQUEURS_CACHES, Marqueur, estPerso } from './marqueurs'
import { groupeDuMarqueur } from './modele/elements'

describe('les marqueurs du panneau', () => {
  it('sept groupes, dans l’ordre de Xmind, 58 marqueurs', () => {
    expect(GROUPES_MARQUEURS.map((g) => [g.cle, g.marqueurs.length])).toEqual([
      ['tag', 7],
      ['priority', 7],
      ['task', 7],
      ['flag', 7],
      ['star', 7],
      ['people', 7],
      ['symbol', 16],
    ])
    expect(GROUPES_MARQUEURS.reduce((n, g) => n + g.marqueurs.length, 0)).toBe(58)
  })

  it('les identifiants sont ceux du format .xmind, sans doublon, et chacun est de son groupe', () => {
    const tous = GROUPES_MARQUEURS.flatMap((g) => g.marqueurs)
    expect(new Set(tous).size).toBe(tous.length)
    expect(GROUPES_MARQUEURS[0]!.marqueurs).toEqual(['tag-red', 'tag-orange', 'tag-yellow', 'tag-green', 'tag-blue', 'tag-purple', 'tag-gray'])
    expect(GROUPES_MARQUEURS[2]!.marqueurs[0]).toBe('task-start')
    expect(GROUPES_MARQUEURS[2]!.marqueurs.at(-1)).toBe('task-done')
    for (const g of GROUPES_MARQUEURS) for (const m of g.marqueurs) expect(groupeDuMarqueur(m)).toBe(g.cle)
  })

  it('chaque marqueur se dessine, ceux qu’on ne montre pas aussi ; un marqueur inconnu se garde en pastille grise', () => {
    for (const m of [...GROUPES_MARQUEURS.flatMap((g) => g.marqueurs), ...MARQUEURS_CACHES]) {
      const svg = renderToStaticMarkup(<svg><Marqueur id={m} /></svg>)
      expect(svg.length, m).toBeGreaterThan(30)
      expect(svg, m).not.toContain('<title>')
    }
    expect(renderToStaticMarkup(<svg><Marqueur id="mois-janvier" /></svg>)).toContain('<title>mois-janvier</title>')
  })

  it('un marqueur à soi se dessine d’après son image, ou en pastille s’il n’en a pas encore', () => {
    expect(estPerso('perso-abc')).toBe(true)
    expect(estPerso('flag-red')).toBe(false)
    expect(renderToStaticMarkup(<svg><Marqueur id="perso-abc" perso={() => 'blob:x'} /></svg>)).toContain('href="blob:x"')
    expect(renderToStaticMarkup(<svg><Marqueur id="perso-abc" /></svg>)).toContain('<circle')
  })
})
