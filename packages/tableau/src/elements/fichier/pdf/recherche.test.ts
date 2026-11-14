import { describe, expect, it } from 'vitest'
import { chercherDansPage, normaliser, requeteNormale, tranches } from './recherche'

describe('la normalisation du texte', () => {
  it('sans accent, en minuscule, les espaces resserrées', () => {
    expect(normaliser('Équipe  Été\n').texte).toBe('equipe ete ')
  })
  it('garde, pour chaque caractère, celui d’où il vient', () => {
    const n = normaliser('Aé  b')
    expect(n.texte).toBe('ae b')
    expect(n.origine).toEqual([0, 1, 2, 4])
  })
  it('une requête faite d’espaces ne cherche rien', () => {
    expect(requeteNormale('   ')).toBe('')
    expect(chercherDansPage([{ str: 'un texte' }], '  ')).toEqual([])
  })
})

describe('chercher dans une page', () => {
  it('trouve chaque résultat dans son morceau, sans tenir aux accents ni à la casse', () => {
    const r = chercherDansPage([{ str: 'Une équipe, deux EQUIPES' }], 'equipe')
    expect(r).toEqual([[{ morceau: 0, debut: 4, fin: 10 }], [{ morceau: 0, debut: 17, fin: 23 }]])
  })

  it('un mot coupé entre deux morceaux se surligne dans les deux', () => {
    const r = chercherDansPage([{ str: 'hippo' }, { str: 'potame rare' }], 'hippopotame')
    expect(r).toEqual([
      [
        { morceau: 0, debut: 0, fin: 5 },
        { morceau: 1, debut: 0, fin: 6 },
      ],
    ])
  })

  it('une fin de ligne compte pour une espace', () => {
    const r = chercherDansPage([{ str: 'le renard', hasEOL: true }, { str: 'brun' }], 'renard brun')
    expect(r).toEqual([
      [
        { morceau: 0, debut: 3, fin: 9 },
        { morceau: 1, debut: 0, fin: 4 },
      ],
    ])
  })

  it('les résultats ne se chevauchent pas', () => {
    expect(chercherDansPage([{ str: 'aaaa' }], 'aa')).toHaveLength(2)
  })

  it('un caractère hors du plan de base garde ses deux unités', () => {
    const r = chercherDansPage([{ str: 'a 😀 b' }], '😀')
    expect(r).toEqual([[{ morceau: 0, debut: 2, fin: 4 }]])
  })
})

describe('les tranches d’un morceau surligné', () => {
  it('couvrent tout le morceau, le résultat montré marqué à part', () => {
    expect(
      tranches(12, [
        { morceau: 0, debut: 2, fin: 4 },
        { morceau: 0, debut: 6, fin: 9, courant: true },
      ]),
    ).toEqual([
      { debut: 0, fin: 2, marque: false, courant: false },
      { debut: 2, fin: 4, marque: true, courant: false },
      { debut: 4, fin: 6, marque: false, courant: false },
      { debut: 6, fin: 9, marque: true, courant: true },
      { debut: 9, fin: 12, marque: false, courant: false },
    ])
  })

  it('des bouts qui débordent ou se chevauchent restent dans le morceau', () => {
    expect(
      tranches(5, [
        { morceau: 0, debut: 3, fin: 9 },
        { morceau: 0, debut: 1, fin: 4 },
      ]),
    ).toEqual([
      { debut: 0, fin: 1, marque: false, courant: false },
      { debut: 1, fin: 4, marque: true, courant: false },
      { debut: 4, fin: 5, marque: true, courant: false },
    ])
  })
})
