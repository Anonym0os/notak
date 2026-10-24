import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { CHAMPS_ARBRE } from './arbresYjs'
import { creerMagasinYjs } from './magasinYjs'
import type { Arbre, Element } from './tableau'

const carte = (): Element<Arbre> => ({ id: 'k', x: 0, y: 0, largeur: 40, contenu: { type: 'arbre', sujets: { c: { ordre: 'V', titre: 'Central' } } } })
const arbre = (m: ReturnType<typeof creerMagasinYjs>) => m.lire().elements.find((e) => e.id === 'k')!.contenu as Arbre

describe('zones et groupes de marqueurs : deux personnes écrivent au même instant', () => {
  it('les zones et les groupes ont leur dictionnaire, comme les sujets', () => {
    expect(CHAMPS_ARBRE).toContain('zones')
    expect(CHAMPS_ARBRE).toContain('groupes')
  })

  it('deux zones posées chacune de son côté restent toutes deux, des deux côtés ; un groupe aussi', () => {
    const [da, db] = [new Y.Doc(), new Y.Doc()]
    const a = creerMagasinYjs(da)
    a.faire([{ type: 'creer', element: carte() }])
    Y.applyUpdate(db, Y.encodeStateAsUpdate(da))
    const b = creerMagasinYjs(db)
    const geste = (m: typeof a, f: (x: Arbre) => Arbre) => m.faire([{ type: 'contenu', id: 'k', avant: arbre(m), apres: f(arbre(m)) }])
    geste(a, (x) => ({ ...x, zones: { za: { x: 0, y: 0, l: 100, h: 100, titre: 'A' } } }))
    geste(b, (x) => ({ ...x, zones: { zb: { x: 200, y: 0, l: 100, h: 100, titre: 'B' } }, groupes: { g: { ordre: 'V', nom: 'Mes icônes', marqueurs: [] } } }))
    const ua = Y.encodeStateAsUpdate(da, Y.encodeStateVector(db))
    const ub = Y.encodeStateAsUpdate(db, Y.encodeStateVector(da))
    Y.applyUpdate(db, ua)
    Y.applyUpdate(da, ub)
    for (const m of [a, b]) {
      expect(Object.keys(arbre(m).zones!).sort()).toEqual(['za', 'zb'])
      expect(arbre(m).groupes!.g!.nom).toBe('Mes icônes')
    }
  })
})
