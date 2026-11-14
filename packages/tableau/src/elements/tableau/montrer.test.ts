import { describe, expect, it } from 'vitest'
import { demanderAMontrer, demanderLeFil, ecouterDemandes, filDemande, montrerDemande, prendreDemande, prendreFil } from './montrer'

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

describe('ouvrir un fil à l’arrivée', () => {
  it('montre l’élément, puis donne son fil une seule fois, à lui seul', () => {
    demanderLeFil('note', 'f1')
    expect(montrerDemande()).toBe('note')
    expect(filDemande('autre')).toBeNull()
    expect(prendreFil('autre')).toBeNull()
    expect(filDemande('note')).toBe('f1')
    expect(prendreFil('note')).toBe('f1')
    expect(prendreFil('note')).toBeNull()
    // Le fil de l'élément même (une épingle, le fil accroché) a la clé vide : c'est une demande comme une autre.
    demanderLeFil('epingle', '')
    expect(filDemande('epingle')).toBe('')
    expect(prendreFil('epingle')).toBe('')
    demanderAMontrer(null)
  })

  it('une autre demande de montrer l’annule ; elle s’éteint comme elle ; on l’entend venir', () => {
    let entendues = 0
    const cesser = ecouterDemandes(() => entendues++)
    demanderLeFil('note', 'f1')
    demanderAMontrer('note')
    expect(filDemande('note')).toBeNull()
    demanderLeFil('note', 'f1', 0)
    expect(filDemande('note', 10_000)).toBe('f1')
    expect(filDemande('note', 20_000)).toBeNull()
    cesser()
    expect(entendues).toBeGreaterThanOrEqual(3)
    demanderAMontrer(null)
  })
})
