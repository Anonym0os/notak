import { describe, expect, it } from 'vitest'
import { type Acces, accesRecopies, auMoins, role } from './droits.ts'

const acces: Acces[] = [
  { tableau: 't1', utilisateur: 'ana', role: 'proprietaire' },
  { tableau: 't1', utilisateur: 'bob', role: 'edition' },
  { tableau: 't1', utilisateur: 'cleo', role: 'lecture' },
  { tableau: 't2', utilisateur: 'bob', role: 'proprietaire' },
]

describe('role', () => {
  it('rend le rôle de l’utilisateur sur ce tableau', () => {
    expect(role(acces, 'ana', 't1')).toBe('proprietaire')
    expect(role(acces, 'bob', 't1')).toBe('edition')
    expect(role(acces, 'bob', 't2')).toBe('proprietaire')
  })
  it('rend null sans accès', () => {
    expect(role(acces, 'cleo', 't2')).toBeNull()
    expect(role(acces, 'ana', 'inconnu')).toBeNull()
    expect(role([], 'ana', 't1')).toBeNull()
  })
  it('garde le plus haut rôle si la liste en porte plusieurs', () => {
    const double: Acces[] = [
      { tableau: 't', utilisateur: 'u', role: 'lecture' },
      { tableau: 't', utilisateur: 'u', role: 'edition' },
    ]
    expect(role(double, 'u', 't')).toBe('edition')
  })
})

describe('auMoins', () => {
  it('compare dans l’ordre proprietaire > edition > lecture', () => {
    expect(auMoins('proprietaire', 'edition')).toBe(true)
    expect(auMoins('edition', 'edition')).toBe(true)
    expect(auMoins('lecture', 'edition')).toBe(false)
    expect(auMoins(null, 'lecture')).toBe(false)
  })
})

describe('accesRecopies', () => {
  const parent = acces.filter((a) => a.tableau === 't1')
  it('recopie les accès du parent et fait du créateur le propriétaire', () => {
    const copie = accesRecopies(parent, 'fils', 'bob')
    expect(role(copie, 'bob', 'fils')).toBe('proprietaire')
    expect(role(copie, 'ana', 'fils')).toBe('proprietaire')
    expect(role(copie, 'cleo', 'fils')).toBe('lecture')
    expect(copie.every((a) => a.tableau === 'fils')).toBe(true)
    expect(copie.filter((a) => a.utilisateur === 'bob')).toHaveLength(1)
  })
  it('sans parent, le créateur seul', () => {
    expect(accesRecopies([], 'fils', 'bob')).toEqual([{ tableau: 'fils', utilisateur: 'bob', role: 'proprietaire' }])
  })
})
