import { describe, expect, it } from 'vitest'
import type { Id } from '../../../coeur/tableau'
import { disposer } from '../disposition'
import { copierSujets, deplacerSujets, ouLacher } from './lacher'
import { ajouterEnfant, ajouterFlottant, basculerRepli, enfantsDe, lire, nouvelArbre, sousCarte } from './sujets'

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

  it('loin de tout : il devient libre', () => {
    expect(ouLacher(l, d, ids.P2!, { x: 2000, y: 2000 })).toEqual({ type: 'libre' })
  })

  it('Maj détache un sujet attaché, quelle que soit la cible', () => {
    expect(ouLacher(l, d, ids.P2!, milieu(ids.P1!), true)).toEqual({ type: 'libre' })
    expect(ouLacher(l, d, ids.P2!, { x: 2000, y: 2000 }, true)).toEqual({ type: 'libre' })
    const b = d.boites.get(ids.B!)!
    expect(ouLacher(l, d, ids.P2!, { x: b.x + 10, y: b.y - 3 }, true)).toEqual({ type: 'libre' })
  })

  it('un flottant, lui, se rattache d’ordinaire et Maj le garde libre sur un sujet', () => {
    const [af, f] = ajouterFlottant(a, { x: 500, y: 400 }, 'F')
    const lf = lire(af)
    const df = disposer(lf, () => ({ l: 80, h: 24 }))
    const b = df.boites.get(ids.P1!)!
    const sur = { x: b.x + b.l / 2, y: b.y + b.h / 2 }
    expect(ouLacher(lf, df, f, sur)).toEqual({ type: 'enfant', parent: ids.P1 })
    expect(ouLacher(lf, df, f, sur, true)).toEqual({ type: 'libre' })
  })

  it('les sujets glissés avec lui sont aussi interdits : jamais dans leur branche', () => {
    // P0 et P1 se glissent ensemble : lâcher P0 sur A (enfant de P1 ? non, de P0) ne se rattache ni à A ni à P1.
    const r = ouLacher(l, d, ids.P1!, milieu(ids.A!), false, {}, [ids.P0!])
    expect(r).not.toEqual({ type: 'enfant', parent: ids.A })
    const r2 = ouLacher(l, d, ids.P2!, milieu(ids.P1!), false, {}, [ids.P1!])
    expect(r2).not.toEqual({ type: 'enfant', parent: ids.P1 })
  })

  it('l’insertion se compte sans les sujets glissés avec lui', () => {
    // Un principal P3 avec trois enfants X, Y, Z : on glisse X et Y, et on les dépose juste au-dessus de Z.
    let q = a
    let p3: Id, x: Id, z: Id
    ;[q, p3] = ajouterEnfant(q, c, 'P3')
    ;[q, x] = ajouterEnfant(q, p3, 'X')
    const y = ajouterEnfant(q, p3, 'Y')
    q = y[0]
    ;[q, z] = ajouterEnfant(q, p3, 'Z')
    const lq = lire(q)
    const dq = disposer(lq, () => ({ l: 80, h: 24 }))
    const bz = dq.boites.get(z)!
    const dessus = { x: bz.x + 10, y: bz.y - 3 }
    expect(ouLacher(lq, dq, x, dessus)).toEqual({ type: 'inserer', parent: p3, index: 1 })
    expect(ouLacher(lq, dq, x, dessus, false, {}, [y[1]])).toEqual({ type: 'inserer', parent: p3, index: 0 })
  })
})

/** Les titres des enfants de `id`, dans l'ordre. */
const enfants = (arbre: ReturnType<typeof nouvelArbre>, id: Id) => enfantsDe(lire(arbre), id).map((x) => arbre.sujets[x]!.titre)

describe('lâcher des sujets', () => {
  it('rattache un sujet à la fin des enfants d’un sujet', () => {
    expect(enfants(deplacerSujets(a, [ids.P2!], { type: 'enfant', parent: ids.P0! }), ids.P0!)).toEqual(['A', 'B', 'P2'])
  })

  it('l’insère devant le frère que montrait le repère', () => {
    expect(enfants(deplacerSujets(a, [ids.P2!], { type: 'inserer', parent: ids.P0!, index: 1 }), ids.P0!)).toEqual(['A', 'P2', 'B'])
    expect(enfants(deplacerSujets(a, [ids.P2!], { type: 'inserer', parent: ids.P0!, index: 0 }), ids.P0!)).toEqual(['P2', 'A', 'B'])
  })

  it('plusieurs sujets se posent ensemble, dans l’ordre donné, à la même place', () => {
    expect(enfants(deplacerSujets(a, [ids.P1!, ids.P2!], { type: 'inserer', parent: ids.P0!, index: 1 }), ids.P0!)).toEqual(['A', 'P1', 'P2', 'B'])
    expect(enfants(deplacerSujets(a, [ids.P1!, ids.P2!], { type: 'enfant', parent: ids.P0! }), ids.P0!)).toEqual(['A', 'B', 'P1', 'P2'])
  })

  it('des frères glissés ensemble se réordonnent sans se mélanger (l’index compte sans eux)', () => {
    // A et B glissés, déposés après les autres frères de P1 : ils changent de parent en gardant leur ordre.
    const apres = deplacerSujets(a, [ids.A!, ids.B!], { type: 'enfant', parent: ids.P1! })
    expect(enfants(apres, ids.P1!)).toEqual(['A', 'B'])
    expect(enfants(apres, ids.P0!)).toEqual([])
  })

  it('une branche repliée qui reçoit un sujet se déplie', () => {
    const replie = basculerRepli(a, ids.P0!)
    expect(replie.sujets[ids.P0!]!.replie).toBe(true)
    const apres = deplacerSujets(replie, [ids.P2!], { type: 'enfant', parent: ids.P0! })
    expect(apres.sujets[ids.P0!]!.replie).toBeFalsy()
  })

  it('un lâcher libre ne touche pas à la carte', () => {
    expect(deplacerSujets(a, [ids.P2!], { type: 'libre' })).toBe(a)
  })

  it('⌥ copie : les originaux restent, les copies se posent à la place du repère', () => {
    const [apres, copies] = copierSujets(a, [ids.P2!], { type: 'inserer', parent: ids.P0!, index: 1 })
    expect(enfants(apres, ids.P0!)).toEqual(['A', 'P2', 'B'])
    expect(enfants(apres, ids.P0!).length).toBe(3)
    expect(apres.sujets[ids.P2!]).toBeDefined()
    expect(copies).toHaveLength(1)
    expect(copies[0]).not.toBe(ids.P2)
    expect(lire(apres).sujets.get(copies[0]!)?.parent).toBe(ids.P0)
  })

  it('⌥ copie toute la branche', () => {
    const [apres, copies] = copierSujets(a, [ids.P0!], { type: 'enfant', parent: ids.P1! })
    expect(enfants(apres, ids.P1!)).toEqual(['P0'])
    expect(enfants(apres, copies[0]!)).toEqual(['A', 'B'])
    expect(enfants(apres, ids.P0!)).toEqual(['A', 'B'])
  })

  it('⌥ copie hors de toute cible : des flottants à la place montrée', () => {
    const [apres, copies] = copierSujets(a, [ids.P2!], { type: 'libre' }, new Map([[ids.P2!, { x: 300, y: -40 }]]))
    const copie = lire(apres).sujets.get(copies[0]!)!
    expect(copie.genre).toBe('detache')
    expect(copie.position).toEqual({ x: 300, y: -40 })
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
