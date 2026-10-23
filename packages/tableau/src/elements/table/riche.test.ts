import { describe, expect, it } from 'vitest'
import { basculer, detecterLiens, enPassages, marquesCommunes, morceaux, normaliser, parCaractere, passagesDe, peutEtreRiche, poser, richeDe } from './riche'

describe('le texte riche d’une cellule', () => {
  it('le gras d’un mot ne touche pas le reste', () => {
    const p = basculer([], 12, 8, 12, 'gras')
    expect(p).toEqual([{ de: 8, a: 12, gras: true }])
    expect(morceaux('bonjour tous', p).map((m) => [m.texte, !!m.gras])).toEqual([['bonjour ', false], ['tous', true]])
  })

  it('le même geste sur un passage tout gras ôte le gras', () => {
    const p = basculer([{ de: 0, a: 5, gras: true }], 10, 1, 4, 'gras')
    expect(p).toEqual([{ de: 0, a: 1, gras: true }, { de: 4, a: 5, gras: true }])
    expect(basculer([{ de: 0, a: 5, gras: true }], 10, 0, 5, 'gras')).toEqual([])
  })

  it('sur une sélection à moitié grasse, le geste pose le gras partout', () => {
    expect(basculer([{ de: 0, a: 2, gras: true }], 6, 0, 4, 'gras')).toEqual([{ de: 0, a: 4, gras: true }])
  })

  it('les passages qui se touchent et disent la même chose se soudent', () => {
    expect(normaliser([{ de: 0, a: 2, italique: true }, { de: 2, a: 5, italique: true }], 8)).toEqual([{ de: 0, a: 5, italique: true }])
  })

  it('ce qui sort du texte est ignoré', () => {
    expect(normaliser([{ de: 3, a: 40, barre: true }, { de: 9, a: 3, gras: true }], 5)).toEqual([{ de: 3, a: 5, barre: true }])
  })

  it('une couleur de texte remplace un surlignage, et inversement', () => {
    const a = poser([], 6, 0, 3, { surligne: 'vert' })
    expect(poser(a, 6, 0, 3, { couleur: 'rouge' })).toEqual([{ de: 0, a: 3, couleur: 'rouge' }])
    expect(poser(a, 6, 0, 3, { surligne: undefined })).toEqual([])
  })

  it('les marques communes d’une sélection', () => {
    const p = [{ de: 0, a: 4, gras: true, lien: 'https://a.fr' }, { de: 4, a: 6, gras: true }] as const
    expect(marquesCommunes(p, 8, 0, 6)).toEqual({ gras: true })
    expect(marquesCommunes(p, 8, 0, 4)).toEqual({ gras: true, lien: 'https://a.fr' })
    expect(marquesCommunes(p, 8, 4, 8)).toEqual({})
  })

  it('une adresse écrite dans le texte devient un lien', () => {
    const texte = 'voir https://exemple.fr/page, merci'
    const p = detecterLiens(texte, [])
    expect(p).toEqual([{ de: 5, a: 28, lien: 'https://exemple.fr/page' }])
  })

  it('une cellule qui n’est qu’une adresse reste du texte simple', () => {
    expect(richeDe('https://exemple.fr', [])).toBeUndefined()
    expect(richeDe('abc', [])).toBeUndefined()
  })

  it('les passages d’une cellule ne valent que pour le texte sur lequel ils ont été posés', () => {
    const riche = richeDe('bonjour', [{ de: 0, a: 3, gras: true }])
    expect(passagesDe({ riche }, 'bonjour')).toEqual([{ de: 0, a: 3, gras: true }])
    expect(passagesDe({ riche }, 'bonsoir')).toEqual([])
    expect(passagesDe(null, 'x')).toEqual([])
  })

  it('une formule ou un nombre ne portent pas de texte riche', () => {
    expect(peutEtreRiche(null, 'bonjour')).toBe(true)
    expect(peutEtreRiche({ type: 'texte' }, 'bonjour')).toBe(true)
    expect(peutEtreRiche({ type: 'nombre' }, '12')).toBe(false)
    expect(peutEtreRiche(null, '=A1+2')).toBe(false)
  })

  it('aller et retour caractère par caractère', () => {
    const p = [{ de: 1, a: 3, gras: true as const }]
    expect(enPassages(parCaractere(p, 5))).toEqual(p)
  })
})
