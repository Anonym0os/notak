import { describe, expect, it } from 'vitest'
import { creerMagasin, sansCorbeille } from './magasin'
import { type Element, type Tableau, aLaCorbeille, appliquer, auDernierPlan, dUnCran, inverse, nonTriesDe, nouvelleColonne, nouvelleNote, surLeTableau } from './tableau'

const ids = (t: Tableau) => t.elements.map((e) => e.id)

describe('corbeille', () => {
  const colonne = nouvelleColonne(0, 0)
  const dedans: Element = { ...nouvelleNote(0, 0), parent: colonne.id, ordre: 'V' }
  const note = nouvelleNote(40, 0)
  const t: Tableau = { titre: '', elements: [colonne, dedans, note] }
  const jetee = appliquer(t, { type: 'ranger', id: colonne.id, de: { x: 0, y: 0 }, vers: { x: 0, y: 0, corbeille: 5 } })

  it('cache ce qui est à la corbeille, avec le contenu des colonnes jetées', () => {
    expect(surLeTableau(jetee).map((e) => e.id)).toEqual([note.id])
    expect(aLaCorbeille(jetee).map((e) => e.id)).toEqual([colonne.id])
  })

  it('se remet d’un pas, et l’annulation le rejette', () => {
    const op = { type: 'ranger' as const, id: colonne.id, de: { x: 0, y: 0, corbeille: 5 }, vers: { x: 0, y: 0 } }
    const remise = appliquer(jetee, op)
    expect(surLeTableau(remise)).toHaveLength(3)
    expect(aLaCorbeille(appliquer(remise, inverse(op)))).toHaveLength(1)
  })

  it('la vue sans corbeille garde la corbeille quand on réordonne', () => {
    const m = creerMagasin(jetee)
    const vue = sansCorbeille(m)
    expect(vue.lire()).toBe(vue.lire())
    vue.remplacer(auDernierPlan(vue.lire(), [note.id]))
    expect(ids(m.lire()).sort()).toEqual(ids(t).sort())
  })
})

describe('plans et verrou', () => {
  const [a, b, c] = [nouvelleNote(0, 0), nouvelleNote(0, 0), nouvelleNote(0, 0)]
  const t: Tableau = { titre: '', elements: [a, b, c] }

  it('monte d’un cran au-dessus de ce qui touche, pas plus', () => {
    expect(ids(dUnCran(t, [a.id], new Set([b.id]), 'haut'))).toEqual([b.id, a.id, c.id])
    expect(ids(dUnCran(t, [c.id], new Set([b.id]), 'bas'))).toEqual([a.id, c.id, b.id])
    expect(dUnCran(t, [a.id], new Set(), 'haut')).toBe(t)
  })

  it('verrouille et libère, l’inverse rend l’état d’avant', () => {
    const op = { type: 'verrouiller' as const, id: a.id, de: false, vers: true }
    const v = appliquer(t, op)
    expect(v.elements[0]!.verrou).toBe(true)
    expect(appliquer(v, inverse(op)).elements[0]).toEqual(a)
  })
})

describe('non triés', () => {
  const a = nouvelleNote(0, 0)
  const b = nouvelleNote(30, 0)
  const t: Tableau = { titre: '', elements: [a, b] }
  const mis = appliquer(appliquer(t, { type: 'ranger', id: b.id, de: { x: 30, y: 0 }, vers: { x: 30, y: 0, nonTrie: 2 } }), {
    type: 'ranger',
    id: a.id,
    de: { x: 0, y: 0 },
    vers: { x: 0, y: 0, nonTrie: 1 },
  })

  it('sortent de la toile et se lisent du plus ancien au plus récent', () => {
    expect(surLeTableau(mis)).toEqual([])
    expect(nonTriesDe(mis).map((e) => e.id)).toEqual([a.id, b.id])
  })

  it('reviennent sur la toile d’un pas, et ne restent pas non triés une fois à la corbeille', () => {
    const pose = appliquer(mis, { type: 'ranger', id: a.id, de: { x: 0, y: 0, nonTrie: 1 }, vers: { x: 12, y: 4 } })
    expect(surLeTableau(pose).map((e) => [e.id, e.x, e.y])).toEqual([[a.id, 12, 4]])
    const jete = appliquer(mis, { type: 'ranger', id: b.id, de: { x: 30, y: 0, nonTrie: 2 }, vers: { x: 30, y: 0, corbeille: 3 } })
    expect(nonTriesDe(jete).map((e) => e.id)).toEqual([a.id])
  })
})
