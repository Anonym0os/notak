import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { enLectureSeule } from './magasin'
import { type ElementStocke, creerMagasinYjs, plansPour } from './magasinYjs'
import { type Element, type Tableau, auPremierPlan, nouvelleNote } from './tableau'

/** Deux documents qui s'échangent leurs mises à jour, comme le ferait un serveur. */
function relies() {
  const [a, b] = [new Y.Doc(), new Y.Doc()]
  a.on('update', (u: Uint8Array, origine: unknown) => origine !== 'distant' && Y.applyUpdate(b, u, 'distant'))
  b.on('update', (u: Uint8Array, origine: unknown) => origine !== 'distant' && Y.applyUpdate(a, u, 'distant'))
  return { a, b, ma: creerMagasinYjs(a), mb: creerMagasinYjs(b) }
}

const note = (x: number, y = 0): Element => ({ ...nouvelleNote(x, y) })
const ids = (t: Tableau) => t.elements.map((e) => e.id)

describe('magasin Yjs', () => {
  it('les gestes de chacun arrivent chez l’autre', () => {
    const { ma, mb } = relies()
    const [n1, n2] = [note(1), note(2)]
    ma.faire([{ type: 'creer', element: n1 }])
    mb.faire([{ type: 'creer', element: n2 }])
    ma.faire([{ type: 'deplacer', id: n2.id, de: [2, 0], vers: [5, 6] }])
    expect(ma.lire().elements).toEqual(mb.lire().elements)
    expect(mb.lire().elements.find((e) => e.id === n2.id)).toMatchObject({ x: 5, y: 6 })
    expect(ids(mb.lire())).toEqual([n1.id, n2.id])
  })

  it('l’annulation de A ne touche pas ce qu’a fait B', () => {
    const { ma, mb } = relies()
    const [n1, n2, n3] = [note(1), note(2), note(3)]
    ma.faire([{ type: 'creer', element: n1 }])
    mb.faire([{ type: 'creer', element: n2 }])
    ma.faire([{ type: 'creer', element: n3 }])
    expect(ma.annuler()).toBe(true)
    expect(ids(mb.lire())).toEqual([n1.id, n2.id])
    expect(ma.annuler()).toBe(true)
    expect(ids(ma.lire())).toEqual([n2.id])
    // B n'a rien à annuler au-delà de son propre geste, et A n'a plus rien du tout.
    expect(ma.annuler()).toBe(false)
    expect(mb.annuler()).toBe(true)
    expect(ma.lire().elements).toEqual([])
  })

  it('rétablit un geste annulé', () => {
    const { ma, mb } = relies()
    const n = note(1)
    ma.faire([{ type: 'creer', element: n }])
    ma.annuler()
    expect(mb.lire().elements).toEqual([])
    expect(ma.retablir()).toBe(true)
    expect(ids(mb.lire())).toEqual([n.id])
  })

  it('une correction n’est pas un pas : annuler la création l’emporte, rétablir la garde', () => {
    const { ma } = relies()
    const n = note(1)
    ma.faire([{ type: 'creer', element: n }])
    const corrige = { ...n, x: 9 }
    ma.corriger([{ type: 'deplacer', id: n.id, de: [1, 0], vers: [9, 0] }])
    expect(ma.annuler()).toBe(true)
    expect(ma.lire().elements).toEqual([])
    expect(ma.annuler()).toBe(false)
    expect(ma.retablir()).toBe(true)
    expect(ma.lire().elements).toEqual([corrige])
  })

  it('une correction rejoint le pas qui a créé l’élément, même si d’autres l’ont suivi', () => {
    const { ma } = relies()
    const [n, m] = [note(1), note(2)]
    ma.faire([{ type: 'creer', element: n }])
    ma.faire([{ type: 'creer', element: m }])
    ma.corriger([{ type: 'deplacer', id: n.id, de: [1, 0], vers: [9, 0] }])
    ma.annuler()
    expect(ma.lire().elements).toEqual([{ ...n, x: 9 }])
    ma.annuler()
    expect(ma.lire().elements).toEqual([])
    ma.retablir()
    expect(ma.lire().elements).toEqual([{ ...n, x: 9 }])
  })

  it('un glisser inscrit fait un seul pas, qui ramène au début du geste', () => {
    const { ma, mb } = relies()
    const n = note(1, 1)
    ma.faire([{ type: 'creer', element: n }])
    for (let x = 2; x <= 10; x++) ma.appliquerSeulement([{ type: 'deplacer', id: n.id, de: [x - 1, 1], vers: [x, 1] }])
    expect(mb.lire().elements[0]).toMatchObject({ x: 10 })
    ma.inscrire([{ type: 'deplacer', id: n.id, de: [1, 1], vers: [10, 1] }])
    expect(mb.lire().elements[0]).toMatchObject({ x: 10 })
    ma.annuler()
    expect(ma.lire().elements[0]).toMatchObject({ x: 1, y: 1 })
    expect(mb.lire().elements[0]).toMatchObject({ x: 1, y: 1 })
    ma.retablir()
    expect(mb.lire().elements[0]).toMatchObject({ x: 10 })
  })

  it('un geste de groupe s’annule d’un coup', () => {
    const { ma } = relies()
    const [n1, n2] = [note(1), note(2)]
    ma.faire([{ type: 'creer', element: n1 }, { type: 'creer', element: n2 }])
    ma.faire([
      { type: 'deplacer', id: n1.id, de: [1, 0], vers: [4, 0] },
      { type: 'deplacer', id: n2.id, de: [2, 0], vers: [5, 0] },
    ])
    ma.annuler()
    expect(ma.lire().elements.map((e) => e.x)).toEqual([1, 2])
  })

  it('l’ordre d’empilement est le même partout et ce qu’on crée passe dessus', () => {
    const { ma, mb } = relies()
    const [n1, n2, n3] = [note(1), note(2), note(3)]
    ma.faire([{ type: 'creer', element: n1 }])
    mb.faire([{ type: 'creer', element: n2 }])
    ma.faire([{ type: 'creer', element: n3 }])
    expect(ids(ma.lire())).toEqual([n1.id, n2.id, n3.id])
    expect(ids(mb.lire())).toEqual(ids(ma.lire()))
  })

  it('deux créations en même temps se rangent pareil des deux côtés', () => {
    const [a, b] = [new Y.Doc(), new Y.Doc()]
    const [ma, mb] = [creerMagasinYjs(a), creerMagasinYjs(b)]
    const [n1, n2] = [note(1), note(2)]
    ma.faire([{ type: 'creer', element: n1 }])
    mb.faire([{ type: 'creer', element: n2 }])
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
    expect(ids(ma.lire())).toEqual(ids(mb.lire()))
    expect(ma.lire().elements).toHaveLength(2)
  })

  it('le premier plan ne réécrit que ce qui remonte', () => {
    const { a, ma, mb } = relies()
    const [n1, n2, n3] = [note(1), note(2), note(3)]
    ma.faire([{ type: 'creer', element: n1 }, { type: 'creer', element: n2 }, { type: 'creer', element: n3 }])
    const plans = () => Object.fromEntries([...a.getMap<ElementStocke>('elements')].map(([id, s]) => [id, s.plan]))
    const avant = plans()
    ma.remplacer(auPremierPlan(ma.lire(), [n1.id]))
    const apres = plans()
    ma.inscrire([{ type: 'deplacer', id: n1.id, de: [1, 0], vers: [1, 0] }])
    expect(ids(mb.lire())).toEqual([n2.id, n3.id, n1.id])
    expect(apres[n2.id]).toBe(avant[n2.id])
    expect(apres[n3.id]).toBe(avant[n3.id])
    expect(apres[n1.id]! > avant[n3.id]!).toBe(true)
  })

  it('annuler un glisser rend aussi son rang, puis annuler la création retire l’élément', () => {
    const { ma, mb } = relies()
    const [n1, n2] = [note(1), note(2)]
    ma.faire([{ type: 'creer', element: n1 }, { type: 'creer', element: n2 }])
    ma.appliquerSeulement([{ type: 'deplacer', id: n1.id, de: [1, 0], vers: [7, 7] }])
    ma.remplacer(auPremierPlan(ma.lire(), [n1.id]))
    ma.inscrire([{ type: 'deplacer', id: n1.id, de: [1, 0], vers: [7, 7] }])
    expect(ids(mb.lire())).toEqual([n2.id, n1.id])
    expect(ma.annuler()).toBe(true)
    expect(ids(mb.lire())).toEqual([n1.id, n2.id])
    expect(mb.lire().elements[0]).toMatchObject({ x: 1 })
    expect(ma.annuler()).toBe(true)
    expect(mb.lire().elements).toEqual([])
    expect(ma.annuler()).toBe(false)
  })

  it('lire() rend le même objet tant que rien ne change', () => {
    const { ma } = relies()
    const [n1, n2] = [note(1), note(2)]
    ma.faire([{ type: 'creer', element: n1 }, { type: 'creer', element: n2 }])
    const t = ma.lire()
    expect(ma.lire()).toBe(t)
    ma.faire([{ type: 'deplacer', id: n2.id, de: [2, 0], vers: [9, 9] }])
    const u = ma.lire()
    expect(u).not.toBe(t)
    expect(u.elements[0]).toBe(t.elements[0])
    expect(u.elements[1]).not.toBe(t.elements[1])
  })

  it('prévient ceux qui écoutent, pour ce qui vient des autres aussi', () => {
    const { ma, mb } = relies()
    let n = 0
    const fin = mb.ecouter(() => n++)
    ma.faire([{ type: 'creer', element: note(1) }])
    expect(n).toBe(1)
    fin()
    ma.faire([{ type: 'creer', element: note(2) }])
    expect(n).toBe(1)
  })

  it('le titre et la couleur viennent de meta et passent par remplacer', () => {
    const { b, ma, mb } = relies()
    ma.remplacer({ titre: 'Idées', couleur: 'vert', elements: [] })
    expect(mb.lire()).toMatchObject({ titre: 'Idées', couleur: 'vert' })
    b.getMap('meta').set('titre', 'Autre')
    expect(ma.lire().titre).toBe('Autre')
  })

  it('supprimer puis annuler remet l’élément à son rang', () => {
    const { ma, mb } = relies()
    const [n1, n2] = [note(1), note(2)]
    ma.faire([{ type: 'creer', element: n1 }, { type: 'creer', element: n2 }])
    ma.faire([{ type: 'supprimer', element: n1 }])
    expect(ids(mb.lire())).toEqual([n2.id])
    ma.annuler()
    expect(ids(mb.lire())).toEqual([n1.id, n2.id])
  })
})

describe('plansPour', () => {
  const pile = (...ids: string[]) => ids.map((id, i) => ({ id, plan: String.fromCharCode(65 + i) }))
  it('ne bouge pas ce qui garde son ordre', () => {
    const p = plansPour(pile('a', 'b', 'c'), ['b', 'c', 'a'])
    expect([...p.keys()]).toEqual(['a'])
    expect(p.get('a')! > 'C').toBe(true)
  })
  it('place un élément entre ses nouveaux voisins', () => {
    const p = plansPour(pile('a', 'b', 'c'), ['a', 'c', 'b'])
    expect([...p.keys()].length).toBe(1)
  })
  it('donne un plan à un élément nouveau', () => {
    const p = plansPour(pile('a', 'b'), ['a', 'n', 'b'])
    expect(p.get('n')! > 'A' && p.get('n')! < 'B').toBe(true)
  })
  it('ne fait rien quand l’ordre est le même', () => {
    expect(plansPour(pile('a', 'b'), ['a', 'b']).size).toBe(0)
  })
})

describe('enLectureSeule', () => {
  it('lit, mais ne change rien', () => {
    const { ma } = relies()
    const ro = enLectureSeule(ma)
    ro.faire([{ type: 'creer', element: note(1) }])
    expect(ma.lire().elements).toEqual([])
    ma.faire([{ type: 'creer', element: note(1) }])
    expect(ro.lire().elements).toHaveLength(1)
    expect(ro.annuler()).toBe(false)
  })
})
