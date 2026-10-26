import { describe, expect, it } from 'vitest'
import { demanderAMontrer, montrerDemande, prendreDemande } from './montrer'

describe('montrer à l’arrivée', () => {
  it('une seule toile prend la demande, une seule fois', () => {
    demanderAMontrer('a')
    expect(prendreDemande('b')).toBe(false)
    expect(prendreDemande('a')).toBe(true)
    expect(prendreDemande('a')).toBe(false)
  })

  it('une demande que personne ne prend s’éteint', () => {
    demanderAMontrer('a', 0)
    expect(montrerDemande(10_000)).toBe('a')
    expect(montrerDemande(20_000)).toBeNull()
    demanderAMontrer(null)
  })
})
