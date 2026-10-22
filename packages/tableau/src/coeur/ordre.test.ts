import { describe, expect, test } from 'vitest'
import { point } from './geometrie'
import { cleEntre, clesEntre, comparerOrdre, indexInsertion, pasDeDepot, trierLecture } from './ordre'
import { type Element, type Tableau, appliquer, nouvelleNote } from './tableau'

const croissant = (cles: string[]) => cles.every((c, i) => i === 0 || cles[i - 1]! < c)

describe('cleEntre', () => {
  test('sans voisin, rend une clé du milieu', () => {
    expect(cleEntre()).toBe('V')
  })

  test('rend une clé strictement entre ses bornes', () => {
    const paires: [string | undefined, string | undefined][] = [
      [undefined, 'V'],
      ['V', undefined],
      ['A', 'B'],
      ['A', 'A1'],
      ['Az', 'B'],
      ['z', undefined],
      [undefined, '1'],
      ['A0B', 'A0C'],
      ['0V', '1'],
    ]
    for (const [a, b] of paires) {
      const c = cleEntre(a, b)
      if (a !== undefined) expect(c > a).toBe(true)
      if (b !== undefined) expect(c < b).toBe(true)
      expect(c.endsWith('0')).toBe(false)
    }
  })

  test('refuse des bornes à l’envers ou égales', () => {
    expect(() => cleEntre('B', 'A')).toThrow()
    expect(() => cleEntre('A', 'A')).toThrow()
  })

  test('insertions répétées au même endroit : jamais de collision, toujours dans l’ordre', () => {
    let cles = ['V', 'W']
    for (let i = 0; i < 200; i++) cles = [cles[0]!, cleEntre(cles[0], cles[1]), ...cles.slice(1)]
    expect(croissant(cles)).toBe(true)
    expect(new Set(cles).size).toBe(cles.length)
  })

  test('insertions répétées juste avant la borne haute', () => {
    const fin = 'W'
    let precedente = 'V'
    const cles = [precedente]
    for (let i = 0; i < 200; i++) {
      precedente = cleEntre(precedente, fin)
      cles.push(precedente)
    }
    expect(croissant(cles)).toBe(true)
    expect(cles.every((c) => c < fin)).toBe(true)
  })

  test('ajouts répétés en tête et en queue', () => {
    let tete = 'V'
    let queue = 'V'
    const avant: string[] = []
    const apres: string[] = []
    for (let i = 0; i < 200; i++) {
      tete = cleEntre(undefined, tete)
      queue = cleEntre(queue, undefined)
      avant.unshift(tete)
      apres.push(queue)
    }
    expect(croissant([...avant, 'V', ...apres])).toBe(true)
  })

  test('les clés restent courtes quand on insère au hasard', () => {
    let cles: string[] = []
    let graine = 7
    const hasard = (n: number) => {
      graine = (graine * 16807) % 2147483647
      return graine % n
    }
    for (let i = 0; i < 300; i++) {
      const k = hasard(cles.length + 1)
      cles.splice(k, 0, cleEntre(cles[k - 1], cles[k]))
    }
    expect(croissant(cles)).toBe(true)
    expect(Math.max(...cles.map((c) => c.length))).toBeLessThan(40)
  })
})

describe('clesEntre', () => {
  test('rend n clés croissantes entre les bornes', () => {
    for (const n of [0, 1, 2, 5, 33]) {
      const cles = clesEntre('A', 'B', n)
      expect(cles).toHaveLength(n)
      expect(croissant(['A', ...cles, 'B'])).toBe(true)
    }
  })

  test('sans bornes', () => {
    const cles = clesEntre(undefined, undefined, 100)
    expect(croissant(cles)).toBe(true)
    expect(Math.max(...cles.map((c) => c.length))).toBeLessThanOrEqual(3)
  })
})

describe('comparerOrdre', () => {
  test('compare par code, chiffres avant majuscules avant minuscules', () => {
    expect(['b', 'A', '9', 'a', 'B'].sort(comparerOrdre)).toEqual(['9', 'A', 'B', 'a', 'b'])
  })
})

describe('indexInsertion', () => {
  const centres = [10, 30, 50]
  test('le premier élément dont le centre est sous le pointeur', () => {
    expect(indexInsertion(centres, 0)).toBe(0)
    expect(indexInsertion(centres, 9.9)).toBe(0)
    expect(indexInsertion(centres, 10)).toBe(1)
    expect(indexInsertion(centres, 29)).toBe(1)
    expect(indexInsertion(centres, 31)).toBe(2)
  })
  test('sous le dernier centre ou dans une liste vide : à la fin', () => {
    expect(indexInsertion(centres, 50)).toBe(3)
    expect(indexInsertion(centres, 500)).toBe(3)
    expect(indexInsertion([], 12)).toBe(0)
  })
})

describe('trierLecture', () => {
  test('de haut en bas, puis de gauche à droite', () => {
    const items = [point(5, 2), point(1, 9), point(3, 2), point(0, 0)]
    expect(trierLecture(items)).toEqual([point(0, 0), point(3, 2), point(5, 2), point(1, 9)])
    expect(items[0]).toEqual(point(5, 2))
  })
})

describe('pasDeDepot', () => {
  const note = (x: number, y: number, extra: Partial<Element> = {}): Element => ({ ...nouvelleNote(x, y, 'n'), ...extra })
  const place = (e: Element) => ({ x: e.x, y: e.y, ...(e.parent ? { parent: e.parent, ordre: e.ordre } : {}) })
  const tel = (elements: Element[]): Tableau => ({ titre: '', elements })

  test('range les acceptés à l’index, dans leur sens de lecture, entre les éléments restés', () => {
    const a = note(0, 0, { parent: 'C', ordre: 'F' })
    const b = note(0, 0, { parent: 'C', ordre: 'p' })
    const bas = note(50, 40)
    const haut = note(60, 10)
    // Le tableau tel que le glisser l'a laissé : `bas` et `haut` sont libres, portés au-dessus de la colonne.
    const t = tel([a, b, bas, haut])
    const deplaces = [
      { id: bas.id, de: place(bas), lecture: point(50, 40) },
      { id: haut.id, de: place(haut), lecture: point(60, 10) },
    ]
    const pas = pasDeDepot(t, deplaces, { colonne: 'C', index: 1, acceptes: [bas.id, haut.id] })
    const apres = pas.reduce(appliquer, t)
    const dans = apres.elements.filter((e) => e.parent === 'C').sort((x, y) => comparerOrdre(x.ordre, y.ordre))
    expect(dans.map((e) => e.id)).toEqual([a.id, haut.id, bas.id, b.id])
    expect(pas).toHaveLength(2)
  })

  test('les refusés restent sur la toile, et un élément qui n’a pas changé de place ne produit rien', () => {
    const accepte = note(0, 0)
    const refuse = note(20, 20)
    const t = tel([accepte, refuse])
    const deplaces = [
      { id: accepte.id, de: place(accepte), lecture: point(0, 0) },
      { id: refuse.id, de: { x: 20, y: 20 }, lecture: point(20, 20) },
    ]
    const pas = pasDeDepot(t, deplaces, { colonne: 'C', index: 0, acceptes: [accepte.id] })
    expect(pas).toHaveLength(1)
    expect(pas[0]).toMatchObject({ type: 'ranger', id: accepte.id })
  })

  test('sans cible, un élément sorti de sa colonne se pose sur la toile', () => {
    const e = note(40, 40)
    const t = tel([e])
    const pas = pasDeDepot(t, [{ id: e.id, de: { parent: 'C', ordre: 'V', x: 0, y: 0 }, lecture: point(40, 40) }], null)
    expect(pas).toEqual([{ type: 'ranger', id: e.id, de: { parent: 'C', ordre: 'V', x: 0, y: 0 }, vers: { x: 40, y: 40 } }])
  })

  test('l’inverse du pas rend l’état d’origine', () => {
    const rangee = note(0, 0, { parent: 'C', ordre: 'V' })
    const libre = note(70, 70)
    const origine = tel([rangee, libre])
    // Le glisser a sorti `rangee` et déplacé les deux.
    const milieu = tel([
      { ...rangee, parent: undefined, ordre: undefined, x: 5, y: 6 },
      { ...libre, x: 80, y: 81 },
    ])
    const deplaces = [
      { id: rangee.id, de: place(rangee), lecture: point(5, 6) },
      { id: libre.id, de: place(libre), lecture: point(70, 70) },
    ]
    const pas = pasDeDepot(milieu, deplaces, { colonne: 'C', index: 0, acceptes: [rangee.id, libre.id] })
    const fin = pas.reduce(appliquer, milieu)
    expect(fin.elements.every((e) => e.parent === 'C')).toBe(true)
    // L'historique part de l'origine : appliquer le pas à l'origine, puis le défaire, rend l'origine.
    const retour = [...pas].reverse().reduce((acc, op) => appliquer(acc, op.type === 'ranger' ? { ...op, de: op.vers, vers: op.de } : op), pas.reduce(appliquer, origine))
    expect(retour).toEqual(origine)
  })
})
