import { describe, expect, it } from 'vitest'
import type { Id } from '../../../coeur/tableau'
import { disposer } from '../disposition'
import { ouLacher } from './lacher'
import { ajouterEnfant, lire, nouvelArbre, sousCarte } from './sujets'

// Central ; à droite P0 (enfants A, B) et P1 ; à gauche P2.
let a = nouvelArbre('C')
const c = lire(a).central
const ids: Record<string, Id> = {}
for (const nom of ['P0', 'P1', 'P2']) [a, ids[nom]!] = ajouterEnfant(a, c, nom)
for (const nom of ['A', 'B']) [a, ids[nom]!] = ajouterEnfant(a, ids.P0!, nom)
const l = lire(a)
const d = disposer(l, () => ({ l: 80, h: 24 }))
const milieu = (id: Id) => {
  const b = d.boites.get(id)!
  return { x: b.x + b.l / 2, y: b.y + b.h / 2 }
}

describe('où lâcher un sujet', () => {
  it('sur un sujet : il en devient l’enfant', () => {
    expect(ouLacher(l, d, ids.P2!, milieu(ids.P1!))).toEqual({ type: 'enfant', parent: ids.P1 })
  })

  it('jamais dans sa propre branche', () => {
    expect(ouLacher(l, d, ids.P0!, milieu(ids.A!))).not.toEqual({ type: 'enfant', parent: ids.A })
  })

  it('juste au-dessus d’un frère : il s’insère avant lui', () => {
    const b = d.boites.get(ids.B!)!
    expect(ouLacher(l, d, ids.P2!, { x: b.x + 10, y: b.y - 3 })).toEqual({ type: 'inserer', parent: ids.P0, index: 1 })
  })

  it('loin de tout : il devient libre ; Maj inverse', () => {
    expect(ouLacher(l, d, ids.P2!, { x: 2000, y: 2000 })).toEqual({ type: 'libre' })
    expect(ouLacher(l, d, ids.P2!, { x: 2000, y: 2000 }, true).type).toBe('enfant')
    expect(ouLacher(l, d, ids.P2!, milieu(ids.P1!), true)).toEqual({ type: 'libre' })
  })
})

describe('la branche seule', () => {
  it('fait de la branche une carte, le sujet choisi au centre', () => {
    const sous = lire(sousCarte(a, ids.P0!))
    expect(sous.central).toBe(ids.P0)
    expect(sous.enfants.get(ids.P0!)).toEqual([ids.A, ids.B])
    expect(sous.sujets.size).toBe(3)
  })
})
