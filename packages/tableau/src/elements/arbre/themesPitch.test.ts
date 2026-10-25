import { describe, expect, it } from 'vitest'
import { THEMES_PITCH, themePitchDe, variablesDeTheme } from './themesPitch'

describe('les thèmes du mode Pitch', () => {
  it('gardent les sept identifiants, dans l’ordre du sélecteur ; un inconnu retombe sur le sombre', () => {
    expect(THEMES_PITCH.map((x) => x.id)).toEqual(['light', 'default', 'innocence', 'shape-for-you', 'midnight-rose', 'hubble-bubble', 'hand-drawn'])
    expect(themePitchDe('mindmap').id).toBe('default')
    expect(themePitchDe(undefined).id).toBe('default')
  })

  it('prennent fond et premier plan du relevé, sans accent ni motif', () => {
    const palette = Object.fromEntries(THEMES_PITCH.map((x) => [x.id, [x.fond, x.texte, x.surbrillance]]))
    expect(palette).toEqual({
      light: ['#f9f9f9', '#000', '#007AFF'],
      default: ['#000', '#fff', '#0A84FF'],
      innocence: ['#F7FFF4', '#000', '#0A84FF'],
      'shape-for-you': ['#FAE4E8', '#000', '#0A84FF'],
      'midnight-rose': ['#2C47D8', '#fff', '#45A2FF'],
      'hubble-bubble': ['#48C279', '#FDFF8C', '#0A84FF'],
      'hand-drawn': ['#EDF4E5', '#2F4DB5', '#007AFF'],
    })
    for (const th of THEMES_PITCH) {
      expect(th).not.toHaveProperty('accent')
      expect(th).not.toHaveProperty('motif')
    }
    // La vignette du clair est d'un blanc pur.
    expect(themePitchDe('light').fondVignette).toBe('#fff')
  })

  it('ont leurs polices et leurs graisses', () => {
    const de = (id: string) => themePitchDe(id)
    expect(de('default').police).toMatch(/^"SF Pro Display", -apple-system/)
    expect(de('light').police).toBe(de('default').police)
    expect([de('innocence').graisse, de('innocence').graisseTitre]).toEqual([700, 700])
    expect(de('shape-for-you').police).toMatch(/^"Tenor Sans"/)
    expect([de('shape-for-you').graisse, de('shape-for-you').graisseTitre]).toEqual([400, 400])
    expect(de('midnight-rose').police).toMatch(/^Audiowide/)
    expect(de('hubble-bubble').policeTitre).toMatch(/^Modak/)
    expect(de('hubble-bubble').police).not.toMatch(/Modak/)
    expect([de('hand-drawn').graisse, de('hand-drawn').graisseTitre]).toEqual([400, 700])
  })

  it('donnent leurs opacités propres : sous-sujets en attente 0,3 en sombre et midnight-rose, 0,2 ailleurs', () => {
    expect(THEMES_PITCH.filter((x) => x.enAttente === 0.3).map((x) => x.id)).toEqual(['default', 'midnight-rose'])
    expect(THEMES_PITCH.filter((x) => x.contourImage === 10).map((x) => x.id)).toEqual(['midnight-rose', 'hubble-bubble'])
    expect(themePitchDe('hand-drawn').rognage).toBe(30)
  })

  it('posent les variables que le dessin des gabarits lit', () => {
    const v = variablesDeTheme(themePitchDe('hubble-bubble')) as Record<string, string>
    expect(v['--d-fond']).toBe('#48C279')
    expect(v['--d-texte']).toBe('#FDFF8C')
    expect(v['--d-police']).toMatch(/Nunito/)
    expect(v['--d-police-titre']).toMatch(/^Modak/)
    expect(v['--d-graisse-titre']).toBe('700')
    expect(v).not.toHaveProperty('--d-accent')
    expect(v).not.toHaveProperty('--d-motif')
  })
})
