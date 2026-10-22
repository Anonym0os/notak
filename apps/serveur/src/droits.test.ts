import { describe, expect, it } from 'vitest'
import { type Acces, auMoins, role, roleHerite, titreAccueil } from './droits.ts'

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

describe('roleHerite', () => {
  // racine ← projet ← detail ; ana partage la racine à cleo en lecture, bob crée « detail ».
  const tous: Acces[] = [
    { tableau: 'racine', utilisateur: 'ana', role: 'proprietaire' },
    { tableau: 'racine', utilisateur: 'cleo', role: 'lecture' },
    { tableau: 'projet', utilisateur: 'cleo', role: 'edition' },
    { tableau: 'detail', utilisateur: 'bob', role: 'proprietaire' },
  ]
  const parents: Record<string, string> = { projet: 'racine', detail: 'projet' }
  const accesDe = (t: string) => tous.filter((a) => a.tableau === t)
  const parentDe = (t: string) => parents[t] ?? null

  it('le droit sur un ancêtre vaut pour tous ses descendants', () => {
    expect(roleHerite(accesDe, parentDe, 'ana', 'detail')).toBe('proprietaire')
    expect(roleHerite(accesDe, parentDe, 'bob', 'detail')).toBe('proprietaire')
    expect(roleHerite(accesDe, parentDe, 'bob', 'projet')).toBeNull()
  })
  it('le meilleur rôle de la chaîne l’emporte', () => {
    expect(roleHerite(accesDe, parentDe, 'cleo', 'racine')).toBe('lecture')
    expect(roleHerite(accesDe, parentDe, 'cleo', 'detail')).toBe('edition')
  })
  it('une boucle dans les parents ne tourne pas sans fin', () => {
    const boucle = (t: string) => (t === 'a' ? 'b' : 'a')
    expect(roleHerite(() => [], boucle, 'ana', 'a')).toBeNull()
  })
})

describe('titreAccueil', () => {
  it('élide devant une voyelle', () => {
    expect(titreAccueil('Alice')).toBe('Accueil d’Alice')
    expect(titreAccueil('Bruno')).toBe('Accueil de Bruno')
    expect(titreAccueil('  ')).toBe('Accueil')
  })
})
