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

describe('les tableaux d’une copie reçue', () => {
  it('une marque par tableau, qui se lit, se retire et ne touche pas aux autres', () => {
    const i = creerIndexEspace(new Y.Doc())
    expect([i.recu('a'), i.recu('b')]).toEqual([false, false])
    i.noterRecus(['a', 'b'])
    expect([i.recu('a'), i.recu('b'), i.recu('c')]).toEqual([true, true, false])
    i.retirerRecu('a')
    expect([i.recu('a'), i.recu('b')]).toEqual([false, true])
    // Retirer ce qui n'y est pas ne fait rien.
    i.retirerRecu('absent')
    expect(i.recu('b')).toBe(true)
  })

  it('la marque n’est ni un tableau listé ni l’accueil, et ne change pas la copie de l’espace', () => {
    const i = creerIndexEspace(new Y.Doc())
    const avant = i.lister().map((e) => e.id)
    i.noterRecus([i.racine(), 'x'])
    expect(i.lister().map((e) => e.id)).toEqual(avant)
    expect(i.derniereCopie()).toBeUndefined()
    i.noterCopie(5)
    expect(i.recu('x')).toBe(true)
  })

  it('marquer deux fois n’écrit qu’une fois : rien à synchroniser de plus', () => {
    const doc = new Y.Doc()
    const i = creerIndexEspace(doc)
    i.noterRecus(['a'])
    let mises = 0
    doc.on('update', () => mises++)
    i.noterRecus(['a'])
    i.noterRecus([])
    expect(mises).toBe(0)
  })

  it('deux appareils qui marquent chacun leurs tableaux les retrouvent tous, et le retrait de l’un gagne', () => {
    const { a, b, echanger } = deux(1000, 2000, [1, 2])
    a.noterRecus(['x'])
    b.noterRecus(['y'])
    echanger()
    expect([a.recu('x'), a.recu('y'), b.recu('x'), b.recu('y')]).toEqual([true, true, true, true])
    a.retirerRecu('x')
    echanger()
    expect([a.recu('x'), b.recu('x'), b.recu('y')]).toEqual([false, false, true])
  })

  it('une marque posée en même temps qu’un retrait reste : dans le doute, le contenu attend', () => {
    for (const clients of [[1, 2], [2, 1]] as [number, number][]) {
      const { a, b, echanger } = deux(1000, 2000, clients)
      a.noterRecus(['x'])
      echanger()
      a.retirerRecu('x')
      b.retirerRecu('x')
      b.noterRecus(['x'])
      echanger()
      expect([a.recu('x'), b.recu('x')]).toEqual([true, true])
    }
  })

  it('on est prévenu des marques, et d’elles seules', () => {
    const i = creerIndexEspace(new Y.Doc())
    let n = 0
    const arreter = i.ecouterRecus(() => n++)
    i.noterCopie(1)
    i.declarer('z', 'Z')
    expect(n).toBe(0)
    i.noterRecus(['a'])
    expect(n).toBe(1)
    i.retirerRecu('a')
    expect(n).toBe(2)
    arreter()
    i.noterRecus(['b'])
    expect(n).toBe(2)
  })

  it('une marque qui arrive d’un autre appareil prévient aussi', () => {
    const { a, b, echanger } = deux(1000, 2000, [1, 2])
    let n = 0
    b.ecouterRecus(() => n++)
    a.noterRecus(['x'])
    echanger()
    expect(n).toBe(1)
  })
})
