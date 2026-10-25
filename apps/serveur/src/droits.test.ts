import { describe, expect, it } from 'vitest'
import { type Acces, auMoins, meilleurRole, role, titreAccueil } from './droits.ts'

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

describe('titreAccueil', () => {
  it('élide devant une voyelle', () => {
    expect(titreAccueil('Alice')).toBe('Accueil d’Alice')
    expect(titreAccueil('Bruno')).toBe('Accueil de Bruno')
    expect(titreAccueil('  ')).toBe('Accueil')
  })
})

describe('titreAccueil en anglais', () => {
  it('suit la langue demandée', () => {
    expect(titreAccueil('Alice', 'en')).toBe('Alice’s home')
    expect(titreAccueil(' ', 'en')).toBe('Home')
  })
})

describe('meilleurRole', () => {
  it('garde le plus fort, et ce qui existe face à rien', () => {
    expect(meilleurRole('lecture', 'commentaire')).toBe('commentaire')
    expect(meilleurRole('proprietaire', 'edition')).toBe('proprietaire')
    expect(meilleurRole(null, 'lecture')).toBe('lecture')
    expect(meilleurRole(null, null)).toBeNull()
  })
})
