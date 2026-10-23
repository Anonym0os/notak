// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import type { Table } from '../../coeur/tableau'
import { definition, tousLesRaccourcis, tousLesRecepteurs } from '../registre'
import type { ContexteToile } from '../types'
import { lireEtat, oublierEtat } from './etat'
import { formatsDe, nouvelleTable } from './grille'
import './index'

const def = definition('table')!

describe('la poignée du coin', () => {
  test('tirée vers la droite d’une colonne, elle en ajoute une et l’élément grandit de 12 UG', () => {
    const e = nouvelleTable(0, 0)
    const r = def.tirerPoignee!(e as never, e.largeur + 12, 0)
    const t = r.contenu as Table
    expect(t.cellules[0]).toHaveLength(4)
    expect(r.largeur).toBe(46)
    expect(t.largeurs!.reduce((a, b) => a + b, 0)).toBe(46)
  })

  test('vers le bas d’une ligne, elle en ajoute une ; vers le haut elle retire ce qui est vide', () => {
    const e = nouvelleTable(0, 0)
    expect((def.tirerPoignee!(e as never, e.largeur, 3).contenu as Table).cellules).toHaveLength(5)
    const r = def.tirerPoignee!(e as never, e.largeur - 12, -3)
    const t = r.contenu as Table
    expect(t.cellules).toHaveLength(3)
    expect(t.cellules[0]).toHaveLength(2)
    // Le total retombe sur une UG entière.
    expect(Number.isInteger(r.largeur)).toBe(true)
  })

  test('jamais une colonne ou une ligne qui a du contenu', () => {
    const e = nouvelleTable(0, 0)
    e.contenu.cellules[3]![2] = 'x'
    const t = def.tirerPoignee!(e as never, e.largeur - 12, -3).contenu as Table
    expect(t.cellules).toHaveLength(4)
    expect(t.cellules[0]).toHaveLength(3)
  })
})

describe('coller une table sur la toile', () => {
  const recepteur = tousLesRecepteurs().find((r) => r.priorite === 45)!
  const donnees = (html: string, texte = '') => ({ getData: (t: string) => (t === 'text/html' ? html : t === 'text/plain' ? texte : '') }) as unknown as DataTransfer

  test('un tableau de tableur devient une table, avec ses lignes et ses colonnes', () => {
    const pas = recepteur.recevoir(donnees('<table><tr><td>a</td><td>1,5</td></tr><tr><td>b</td><td>2</td></tr></table>'), { x: 10.4, y: 20.6 }, {} as ContexteToile) as never[]
    expect(pas).toHaveLength(1)
    const op = (pas as unknown as { type: 'creer'; element: { x: number; y: number; contenu: Table } }[])[0]!
    expect(op.type).toBe('creer')
    expect([op.element.x, op.element.y]).toEqual([10, 21])
    expect(op.element.contenu.cellules).toEqual([['a', '1.5'], ['b', '2']])
    expect(formatsDe(op.element.contenu)[0]![1]?.type).toBe('nombre')
  })

  test('un texte sans tableau n’est pas pour lui', () => {
    expect(recepteur.recevoir(donnees('<p>bonjour</p>', 'bonjour'), { x: 0, y: 0 }, {} as ContexteToile)).toBeNull()
  })
})

describe('Entrée sur une table seule choisie', () => {
  const touche = (key: string, init: KeyboardEventInit = {}) => ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...init }) as KeyboardEvent
  const monde = (selection: string[], lectureSeule = false) => {
    const e = { ...nouvelleTable(0, 0), id: 'TB' }
    const magasin = creerMagasin({ titre: '', elements: [e] })
    return { magasin, selection: new Set(selection), services: { lectureSeule } } as unknown as ContexteToile
  }
  const essayer = (e: KeyboardEvent, c: ContexteToile) => tousLesRaccourcis().some((r) => r(e, c))

  test('elle choisit A1', () => {
    oublierEtat('TB')
    expect(essayer(touche('Enter'), monde(['TB']))).toBe(true)
    expect(lireEtat('TB').plages).toEqual([{ l1: 0, c1: 0, l2: 0, c2: 0 }])
    oublierEtat('TB')
  })

  test('pas en lecture seule, pas avec un autre élément choisi, pas avec une touche de plus', () => {
    expect(essayer(touche('Enter'), monde(['TB'], true))).toBe(false)
    expect(essayer(touche('Enter'), monde(['TB', 'autre']))).toBe(false)
    expect(essayer(touche('Enter', { metaKey: true }), monde(['TB']))).toBe(false)
    expect(lireEtat('TB').plages).toEqual([])
  })
})
