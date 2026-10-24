import { describe, expect, it } from 'vitest'
import { ancreBloc, ancreSlash, dansTriangle, garderAncre, suivreDefilement } from './menuAncre'

const boite = (left: number, top: number, right = left + 1, bottom = top + 20) => ({ left, top, right, bottom })

describe('NOTION.md § 2.1 : l’ancre du menu « / » est prise une fois', () => {
  it('à gauche la barre oblique (−2 px), en hauteur la ligne du curseur', () => {
    expect(ancreSlash(boite(300, 0, 306, 0), boite(306, 100, 307, 120))).toEqual({ left: 298, right: 299, top: 100, bottom: 120 })
  })

  it('la mesure n’est faite qu’à l’ouverture, pas à chaque frappe', () => {
    let mesures = 0
    const mesurer = () => (mesures++, boite(10 + mesures * 7, 50))
    const a = garderAncre(null, 5, mesurer)
    // Trois frappes de plus : le `/` est toujours le même, le menu ne bouge pas.
    const b = garderAncre(a, 5, mesurer)
    const c = garderAncre(b, 5, mesurer)
    expect(mesures).toBe(1)
    expect(c).toBe(a)
    // Un autre `/` : nouvelle mesure.
    const d = garderAncre(c, 12, mesurer)
    expect(mesures).toBe(2)
    expect(d?.cle).toBe(12)
  })

  it('une mesure qui échoue n’ancre rien et sera retentée', () => {
    expect(garderAncre(null, 5, () => null)).toBeNull()
  })

  it('la page qui défile entraîne l’ancre, la frappe non', () => {
    const b = boite(100, 200)
    expect(suivreDefilement(b, { x: 0, y: 40 }, { x: 0, y: 100 })).toEqual(boite(100, 140))
    expect(suivreDefilement(b, { x: 0, y: 40 }, { x: 0, y: 40 })).toEqual(b)
  })
})

describe('NOTION.md § 3.1 : l’ancre du menu du bloc', () => {
  it('la poignée de 18 × 24 px à 28 px du bord du bloc, centrée sur sa première ligne', () => {
    expect(ancreBloc(647, { top: 100, bottom: 124 })).toEqual({ left: 619, right: 637, top: 100, bottom: 124 })
    expect(ancreBloc(647, { top: 100, bottom: 119 })).toMatchObject({ top: 97.5, bottom: 121.5 })
  })
})

describe('les sous-menus : le triangle de sécurité', () => {
  it('un pointeur qui va vers le sous-menu est dans le triangle ; un autre non', () => {
    const depart = { x: 100, y: 50 }
    const haut = { x: 300, y: 0 }
    const bas = { x: 300, y: 200 }
    expect(dansTriangle({ x: 200, y: 60 }, depart, haut, bas)).toBe(true)
    expect(dansTriangle({ x: 100, y: 190 }, depart, haut, bas)).toBe(false)
  })
})
