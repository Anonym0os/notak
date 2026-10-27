import { describe, expect, it } from 'vitest'
import { nouvelleNote } from './tableau'
import { COULEUR_SURE, lireElement } from './valider'

const avec = (contenu: object) => ({ ...nouvelleNote(0, 0), id: 'e', plan: 'a', contenu: { ...nouvelleNote(0, 0).contenu, ...contenu } })

describe('les couleurs d’un élément reçu', () => {
  it('une couleur se lit telle quelle, et l’élément reste le même objet', () => {
    const brut = avec({ fond: '#ffcc00', barre: '#ABC', couleur: 'jaune' })
    expect(lireElement(brut, 'e')).toBe(brut)
  })

  it('une « couleur » qui chargerait une image (un mouchard) est retirée, à toute profondeur', () => {
    const brut = avec({ barre: 'url(https://espion.exemple/x.gif)', fond: '#fff' })
    const lu = lireElement(brut, 'e')!
    expect(lu.contenu).not.toHaveProperty('barre')
    expect((lu.contenu as { fond?: string }).fond).toBe('#fff')
    // Le document n'est pas réécrit : seule la lecture est corrigée.
    expect(brut.contenu.barre).toBe('url(https://espion.exemple/x.gif)')

    const table = {
      ...brut,
      contenu: { type: 'table', cellules: [['a']], formats: [[{ fond: 'image-set(url(https://espion.exemple/y))', couleur: '#000' }]] },
    }
    const t = lireElement(table, 'e')!.contenu as { formats: { fond?: string; couleur?: string }[][] }
    expect(t.formats[0]![0]).toEqual({ couleur: '#000' })
  })

  it('une couleur requise qui n’en est pas une : l’élément ne se dessine pas', () => {
    expect(lireElement({ ...avec({}), contenu: { type: 'nuancier', couleur: 'url(https://espion.exemple/z)' } }, 'e')).toBeNull()
  })

  it('les mots et les codes, oui ; le reste, non', () => {
    for (const c of ['#fff', '#ffcc00', '#ffcc0080', 'jaune', 'grisChaud', 'entete']) expect(COULEUR_SURE.test(c), c).toBe(true)
    for (const c of ['url(x)', 'var(--x)', 'rgb(0,0,0)', 'red; background: url(x)', '#ff', '', 'a'.repeat(41)]) expect(COULEUR_SURE.test(c), c).toBe(false)
  })
})
