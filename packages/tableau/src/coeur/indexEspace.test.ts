import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { creerIndexEspace } from './indexEspace'

/** Deux appareils, chacun avec son index, qui finissent par tout s'échanger. */
function deux(tempsA: number, tempsB: number, clients?: [number, number]) {
  const [da, db] = [new Y.Doc(), new Y.Doc()]
  if (clients) [da.clientID, db.clientID] = clients
  const a = creerIndexEspace(da, () => tempsA)
  const b = creerIndexEspace(db, () => tempsB)
  const echanger = () => {
    Y.applyUpdate(db, Y.encodeStateAsUpdate(da))
    Y.applyUpdate(da, Y.encodeStateAsUpdate(db))
  }
  return { a, b, echanger }
}

describe('index de l’espace', () => {
  it('donne un accueil, listé, à un index vide', () => {
    const i = creerIndexEspace(new Y.Doc())
    expect(i.lister().map((e) => e.id)).toEqual([i.racine()])
  })

  it('un accueil vide qui se retire laisse la place à celui du dossier, quel que soit l’ordre interne de Yjs', () => {
    for (const clients of [[1, 2], [2, 1]] as [number, number][]) {
      // B est même plus ancien : il cède quand même, puisqu'il se retire.
      const { a, b, echanger } = deux(2000, 1000, clients)
      const deA = a.racine()
      b.cederAccueil()
      echanger()
      b.garderAccueil()
      expect(b.racine()).toBe(deA)
      expect(a.racine()).toBe(deA)
    }
  })

  it('le dossier n’avait pas d’accueil : celui qui s’était retiré revient', () => {
    const i = creerIndexEspace(new Y.Doc())
    const r = i.racine()
    i.cederAccueil()
    i.garderAccueil()
    expect(i.racine()).toBe(r)
  })

  it('deux accueils qui contiennent chacun quelque chose : tous s’accordent sur le plus ancien', () => {
    for (const clients of [[1, 2], [2, 1]] as [number, number][]) {
      const { a, b, echanger } = deux(5000, 1000, clients)
      const deB = b.racine()
      echanger()
      expect(a.racine()).toBe(deB)
      expect(b.racine()).toBe(deB)
    }
  })

  it('une copie rouverte dans un espace vide devient l’accueil', () => {
    const i = creerIndexEspace(new Y.Doc())
    i.declarer('copie', 'Ma copie')
    i.changerRacine('copie')
    expect(i.racine()).toBe('copie')
  })
})
