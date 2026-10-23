import { describe, expect, it } from 'vitest'
import { decalageDeCollage, deballer, empaqueter, texteDuPaquet } from './pressePapiers'
import { type Element, type Ligne, type Tableau, nouvelleColonne, nouvelleNote } from './tableau'

const boite = (e: Element) => ({ min: { x: e.x, y: e.y }, max: { x: e.x + e.largeur, y: e.y + 8 } })

describe('presse-papiers', () => {
  const colonne = nouvelleColonne(0, 0)
  const rangee: Element = { ...nouvelleNote(0, 0, 'dedans'), parent: colonne.id, ordre: 'V' }
  const note = nouvelleNote(50, 10, 'seule')
  const ligne: Element = {
    id: 'L',
    x: 0,
    y: 0,
    largeur: 1,
    contenu: { type: 'ligne', depart: { element: colonne.id }, arrivee: { element: note.id }, pointeDepart: 'rien', pointeArrivee: 'fleche', trait: 'plein', epaisseur: 2 },
  }
  const t: Tableau = { titre: '', elements: [colonne, rangee, note, ligne] }
  const rect = (id: string) => {
    const e = t.elements.find((x) => x.id === id)!
    return e.parent ? { min: { x: 1.4, y: 5.6 }, max: { x: 33, y: 12 } } : boite(e)
  }

  it('emporte le contenu des colonnes et les lignes dont les deux bouts partent', () => {
    const p = empaqueter(t, [colonne.id, note.id], rect)!
    expect(p.elements.map((e) => e.id).sort()).toEqual([colonne.id, rangee.id, note.id, 'L'].sort())
    expect(p.cadre).toEqual({ min: { x: 0, y: 0 }, max: { x: 84, y: 18 } })
  })

  it('laisse une ligne dont un bout reste', () => {
    expect(empaqueter(t, [note.id], rect)!.elements.map((e) => e.id)).toEqual([note.id])
  })

  it('pose sur la toile, là où on le voit, ce qu’on tire seul de sa colonne', () => {
    const [e] = empaqueter(t, [rangee.id], rect)!.elements
    expect(e).toMatchObject({ x: 1, y: 6 })
    expect(e!.parent).toBeUndefined()
  })

  it('déballe avec des identifiants neufs, colonnes et lignes suivant', () => {
    const p = empaqueter(t, [colonne.id, note.id], rect)!
    const neufs = deballer(p, { x: 2, y: 2 })
    const ids = new Set(neufs.map((e) => e.id))
    expect([colonne.id, rangee.id, note.id, 'L'].some((id) => ids.has(id))).toBe(false)
    const col = neufs.find((e) => e.contenu.type === 'colonne')!
    expect(neufs.find((e) => e.parent)!.parent).toBe(col.id)
    expect(col).toMatchObject({ x: 2, y: 2 })
    const l = neufs.find((e) => e.contenu.type === 'ligne')!.contenu
    expect(l.type === 'ligne' && 'element' in l.depart && l.depart.element).toBe(col.id)
  })

  it('une ligne collée garde le point précis où elle s’accroche, du côté de l’élément copié', () => {
    const ancree: Element = {
      ...ligne,
      contenu: { ...(ligne.contenu as Ligne), depart: { element: colonne.id, ancre: { x: 1, y: 0.25 } }, arrivee: { element: note.id, ancre: { x: 0, y: 0 } } },
    }
    const t2: Tableau = { titre: '', elements: [colonne, rangee, note, ancree] }
    const p = empaqueter(t2, [colonne.id, note.id], rect)!
    const neufs = deballer(p, { x: 2, y: 2 })
    const l = neufs.find((e) => e.contenu.type === 'ligne')!.contenu as Ligne
    const [col, nt] = [neufs.find((e) => e.contenu.type === 'colonne')!, neufs.find((e) => e.contenu.type === 'note')!]
    expect(l.depart).toEqual({ element: col.id, ancre: { x: 1, y: 0.25 } })
    expect(l.arrivee).toEqual({ element: nt.id, ancre: { x: 0, y: 0 } })
  })

  it('décale de 2 UG par collage en vue, centre sinon', () => {
    const p = empaqueter(t, [note.id], rect)!
    expect(decalageDeCollage(p, true, 3, { x: 0, y: 0 })).toEqual({ x: 6, y: 6 })
    expect(decalageDeCollage(p, false, 1, { x: 100, y: 100 })).toEqual({ x: 33, y: 86 })
  })

  it('donne le texte des notes pour coller ailleurs', () => {
    expect(texteDuPaquet(empaqueter(t, [colonne.id], rect)!)).toBe('Colonne\n\ndedans')
  })
})
