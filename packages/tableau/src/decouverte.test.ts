import { describe, expect, it } from 'vitest'
import { BULLES, bulleAMontrer, cleDecouverte, vuesDuCompte } from './decouverte'

const rien = new Set<string>()
const libre = (nombre: number) => ({ nombre, lectureSeule: false })

class FauxStock {
  donnees = new Map<string, string>()
  getItem = (k: string) => this.donnees.get(k) ?? null
  setItem = (k: string, v: string) => void this.donnees.set(k, v)
}

describe('bulles de découverte', () => {
  it('un tableau vide appelle un outil, le premier élément le double-clic, le quatrième l’aide', () => {
    expect(bulleAMontrer(rien, libre(0))?.geste).toBe('outil')
    expect(bulleAMontrer(rien, libre(1))?.geste).toBe('note')
    expect(bulleAMontrer(rien, libre(2))?.geste).toBe('note')
    expect(bulleAMontrer(rien, libre(3))).toBeNull()
    expect(bulleAMontrer(rien, libre(4))?.geste).toBe('aide')
  })

  it('un geste déjà vu ne reparaît pas, et passe à la bulle suivante', () => {
    expect(bulleAMontrer(new Set(['outil']), libre(0))).toBeNull()
    expect(bulleAMontrer(new Set(['note']), libre(1))).toBeNull()
    expect(bulleAMontrer(new Set(['note']), libre(9))?.geste).toBe('aide')
    expect(bulleAMontrer(new Set(BULLES.map((b) => b.geste)), libre(0))).toBeNull()
  })

  it('rien en lecture seule', () => {
    expect(bulleAMontrer(rien, { nombre: 0, lectureSeule: true })).toBeNull()
  })

  it('chaque geste a un texte et une place', () => {
    expect(new Set(BULLES.map((b) => b.geste)).size).toBe(BULLES.length)
    for (const b of BULLES) expect(b.texte.length).toBeGreaterThan(10)
  })
})

describe('ce qu’un compte a déjà vu', () => {
  it('se garde par compte', () => {
    const stock = new FauxStock()
    vuesDuCompte('ana', stock).noter('outil')
    expect([...vuesDuCompte('ana', stock).lire()]).toEqual(['outil'])
    expect(vuesDuCompte('bob', stock).lire().size).toBe(0)
    expect(stock.getItem(cleDecouverte('ana'))).toBe('["outil"]')
  })

  it('cumule les gestes sans doublon', () => {
    const stock = new FauxStock()
    const v = vuesDuCompte('ana', stock)
    v.noter('outil')
    v.noter('note')
    v.noter('outil')
    expect([...v.lire()].sort()).toEqual(['note', 'outil'])
  })

  it('résiste à un stockage illisible ou qui refuse d’écrire', () => {
    const casse = {
      getItem: () => '{pas du json',
      setItem: () => {
        throw new Error('plein')
      },
    }
    const v = vuesDuCompte('ana', casse)
    expect(v.lire().size).toBe(0)
    v.noter('outil')
    expect(v.lire().has('outil')).toBe(true)
  })
})
