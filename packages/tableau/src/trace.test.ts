import { afterEach, describe, expect, it } from 'vitest'
import { definirLangue } from './langue'
import { ageRelatif, lignesDeTrace } from './trace'

afterEach(() => definirLangue('fr'))

const moi = { id: 'm', nom: 'Samy' }
const lea = { id: 'l', nom: 'Léa' }
const MIN = 60_000
const maintenant = Date.UTC(2026, 9, 23, 12)

describe('âge relatif', () => {
  it('passe des secondes aux minutes, heures et jours', () => {
    definirLangue('fr')
    expect(ageRelatif(maintenant - 10_000, maintenant)).toBe('il y a quelques secondes')
    expect(ageRelatif(maintenant - 3 * MIN, maintenant)).toBe('il y a 3 min')
    expect(ageRelatif(maintenant - 120 * MIN, maintenant)).toBe('il y a 2 h')
    expect(ageRelatif(maintenant - 3 * 24 * 60 * MIN, maintenant)).toBe('il y a 3 j')
  })
})

describe('lignes d’histoire', () => {
  it('ne dit rien sans trace', () => {
    expect(lignesDeTrace(undefined, 'm', maintenant)).toEqual([])
    expect(lignesDeTrace({}, 'm', maintenant)).toEqual([])
  })

  it('dit « vous » pour soi et le prénom pour un autre', () => {
    const l = lignesDeTrace({ par: moi, cree: maintenant - 2 * 60 * MIN }, 'm', maintenant)
    expect(l.map((x) => x.texte)).toEqual(['Créé par vous il y a 2 h'])
    expect(l[0]!.auteur).toBe(moi)
    expect(lignesDeTrace({ par: lea, cree: maintenant - 2 * 60 * MIN }, 'm', maintenant)[0]!.texte).toBe('Créé par Léa il y a 2 h')
  })

  it('fusionne quand la même personne modifie dans les cinq minutes', () => {
    const l = lignesDeTrace({ par: moi, cree: maintenant - 90 * MIN, modifiePar: moi, modifie: maintenant - 88 * MIN }, 'm', maintenant)
    expect(l.map((x) => x.texte)).toEqual(['Créé et modifié par vous il y a 1 h'])
  })

  it('garde deux lignes quand c’est une autre personne ou bien plus tard', () => {
    const autre = lignesDeTrace({ par: moi, cree: maintenant - 3 * 60 * MIN, modifiePar: lea, modifie: maintenant - 2 * MIN }, 'm', maintenant)
    expect(autre.map((x) => x.texte)).toEqual(['Créé par vous il y a 3 h', 'Modifié par Léa il y a 2 min'])
    const tard = lignesDeTrace({ par: moi, cree: maintenant - 180 * MIN, modifiePar: moi, modifie: maintenant - 5 * MIN }, 'm', maintenant)
    expect(tard).toHaveLength(2)
  })
})
