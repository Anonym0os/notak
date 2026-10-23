// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import type { Table } from '../../coeur/tableau'
import { coller, lireCollage, recopier, versHtml, versTexte } from './pressePapiers'

const table = (): Table => ({
  type: 'table',
  cellules: [['Nom', 'Prix', 'Note'], ['a', '1.5', 'x\ny'], ['b', '2', 'dit "oui"']],
  formats: [[{ gras: true, fond: 'entete' }, { gras: true, fond: 'entete' }, { gras: true, fond: 'entete' }], [null, { type: 'monnaie' }, null], [null, { type: 'monnaie' }, null]],
  largeurs: [10, 12, 12],
})

const tout = { l1: 0, c1: 0, l2: 2, c2: 2 }

describe('copier', () => {
  test('texte : tabulations, guillemets autour des retours à la ligne et des guillemets', () => {
    expect(versTexte(table(), { l1: 0, c1: 0, l2: 0, c2: 1 })).toBe('Nom\tPrix')
    expect(versTexte(table(), { l1: 1, c1: 1, l2: 2, c2: 2 })).toBe('1.5\t"x\ny"\n2\t"dit ""oui"""')
  })
  test('une plage à l’envers ou trop large est rognée', () => {
    expect(versTexte(table(), { l1: 1, c1: 5, l2: 0, c2: 1 })).toBe('Prix\tNote\n1.5\t"x\ny"')
  })
  test('html : une table qui porte nos données', () => {
    const html = versHtml(table(), { l1: 0, c1: 0, l2: 1, c2: 1 })
    expect(html.startsWith('<table data-notak-table="')).toBe(true)
    expect(html).toContain('<td style="background:#d1d3d6;font-weight:bold">Nom</td>')
    expect(html).not.toContain('"cellules"')
  })
})

describe('lire ce qu’on colle', () => {
  test('nos données font l’aller-retour, avec formats', () => {
    const lu = lireCollage(versHtml(table(), tout), '')
    expect(lu.notak).toBe(true)
    expect(lu.cellules).toEqual(table().cellules)
    expect(lu.formats![1]![1]).toEqual({ type: 'monnaie' })
    expect(lu.formats![0]![0]).toEqual({ gras: true, fond: 'entete' })
  })
  test('texte à tabulations avec guillemets', () => {
    const lu = lireCollage(null, 'a\tb\n"x\ny"\t"dit ""oui"""\n')
    expect(lu.cellules).toEqual([['a', 'b'], ['x\ny', 'dit "oui"']])
    expect(lu.formats).toBeUndefined()
  })
  test('texte simple, lignes inégales, fins de ligne Windows', () => {
    expect(lireCollage(null, 'seul').cellules).toEqual([['seul']])
    expect(lireCollage(null, 'a\tb\tc\r\nd').cellules).toEqual([['a', 'b', 'c'], ['d', '', '']])
    expect(lireCollage(null, '').cellules).toEqual([['']])
  })
  test('html de tableur : th comme td, colspan et rowspan dépliés', () => {
    const html = '<meta charset="utf-8"><table><tr><th colspan="2">T</th><td>c</td></tr><tr><td rowspan="2">r</td><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></table>'
    expect(lireCollage(html, '').cellules).toEqual([['T', '', 'c'], ['r', '1', '2'], ['', '3', '4']])
  })
  test('html de tableur : gras et italique repérés', () => {
    const html = '<table><tr><td><b>Gras</b></td><td style="font-style:italic">Ital</td><td>nu</td></tr></table>'
    const lu = lireCollage(html, '')
    expect(lu.formats).toEqual([[{ gras: true }, { italique: true }, null]])
  })
  test('html : espaces ramenés à un, br en retour à la ligne', () => {
    const lu = lireCollage('<table><tr><td>  un \n  deux<br>trois </td></tr></table>', '')
    expect(lu.cellules).toEqual([['un deux\ntrois']])
  })
  test('html sans table : le texte', () => {
    expect(lireCollage('<p>bonjour</p>', 'bonjour').cellules).toEqual([['bonjour']])
  })
  test('html aux données abîmées : retombe sur la table visible', () => {
    const lu = lireCollage('<table data-notak-table="{pas du json"><tr><td>z</td></tr></table>', 'z')
    expect(lu.cellules).toEqual([['z']])
    expect(lu.notak).toBeUndefined()
  })
})

describe('coller', () => {
  test('nos données se posent telles quelles, formats compris', () => {
    const donnees = lireCollage(versHtml(table(), { l1: 1, c1: 1, l2: 1, c2: 1 }), '')
    const t = coller(table(), { l: 2, c: 0 }, donnees)
    expect(t.cellules[2]![0]).toBe('1.5')
    expect(t.formats![2]![0]).toEqual({ type: 'monnaie' })
  })
  test('le texte étranger passe par la déduction de type', () => {
    const t = coller(table(), { l: 1, c: 0 }, { cellules: [['12 %', 'abc'], ['01/02/2006', '3,5']] })
    expect(t.cellules[1]!.slice(0, 2)).toEqual(['0.12', 'abc'])
    expect(t.formats![1]![0]).toEqual({ type: 'pourcent' })
    expect(t.formats![2]![0]).toMatchObject({ type: 'date', date: 'chiffres' })
    expect(t.cellules[2]![0]).toBe('38749')
    // la cellule d’à côté était en monnaie : venu d’ailleurs, le nombre repart de zéro
    expect(t.cellules[2]![1]).toBe('3.5')
    expect(t.formats![2]![1]).toEqual({ type: 'nombre' })
  })
  test('le format collé (gras d’un tableur) sert de base à la déduction', () => {
    const t = coller(table(), { l: 1, c: 0 }, { cellules: [['5']], formats: [[{ gras: true }]] })
    expect(t.formats![1]![0]).toEqual({ gras: true, type: 'nombre' })
  })
  test('la grille s’agrandit si ça dépasse', () => {
    const t = coller(table(), { l: 2, c: 2 }, { cellules: [['a', 'b'], ['c', 'd']] })
    expect(t.cellules).toHaveLength(4)
    expect(t.cellules[0]).toHaveLength(4)
    expect(t.cellules[3]![3]).toBe('d')
    expect(t.largeurs).toHaveLength(4)
    expect(t.formats).toHaveLength(4)
  })
  test('le rappel décale les formules collées', () => {
    const t = coller(table(), { l: 1, c: 0 }, { cellules: [['=A1', 'x']], notak: true }, (f) => f.replace('A1', 'A2'))
    expect(t.cellules[1]![0]).toBe('=A2')
  })
  test('ancre hors de la grille ou rien à coller : rien ne change', () => {
    const t = table()
    expect(coller(t, { l: -1, c: 0 }, { cellules: [['a']] })).toBe(t)
    expect(coller(t, { l: 0, c: 0 }, { cellules: [] })).toBe(t)
  })
})

describe('recopier', () => {
  const t = (cellules: string[][], formats?: Table['formats']): Table => ({ type: 'table', cellules, formats })
  test('une suite de nombres se prolonge vers le bas', () => {
    const r = recopier(t([['1'], ['2'], [''], [''], ['']]), { l1: 0, c1: 0, l2: 1, c2: 0 }, { l1: 2, c1: 0, l2: 4, c2: 0 })
    expect(r.cellules.map((l) => l[0])).toEqual(['1', '2', '3', '4', '5'])
  })
  test('une suite de pas 10 garde ses décimales', () => {
    const r = recopier(t([['0.5'], ['10.5'], ['']]), { l1: 0, c1: 0, l2: 1, c2: 0 }, { l1: 2, c1: 0, l2: 2, c2: 0 })
    expect(r.cellules[2]![0]).toBe('20.5')
  })
  test('vers la droite, et vers le haut', () => {
    const droite = recopier(t([['2', '4', '', ''], ['', '', '', '']]), { l1: 0, c1: 0, l2: 0, c2: 1 }, { l1: 0, c1: 2, l2: 0, c2: 3 })
    expect(droite.cellules[0]).toEqual(['2', '4', '6', '8'])
    const haut = recopier(t([[''], [''], ['5'], ['6']]), { l1: 2, c1: 0, l2: 3, c2: 0 }, { l1: 0, c1: 0, l2: 1, c2: 0 })
    expect(haut.cellules.map((l) => l[0])).toEqual(['3', '4', '5', '6'])
  })
  test('sinon les valeurs et les formats se répètent', () => {
    const r = recopier(t([['a'], ['b'], [''], [''], ['']], [[{ gras: true }], [null], [null], [null], [null]]), { l1: 0, c1: 0, l2: 1, c2: 0 }, { l1: 2, c1: 0, l2: 4, c2: 0 })
    expect(r.cellules.map((l) => l[0])).toEqual(['a', 'b', 'a', 'b', 'a'])
    expect(r.formats![4]![0]).toEqual({ gras: true })
    expect(r.formats![3]![0]).toBeNull()
  })
  test('une suite irrégulière, un nombre seul ou un texte de type Texte se répètent', () => {
    const irreg = recopier(t([['1'], ['2'], ['4'], ['']]), { l1: 0, c1: 0, l2: 2, c2: 0 }, { l1: 3, c1: 0, l2: 3, c2: 0 })
    expect(irreg.cellules[3]![0]).toBe('1')
    const seul = recopier(t([['7'], [''], ['']]), { l1: 0, c1: 0, l2: 0, c2: 0 }, { l1: 1, c1: 0, l2: 2, c2: 0 })
    expect(seul.cellules.map((l) => l[0])).toEqual(['7', '7', '7'])
    const texte = recopier(t([['1'], ['2'], ['']], [[{ type: 'texte' }], [{ type: 'texte' }], [null]]), { l1: 0, c1: 0, l2: 1, c2: 0 }, { l1: 2, c1: 0, l2: 2, c2: 0 })
    expect(texte.cellules[2]![0]).toBe('1')
  })
  test('les formules passent par le rappel avec leur décalage', () => {
    const r = recopier(t([['=A1', '1'], ['', ''], ['', '']]), { l1: 0, c1: 0, l2: 0, c2: 0 }, { l1: 1, c1: 0, l2: 2, c2: 0 }, (f, dl, dc) => `${f}[${dl},${dc}]`)
    expect(r.cellules.map((l) => l[0])).toEqual(['=A1', '=A1[1,0]', '=A1[2,0]'])
  })
  test('plusieurs colonnes : chacune prolonge sa propre suite', () => {
    const r = recopier(t([['1', '10'], ['2', '20'], ['', ''], ['', '']]), { l1: 0, c1: 0, l2: 1, c2: 1 }, { l1: 2, c1: 0, l2: 3, c2: 1 })
    expect(r.cellules.slice(2)).toEqual([['3', '30'], ['4', '40']])
  })
  test('la source n’est pas touchée, la cible hors de la grille est rognée', () => {
    const base = t([['1'], ['2']])
    const r = recopier(base, { l1: 0, c1: 0, l2: 1, c2: 0 }, { l1: 2, c1: 0, l2: 9, c2: 0 })
    expect(r.cellules).toEqual([['1'], ['2']])
    expect(base.cellules).toEqual([['1'], ['2']])
  })
})
