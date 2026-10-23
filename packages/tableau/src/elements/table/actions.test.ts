import { describe, expect, test } from 'vitest'
import type { Table } from '../../coeur/tableau'
import {
  collerA,
  choisirType,
  droitsDe,
  ecrireCellule,
  glisserColonnes,
  glisserLignes,
  insererApres,
  insererAutourColonnes,
  insererAutourLignes,
  plageDeRecopie,
  recopierSur,
  retirerSelection,
  tableDepuisCollage,
  versDeFrontiere,
  viderSelection,
} from './actions'
import { formatsDe, largeursDe } from './grille'

const table = (cellules: string[][], plus: Partial<Table> = {}): Table => ({ type: 'table', cellules, ...plus })
const base = table(
  [
    ['1', '2', '3'],
    ['4', '5', '=A2+B2'],
    ['7', '8', '9'],
  ],
  { largeurs: [10, 10, 10] },
)

describe('insérer autour de la sélection', () => {
  test('une colonne entière n’ajoute qu’une ligne, tout en bas ou tout en haut ; une ligne entière, une colonne au bord', () => {
    const r = insererAutourLignes(base, 30, [{ l1: 0, c1: 1, l2: 2, c2: 1 }], 'dessous')!
    expect(r.table.cellules).toHaveLength(4)
    expect(r.table.cellules[3]).toEqual(['', '', ''])
    expect(r.plages).toEqual([{ l1: 3, c1: 1, l2: 3, c2: 1 }])
    expect(insererAutourLignes(base, 30, [{ l1: 0, c1: 1, l2: 2, c2: 1 }], 'dessus')!.table.cellules[0]).toEqual(['', '', ''])
    const c = insererAutourColonnes(base, 30, [{ l1: 1, c1: 0, l2: 1, c2: 2 }], 'gauche')!
    expect(c.table.cellules[0]).toEqual(['', '1', '2', '3'])
    expect(c.plages).toEqual([{ l1: 1, c1: 0, l2: 1, c2: 0 }])
  })
  test('autant de lignes que la sélection en couvre, et la sélection suit', () => {
    const r = insererAutourLignes(base, 30, [{ l1: 0, c1: 0, l2: 1, c2: 1 }], 'dessus')!
    expect(r.table.cellules).toHaveLength(5)
    expect(r.table.cellules[2]).toEqual(['1', '2', '3'])
    expect(r.plages).toEqual([{ l1: 0, c1: 0, l2: 1, c2: 1 }])
  })
  test('dessous : les lignes neuves viennent après, les formules se décalent', () => {
    const t = table([['1'], ['=A1'], ['3']])
    const r = insererAutourLignes(t, 10, [{ l1: 0, c1: 0, l2: 0, c2: 0 }], 'dessous')!
    expect(r.table.cellules.map((l) => l[0])).toEqual(['1', '', '=A1', '3'])
    expect(r.plages).toEqual([{ l1: 1, c1: 0, l2: 1, c2: 0 }])
  })
  test('des colonnes à droite : elles font 12 UG et les formules suivent', () => {
    const r = insererAutourColonnes(base, 30, [{ l1: 0, c1: 0, l2: 0, c2: 0 }], 'droite')!
    expect(r.table.cellules[1]).toEqual(['4', '', '5', '=A2+C2'])
    expect(r.table.largeurs).toEqual([10, 12, 10, 10])
  })
  test('plusieurs plages : rien', () => {
    expect(insererAutourLignes(base, 30, [{ l1: 0, c1: 0, l2: 0, c2: 0 }, { l1: 2, c1: 0, l2: 2, c2: 0 }], 'dessus')).toBeNull()
  })
  test('Cmd+Entrée : une ligne dessous, une colonne à droite si une colonne entière est choisie', () => {
    expect(insererApres(base, 30, [{ l1: 1, c1: 1, l2: 1, c2: 1 }])!.table.cellules).toHaveLength(4)
    expect(insererApres(base, 30, [{ l1: 0, c1: 1, l2: 2, c2: 1 }])!.table.cellules[0]).toHaveLength(4)
  })
})

describe('retirer', () => {
  test('les lignes de la sélection, formules réécrites', () => {
    const r = retirerSelection(base, 30, [{ l1: 0, c1: 0, l2: 0, c2: 0 }])!
    expect(r.table.cellules).toHaveLength(2)
    expect(r.table.cellules[0]![2]).toBe('=A1+B1')
  })
  test('les colonnes si la sélection est faite de colonnes entières', () => {
    const r = retirerSelection(base, 30, [{ l1: 0, c1: 0, l2: 2, c2: 0 }])!
    expect(r.table.cellules[0]).toEqual(['2', '3'])
    expect(r.table.largeurs).toEqual([10, 10])
  })
  test('pas sous deux lignes', () => {
    const t = table([['a'], ['b']])
    expect(retirerSelection(t, 10, [{ l1: 0, c1: 0, l2: 0, c2: 0 }])).toBeNull()
  })
  test('deux plages séparées : les deux lignes partent', () => {
    const t = table([['a'], ['b'], ['c'], ['d']])
    const r = retirerSelection(t, 10, [{ l1: 0, c1: 0, l2: 0, c2: 0 }, { l1: 2, c1: 0, l2: 2, c2: 0 }])!
    expect(r.table.cellules).toEqual([['b'], ['d']])
  })
})

describe('déplacer', () => {
  test('une ligne entière monte, et la sélection la suit', () => {
    const r = glisserLignes(base, [{ l1: 1, c1: 0, l2: 1, c2: 2 }], -1)!
    expect(r.table.cellules[0]![0]).toBe('4')
    expect(r.plages).toEqual([{ l1: 0, c1: 0, l2: 0, c2: 2 }])
  })
  test('au bord, rien', () => {
    expect(glisserLignes(base, [{ l1: 0, c1: 0, l2: 0, c2: 2 }], -1)).toBeNull()
    expect(glisserColonnes(base, 30, [{ l1: 0, c1: 2, l2: 2, c2: 2 }], 1)).toBeNull()
  })
  test('une colonne emporte sa largeur', () => {
    const t = { ...base, largeurs: [10, 11, 12] }
    const r = glisserColonnes(t, 33, [{ l1: 0, c1: 0, l2: 2, c2: 0 }], 1)!
    expect(r.table.largeurs).toEqual([11, 10, 12])
  })
  test('la frontière visée donne la place dans le résultat', () => {
    expect(versDeFrontiere(1, 1, 0)).toBe(0)
    expect(versDeFrontiere(1, 1, 1)).toBeNull()
    expect(versDeFrontiere(1, 1, 2)).toBeNull()
    expect(versDeFrontiere(1, 1, 3)).toBe(2)
    expect(versDeFrontiere(1, 2, 4)).toBe(2)
  })
})

describe('les droits du menu', () => {
  test('une colonne entière cache l’ajout de lignes ; plusieurs plages grisent l’ajout', () => {
    const d = droitsDe(base, [{ l1: 0, c1: 1, l2: 2, c2: 1 }])
    expect(d.afficherLignes).toBe(false)
    expect(d.afficherColonnes).toBe(true)
    expect(d.colonnesGauche).toBe(true)
    expect(d.colonnesDroite).toBe(true)
    const e = droitsDe(base, [{ l1: 0, c1: 0, l2: 0, c2: 0 }, { l1: 2, c1: 2, l2: 2, c2: 2 }])
    expect(e.insererLignes).toBe(false)
    expect(e.plusieurs).toBe(true)
  })
  test('toute la table : ni insertion ni retrait, seulement vider ; les déplacements ne regardent que la première plage', () => {
    const d = droitsDe(base, [{ l1: 0, c1: 0, l2: 2, c2: 2 }])
    expect([d.afficherLignes, d.afficherColonnes, d.deplacerLignes, d.deplacerColonnes]).toEqual([false, false, false, false])
    const e = droitsDe(base, [{ l1: 1, c1: 0, l2: 1, c2: 2 }, { l1: 0, c1: 0, l2: 0, c2: 0 }])
    expect([e.deplacerLignes, e.lignesHaut, e.insererLignes]).toEqual([true, true, false])
    expect(glisserLignes(base, [{ l1: 1, c1: 0, l2: 1, c2: 2 }, { l1: 0, c1: 0, l2: 0, c2: 0 }], -1)!.table.cellules[0]).toEqual(['4', '5', '=A1+B1'])
  })
  test('le déplacement se grise au bord', () => {
    const d = droitsDe(base, [{ l1: 0, c1: 0, l2: 0, c2: 2 }])
    expect(d.lignesHaut).toBe(false)
    expect(d.lignesBas).toBe(true)
  })
})

describe('écrire une cellule', () => {
  test('un nombre tapé donne son type et sa valeur', () => {
    const r = ecrireCellule(base, 0, 0, '1 234,5', 'fr')
    expect(r.cellules[0]![0]).toBe('1234.5')
    expect(formatsDe(r)[0]![0]?.type).toBe('nombre')
  })
  test('une formule se ferme, et prend le type du résultat', () => {
    const t = table([['5', '6'], ['', '']], { formats: [[{ type: 'monnaie' }, null], [null, null]] })
    const r = ecrireCellule(t, 1, 0, '=SUM(A1:B1', 'fr')
    expect(r.cellules[1]![0]).toBe('=SUM(A1:B1)')
    expect(formatsDe(r)[1]![0]?.type).toBe('monnaie')
  })
  test('rien ne change : la même table', () => {
    const t = table([['abc']])
    expect(ecrireCellule(t, 0, 0, 'abc', 'fr')).toBe(t)
  })
  test('le calendrier garde le format de la date et ajoute l’heure', () => {
    const t = table([['46054']], { formats: [[{ type: 'date', date: 'long' }]] })
    const r = ecrireCellule(t, 0, 0, '2026-02-01 14:30', 'fr', { serie: '46054.604166667', avecHeure: true })
    expect(r.cellules[0]![0]).toBe('46054.604166667')
    expect(formatsDe(r)[0]![0]).toEqual({ type: 'date', date: 'long', heure: '24h' })
  })
})

describe('le type d’une cellule', () => {
  test('Texte fige le texte affiché', () => {
    const t = table([['1234.5']], { formats: [[{ type: 'nombre', decimales: 2 }]] })
    const r = choisirType(t, [{ l1: 0, c1: 0, l2: 0, c2: 0 }], 'texte', 'en')
    expect(r.cellules[0]![0]).toBe('1,234.50')
    expect(formatsDe(r)[0]![0]).toEqual({ type: 'texte' })
  })
  test('un type qu’une cellule ne peut pas prendre la laisse telle quelle', () => {
    const t = table([['abc', '12']])
    const r = choisirType(t, [{ l1: 0, c1: 0, l2: 0, c2: 1 }], 'monnaie', 'fr')
    expect(formatsDe(r)[0]![0]?.type).toBeUndefined()
    expect(formatsDe(r)[0]![1]?.type).toBe('monnaie')
  })
  test('Auto retire le type et ses options, pas la mise en forme', () => {
    const t = table([['12']], { formats: [[{ type: 'nombre', decimales: 3, gras: true }]] })
    expect(formatsDe(choisirType(t, [{ l1: 0, c1: 0, l2: 0, c2: 0 }], undefined, 'fr'))[0]![0]).toEqual({ gras: true })
  })
  test('une date écrite en toutes lettres devient son numéro de série', () => {
    const t = table([['01/02/2026']])
    const r = choisirType(t, [{ l1: 0, c1: 0, l2: 0, c2: 0 }], 'date', 'fr')
    expect(Number(r.cellules[0]![0])).toBeGreaterThan(40000)
    expect(formatsDe(r)[0]![0]?.type).toBe('date')
  })
})

describe('coller, recopier', () => {
  test('les références d’une formule collée se décalent', () => {
    const r = collerA(base, [{ l1: 2, c1: 0, l2: 2, c2: 0 }], { cellules: [['=A1+B1']], notak: true }, { dl: 2, dc: 0 }, 'fr')!
    expect(r.table.cellules[2]![0]).toBe('=A3+B3')
    expect(r.plages).toEqual([{ l1: 2, c1: 0, l2: 2, c2: 0 }])
  })
  test('la grille s’agrandit si le collage dépasse', () => {
    const r = collerA(base, [{ l1: 2, c1: 2, l2: 2, c2: 2 }], { cellules: [['a', 'b'], ['c', 'd']] }, null, 'fr')!
    expect(r.table.cellules).toHaveLength(4)
    expect(r.table.cellules[3]).toEqual(['', '', 'c', 'd'])
  })
  test('la poignée vise dans le sens où l’on a le plus tiré', () => {
    const s = { l1: 1, c1: 1, l2: 1, c2: 1 }
    expect(plageDeRecopie(s, { l: 4, c: 2 })).toEqual({ l1: 1, c1: 1, l2: 4, c2: 1 })
    expect(plageDeRecopie(s, { l: 1, c: 5 })).toEqual({ l1: 1, c1: 1, l2: 1, c2: 5 })
    expect(plageDeRecopie(s, { l: 0, c: 1 })).toEqual({ l1: 0, c1: 1, l2: 1, c2: 1 })
    expect(plageDeRecopie(s, { l: 1, c: 1 })).toEqual(s)
  })
  test('recopier répète le motif et décale les formules', () => {
    const t = table([['1'], ['=A1+1'], [''], ['']])
    const r = recopierSur(t, { l1: 0, c1: 0, l2: 1, c2: 0 }, { l1: 0, c1: 0, l2: 3, c2: 0 })!
    expect(r.table.cellules.map((l) => l[0])).toEqual(['1', '=A1+1', '1', '=A3+1'])
  })
  test('une table collée sur la toile prend la taille du collage, sans en-tête', () => {
    const e = tableDepuisCollage({ cellules: [['a', 'b', 'c'], ['1', '2', '3']] }, 5, 6, 'fr')
    expect(e.largeur).toBe(36)
    expect(e.contenu.cellules).toEqual([['a', 'b', 'c'], ['1', '2', '3']])
    expect(formatsDe(e.contenu).flat().some((f) => f?.fond)).toBe(false)
    expect(largeursDe(e.contenu, e.largeur)).toEqual([12, 12, 12])
    expect([e.x, e.y]).toEqual([5, 6])
  })
})

describe('vider', () => {
  test('le texte part, la mise en forme reste ; une case à cocher redevient une cellule ordinaire', () => {
    const t = table([['true', '5']], { formats: [[{ type: 'case', fond: '#ffd14d' }, { type: 'nombre', gras: true }]] })
    const v = viderSelection(t, [{ l1: 0, c1: 0, l2: 0, c2: 1 }])
    expect(v.cellules[0]).toEqual(['', ''])
    expect(v.formats![0]).toEqual([{ fond: '#ffd14d' }, { type: 'nombre', gras: true }])
  })
})
