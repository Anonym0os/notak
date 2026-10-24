import { describe, expect, it } from 'vitest'
import type { Id } from '../../../coeur/tableau'
import { disposer } from '../disposition'
import { ouLacher } from './lacher'
import { ajouterEnfant, ajouterFlottant, lire, nouvelArbre } from './sujets'

// Central ; P0 (A) et P1 à droite ; P2 à gauche ; un flottant F loin de tout.
let a = nouvelArbre('C')
const c = lire(a).central
const ids: Record<string, Id> = {}
for (const nom of ['P0', 'P1', 'P2']) [a, ids[nom]!] = ajouterEnfant(a, c, nom)
;[a, ids.A!] = ajouterEnfant(a, ids.P0!, 'A')
;[a, ids.F!] = ajouterFlottant(a, { x: 500, y: 400 }, 'F')
const l = lire(a)
const d = disposer(l, () => ({ l: 80, h: 24 }))
const milieu = (id: Id) => {
  const b = d.boites.get(id)!
  return { x: b.x + b.l / 2, y: b.y + b.h / 2 }
}

describe('« Chevauchement des sujets »', () => {
  it('sans le réglage, un sujet lâché sur un autre en devient l’enfant', () => {
    expect(ouLacher(l, d, ids.P2!, milieu(ids.P1!), false, {})).toEqual({ type: 'enfant', parent: ids.P1 })
  })

  it('avec le réglage, il reste là où on l’a lâché', () => {
    expect(ouLacher(l, d, ids.P2!, milieu(ids.P1!), false, { chevauchement: true })).toEqual({ type: 'libre' })
  })

  it('l’insertion à côté d’un frère reste possible', () => {
    const b = d.boites.get(ids.P1!)!
    const r = ouLacher(l, d, ids.P2!, { x: b.x + 10, y: b.y - 10 }, false, { chevauchement: true })
    expect(r.type).toBe('inserer')
  })

  it('Maj lui rend le rattachement', () => {
    expect(ouLacher(l, d, ids.P2!, milieu(ids.P1!), true, { chevauchement: true })).toEqual({ type: 'enfant', parent: ids.P1 })
    // Ailleurs, Maj garde son sens d'ordinaire : il rattache au sujet le plus proche.
    expect(ouLacher(l, d, ids.P2!, { x: 2000, y: 2000 }, true, { chevauchement: true }).type).toBe('enfant')
  })
})

describe('« Sujet flottant flexible »', () => {
  it('un flottant lâché sur un sujet s’y rattache d’ordinaire', () => {
    expect(ouLacher(l, d, ids.F!, milieu(ids.P1!), false, {})).toEqual({ type: 'enfant', parent: ids.P1 })
  })

  it('avec le réglage, il ne se connecte à aucun sujet', () => {
    expect(ouLacher(l, d, ids.F!, milieu(ids.P1!), false, { flottantSouple: true })).toEqual({ type: 'libre' })
    const b = d.boites.get(ids.P1!)!
    expect(ouLacher(l, d, ids.F!, { x: b.x + 10, y: b.y - 10 }, false, { flottantSouple: true })).toEqual({ type: 'libre' })
  })

  it('Maj suspend le réglage le temps du geste', () => {
    expect(ouLacher(l, d, ids.F!, milieu(ids.P1!), true, { flottantSouple: true })).toEqual(ouLacher(l, d, ids.F!, milieu(ids.P1!), false, {}))
  })

  it('un sujet attaché, lui, n’est pas concerné', () => {
    expect(ouLacher(l, d, ids.P2!, milieu(ids.P1!), false, { flottantSouple: true })).toEqual({ type: 'enfant', parent: ids.P1 })
  })
})
