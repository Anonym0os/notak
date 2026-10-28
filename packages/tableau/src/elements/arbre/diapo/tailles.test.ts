import { describe, expect, it } from 'vitest'
import type { Mesure } from '../modele/dimensions'
import { couper } from './mesure'
import { ajusterPolice, aTaille, hauteurPile, tailleCommune, texteDe } from './tailles'

/** Un caractère vaut 0,5 × la taille. */
const mesure: Mesure = (texte, taille, _p, largeur) => couper(texte, largeur, (s) => [...s].length * 0.5 * taille)

describe('le choix des tailles de texte', () => {
  it('un titre : la plus grande taille en lignes préférées, sinon en lignes maxi, sinon plus petit, sinon tronqué', () => {
    // 10 caractères sur 500 : une ligne jusqu'à 100 px.
    expect(ajusterPolice('abcde fghi', { max: 135, min: 72, lignesPreferees: 1 }, 500, 'p', mesure).taille).toBe(100)
    // Trois lignes à la taille mini : plus petit, en deux lignes, et entier.
    const entier = ajusterPolice('mot '.repeat(8).trim(), { max: 90, min: 63, lignesPreferees: 2, lignesMax: 2 }, 400, 'p', mesure)
    expect(entier).toMatchObject({ taille: 53, tronque: false })
    expect(entier.lignes).toHaveLength(2)
    // Trop long même au plancher (0,6 × la taille mini) : là, tronqué à deux lignes avec « ... ».
    const a = ajusterPolice('mot '.repeat(60).trim(), { max: 90, min: 63, lignesPreferees: 2, lignesMax: 2 }, 400, 'p', mesure)
    expect(a.taille).toBeCloseTo(63 * 0.6)
    expect(a.lignes).toHaveLength(2)
    expect(a.tronque).toBe(true)
    expect(texteDe(a).endsWith('...')).toBe(true)
  })

  it('une liste : une taille commune où tous tiennent en deux lignes, réduite pour tenir en hauteur', () => {
    const textes = ['aaaa bbbb', 'cc', 'dddd eeee ffff']
    const p = { max: 63, min: 41, lignesPreferees: 2, lignesMax: 3 }
    const libre = tailleCommune(textes, p, 300, 'p', mesure)
    expect(libre.taille).toBe(63)
    const pile = (as: readonly { hauteur: number }[]) => hauteurPile(as.map((a) => a.hauteur), 20)
    const serre = tailleCommune(textes, p, 300, 'p', mesure, pile, 300)
    expect(serre.taille).toBeLessThan(63)
    expect(pile(serre.ajustes)).toBeLessThanOrEqual(300)
    expect(serre.defile).toBe(false)
    const impossible = tailleCommune(textes, p, 300, 'p', mesure, pile, 10)
    expect(impossible).toMatchObject({ taille: 41, defile: true })
  })

  it('un texte à taille fixe : plus petit s’il dépasse ses lignes, tronqué seulement au plancher', () => {
    expect(aTaille('un texte court', 20, 100, 'p', mesure, 1)).toMatchObject({ taille: 14, tronque: false })
    const a = aTaille('un texte bien trop long pour une ligne', 20, 100, 'p', mesure, 1)
    expect(a.taille).toBe(12)
    expect(a.lignes).toHaveLength(1)
    expect(a.tronque).toBe(true)
    expect(a.hauteur).toBe(18)
  })

  it('une liste : un élément trop long fait descendre toute la liste sous la taille mini, plutôt qu’être coupé', () => {
    const r = tailleCommune(['cc', 'mot '.repeat(8).trim()], { max: 90, min: 63, lignesPreferees: 1, lignesMax: 2 }, 400, 'p', mesure)
    expect(r.taille).toBe(53)
    expect(r.ajustes.every((x) => !x.tronque)).toBe(true)
  })
})
