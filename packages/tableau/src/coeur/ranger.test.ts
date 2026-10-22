import { describe, expect, test } from 'vitest'
import {
  type Element,
  type Operation,
  type Tableau,
  appliquer,
  avecDependants,
  inverse,
  memePlace,
  nouvelleColonne,
  nouvelleNote,
  placeDe,
} from './tableau'

describe('ranger', () => {
  const colonne = nouvelleColonne(0, 0)
  const note = nouvelleNote(12, 7, 'a')
  const libre: Tableau = { titre: '', elements: [colonne, note] }

  test('range un élément dans une colonne, puis le défait', () => {
    const op: Operation = {
      type: 'ranger',
      id: note.id,
      de: placeDe(note),
      vers: { parent: colonne.id, ordre: 'V', x: 12, y: 7 },
    }
    const rangee = appliquer(libre, op)
    const e = rangee.elements.find((x) => x.id === note.id)!
    expect(e.parent).toBe(colonne.id)
    expect(e.ordre).toBe('V')
    expect(appliquer(rangee, inverse(op))).toEqual(libre)
    expect('parent' in appliquer(rangee, inverse(op)).elements[1]!).toBe(false)
  })

  test('sortir d’une colonne retire le parent et l’ordre', () => {
    const dedans: Tableau = { titre: '', elements: [colonne, { ...note, parent: colonne.id, ordre: 'V' }] }
    const op: Operation = { type: 'ranger', id: note.id, de: placeDe(dedans.elements[1]!), vers: { x: 50, y: 60 } }
    const dehors = appliquer(dedans, op).elements[1]!
    expect(dehors).toEqual({ ...note, x: 50, y: 60 })
    expect('parent' in dehors || 'ordre' in dehors).toBe(false)
    expect(appliquer(appliquer(dedans, op), inverse(op))).toEqual(dedans)
  })

  test('changer d’ordre dans la même colonne', () => {
    const t: Tableau = { titre: '', elements: [colonne, { ...note, parent: colonne.id, ordre: 'V' }] }
    const op: Operation = { type: 'ranger', id: note.id, de: placeDe(t.elements[1]!), vers: { parent: colonne.id, ordre: 'F', x: 12, y: 7 } }
    expect(appliquer(t, op).elements[1]!.ordre).toBe('F')
    expect(appliquer(appliquer(t, op), inverse(op))).toEqual(t)
  })

  test('l’opération n’altère pas le tableau d’origine', () => {
    const copie = structuredClone(libre)
    appliquer(libre, { type: 'ranger', id: note.id, de: placeDe(note), vers: { parent: 'X', ordre: 'V', x: 0, y: 0 } })
    expect(libre).toEqual(copie)
  })

  test('une place se compare champ à champ', () => {
    expect(memePlace({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true)
    expect(memePlace({ x: 1, y: 2 }, { parent: 'C', ordre: 'V', x: 1, y: 2 })).toBe(false)
    expect(memePlace({ parent: 'C', ordre: 'V', x: 1, y: 2 }, { parent: 'C', ordre: 'W', x: 1, y: 2 })).toBe(false)
  })
})

describe('avecDependants', () => {
  const colonne = nouvelleColonne(0, 0)
  const a: Element = { ...nouvelleNote(0, 0, 'a'), parent: colonne.id, ordre: 'F' }
  const b: Element = { ...nouvelleNote(0, 0, 'b'), parent: colonne.id, ordre: 'V' }
  const libre = nouvelleNote(90, 90)
  const t: Tableau = { titre: '', elements: [colonne, a, b, libre] }
  const contenu = (e: Element, tab: Tableau) => (e.contenu.type === 'colonne' ? tab.elements.filter((x) => x.parent === e.id) : [])

  test('supprimer une colonne emporte son contenu', () => {
    expect(avecDependants([colonne], t, contenu).map((e) => e.id).sort()).toEqual([colonne.id, a.id, b.id].sort())
  })

  test('sans doublon quand le contenu est déjà choisi', () => {
    const tous = avecDependants([a, colonne, libre], t, contenu)
    expect(tous).toHaveLength(4)
    expect(new Set(tous.map((e) => e.id)).size).toBe(4)
  })

  test('une note seule n’emporte rien', () => {
    expect(avecDependants([libre], t, contenu)).toEqual([libre])
  })

  test('la suppression et son inverse rendent le tableau', () => {
    const ops: Operation[] = avecDependants([colonne], t, contenu).map((element) => ({ type: 'supprimer', element }))
    const apres = ops.reduce(appliquer, t)
    expect(apres.elements).toEqual([libre])
    const retour = [...ops].reverse().reduce((acc, op) => appliquer(acc, inverse(op)), apres)
    expect(retour.elements.map((e) => e.id).sort()).toEqual(t.elements.map((e) => e.id).sort())
  })
})
