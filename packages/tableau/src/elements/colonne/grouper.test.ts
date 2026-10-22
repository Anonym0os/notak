import { describe, expect, test } from 'vitest'
import { depuisTaille, point } from '../../coeur/geometrie'
import { type Tableau, appliquer, inverse, nouvelleNote } from '../../coeur/tableau'
import { pasDeGroupement } from './grouper'

const item = (x: number, y: number) => ({ element: nouvelleNote(x, y, 'n'), rect: depuisTaille(point(x, y), 34, 8) })

describe('pasDeGroupement', () => {
  const [a, b, c] = [item(50, 30), item(10, 30), item(40, 5)]
  const { colonne, pas } = pasDeGroupement([a, b, c])
  const avant: Tableau = { titre: '', elements: [a.element, b.element, c.element] }
  const apres = pas.reduce(appliquer, avant)

  test('crée la colonne au coin haut-gauche du cadre englobant', () => {
    const col = apres.elements.find((e) => e.id === colonne)!
    expect(col.contenu.type).toBe('colonne')
    expect([col.x, col.y]).toEqual([10, 5])
  })

  test('range de haut en bas, puis de gauche à droite', () => {
    const dans = apres.elements.filter((e) => e.parent === colonne).sort((x, y) => (x.ordre! < y.ordre! ? -1 : 1))
    expect(dans.map((e) => e.id)).toEqual([c.element.id, b.element.id, a.element.id])
  })

  test('tout s’annule d’un coup', () => {
    const retour = [...pas].reverse().reduce((t, op) => appliquer(t, inverse(op)), apres)
    expect(retour).toEqual(avant)
  })
})
