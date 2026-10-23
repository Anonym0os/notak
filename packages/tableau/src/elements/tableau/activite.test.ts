import { beforeEach, describe, expect, it } from 'vitest'
import { nouvelleNote } from '../../coeur/tableau'
import { aDuNouveau, empreinteDe, marquerVu, oublierLesVus } from './activite'

const tableau = (...textes: string[]) => ({ titre: 'T', elements: textes.map((x) => nouvelleNote(0, 0, x)) })

describe('la pastille d’activité', () => {
  beforeEach(oublierLesVus)

  it('un tableau jamais regardé ne dit rien', () => {
    expect(aDuNouveau('A', tableau('a'))).toBe(false)
  })
  it('s’allume quand le contenu change après la dernière vue, s’éteint à la vue suivante', () => {
    const avant = tableau('a')
    marquerVu('A', avant)
    expect(aDuNouveau('A', avant)).toBe(false)
    const apres = { ...avant, elements: [...avant.elements, nouvelleNote(1, 1, 'b')] }
    expect(aDuNouveau('A', apres)).toBe(true)
    marquerVu('A', apres)
    expect(aDuNouveau('A', apres)).toBe(false)
  })
  it('un tableau pas encore chargé (sans élément) ne s’allume pas', () => {
    marquerVu('A', tableau('a'))
    expect(aDuNouveau('A', { titre: 'T', elements: [] })).toBe(false)
    expect(aDuNouveau('A', undefined)).toBe(false)
  })
  it('l’empreinte suit le titre et le contenu', () => {
    const t = tableau('a')
    expect(empreinteDe(t)).toBe(empreinteDe({ ...t, elements: [...t.elements] }))
    expect(empreinteDe(t)).not.toBe(empreinteDe({ ...t, titre: 'Autre' }))
  })
})
