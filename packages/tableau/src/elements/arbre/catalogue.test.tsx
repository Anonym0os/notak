import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { en, fr } from '../../langue'
import { AUTOCOLLANTS, DessinIllustration, ILLUSTRATIONS, Autocollant, illustrationDe, svgVignette } from './catalogue'

describe('les autocollants', () => {
  it('treize catégories, comme Xmind, chacune avec son nom dans les deux langues et des emojis sans doublon', () => {
    expect(AUTOCOLLANTS.map((c) => c.cle)).toEqual(['business', 'education', 'technology', 'mood', 'travel', 'holiday', 'daily', 'animal', 'weather', 'sport', 'food', 'gesture', 'others'])
    for (const c of AUTOCOLLANTS) {
      expect(fr[`arbre.icones.cat.${c.cle}`], c.cle).toBeTruthy()
      expect(en[`arbre.icones.cat.${c.cle}`], c.cle).toBeTruthy()
      expect(c.emojis.length, c.cle).toBeGreaterThanOrEqual(14)
      expect(new Set(c.emojis).size, c.cle).toBe(c.emojis.length)
      // Un seul emoji par cellule : aucune lettre ni espace n'a glissé dans la liste.
      for (const e of c.emojis) expect(e, c.cle).not.toMatch(/^[\s\w]+$/)
    }
  })
})

describe('les illustrations', () => {
  it('douze groupes, dans l’ordre de Xmind, nommés dans les deux langues ; leurs sous-catégories aussi', () => {
    expect(ILLUSTRATIONS.map((g) => g.cle)).toEqual(['minimaliste', 'reveur', 'botanique', 'ville', 'papeterieDegradee', 'pixel', 'aquarelle', 'animaux3d', 'nourriture3d', 'bureauReve', 'enfantin', 'pierres'])
    for (const g of ILLUSTRATIONS) {
      expect(fr[`arbre.icones.ill.${g.cle}`], g.cle).toBeTruthy()
      expect(en[`arbre.icones.ill.${g.cle}`], g.cle).toBeTruthy()
      for (const s of g.sous) expect(fr[`arbre.icones.ill.${s.cle}`], s.cle).toBeTruthy()
    }
    // Le premier groupe a les sous-catégories de Xmind.
    expect(ILLUSTRATIONS[0]!.sous.map((s) => s.cle)).toEqual(['productivite', 'voyage', 'vacances', 'nourriture', 'autres'])
    expect(ILLUSTRATIONS.at(-1)!.sous).toHaveLength(11)
  })

  it('chacune a un identifiant unique, se retrouve par lui et se dessine', () => {
    const toutes = ILLUSTRATIONS.flatMap((g) => g.sous.flatMap((s) => s.illustrations))
    expect(toutes.length).toBeGreaterThan(150)
    expect(new Set(toutes.map((x) => x.id)).size).toBe(toutes.length)
    for (const x of toutes) {
      expect(illustrationDe(x.id)).toBe(x)
      const svg = renderToStaticMarkup(<svg><DessinIllustration id={x.id} l={64} h={64} /></svg>)
      expect(svg, x.id).toContain('<rect')
      expect(svg, x.id).toContain('<svg')
    }
  })

  it('une illustration inconnue se dessine en gabarit gris plutôt que de casser la carte', () => {
    expect(renderToStaticMarkup(<svg><DessinIllustration id="rien.du.tout" l={64} h={64} /></svg>)).toContain('#e5e7eb')
  })

  it('un autocollant ou une illustration s’écrivent en SVG autonome, pour l’export', async () => {
    expect(renderToStaticMarkup(<svg><Autocollant emoji="🎉" l={64} h={64} /></svg>)).toContain('🎉')
    const sticker = await svgVignette({ genre: 'autocollant', id: '🎉', l: 64, h: 64 })
    expect(sticker).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="64" height="64"/)
    expect(sticker).toContain('🎉')
    const illustration = await svgVignette({ genre: 'illustration', id: ILLUSTRATIONS[0]!.sous[0]!.illustrations[0]!.id, l: 64, h: 64 })
    expect(illustration).toContain('<path')
  })
})
