import { describe, expect, it } from 'vitest'
import type { Id } from '../../../coeur/tableau'
import { disposer } from '../disposition'
import { REPERE, repereDeDepot } from './depot'
import { ajouterEnfant, lire, nouvelArbre } from './sujets'

// Central ; P0 (A, B, C) et P1 à droite ; P2 à gauche (ou ce que la carte décide) ; chaque boîte fait 80 × 24.
let a = nouvelArbre('C')
const c = lire(a).central
const ids: Record<string, Id> = {}
for (const nom of ['P0', 'P1', 'P2']) [a, ids[nom]!] = ajouterEnfant(a, c, nom)
for (const nom of ['A', 'B', 'C']) [a, ids[nom]!] = ajouterEnfant(a, ids.P0!, nom)
const l = lire(a)
const d = disposer(l, () => ({ l: 80, h: 24 }))
const boite = (id: Id) => d.boites.get(id)!
const aucun = new Set<Id>()

describe('le repère de dépôt', () => {
  it('fait 50 × 18 px', () => {
    const r = repereDeDepot(l, d, { type: 'enfant', parent: ids.P0! }, aucun)!
    expect(r.boite.l).toBe(REPERE.l)
    expect(r.boite.h).toBe(REPERE.h)
    expect(REPERE.rayon).toBe(4)
  })

  it('un sujet qui flotte n’a pas de repère', () => {
    expect(repereDeDepot(l, d, { type: 'libre' }, aucun)).toBeNull()
  })

  it('en dernier enfant : sous le dernier frère, dans la même colonne', () => {
    const r = repereDeDepot(l, d, { type: 'enfant', parent: ids.P0! }, aucun)!
    const dernier = boite(ids.C!)
    expect(r.parent).toBe(ids.P0)
    expect(r.boite.x).toBe(dernier.x)
    expect(r.boite.y).toBeGreaterThan(dernier.y + dernier.h)
  })

  it('entre deux frères : au milieu de l’intervalle qui les sépare', () => {
    const r = repereDeDepot(l, d, { type: 'inserer', parent: ids.P0!, index: 1 }, aucun)!
    const [avant, apres] = [boite(ids.A!), boite(ids.B!)]
    expect(r.boite.y + r.boite.h / 2).toBeCloseTo((avant.y + avant.h + apres.y) / 2)
    expect(r.boite.x).toBe(avant.x)
  })

  it('devant le premier frère : au-dessus de lui ; il garde son côté', () => {
    const r = repereDeDepot(l, d, { type: 'inserer', parent: ids.P0!, index: 0 }, aucun)!
    expect(r.boite.y + r.boite.h).toBeLessThanOrEqual(boite(ids.A!).y)
    expect(r.cote).toBe('droite')
  })

  it('sous un sujet sans enfant : un écart à droite de lui, à sa hauteur', () => {
    const r = repereDeDepot(l, d, { type: 'enfant', parent: ids.P1! }, aucun)!
    const p = boite(ids.P1!)
    expect(r.boite.x).toBeGreaterThan(p.x + p.l)
    expect(r.boite.y + r.boite.h / 2).toBeCloseTo(p.y + p.h / 2)
  })

  it('les sujets qu’on glisse ne comptent pas parmi les frères', () => {
    // A glissé : le repère « en dernier » vient sous C comme avant, mais « en tête » vient devant B.
    const sans = new Set([ids.A!])
    const r = repereDeDepot(l, d, { type: 'inserer', parent: ids.P0!, index: 0 }, sans)!
    expect(r.boite.y + r.boite.h).toBeLessThanOrEqual(boite(ids.B!).y)
  })

  it('un sujet à gauche : le repère se met à gauche, bord droit contre la colonne des frères', () => {
    const gauche = d.liens.find((x) => x.cote === 'gauche')!
    expect(gauche).toBeDefined()
    const r = repereDeDepot(l, d, { type: 'enfant', parent: gauche.vers }, aucun)!
    expect(r.cote).toBe('gauche')
    expect(r.boite.x + r.boite.l).toBeLessThanOrEqual(boite(gauche.vers).x)
  })
})
