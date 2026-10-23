import { describe, expect, test } from 'vitest'
import type { Table } from '../../coeur/tableau'
import {
  LIGNES_MAX,
  ajusterALaPoignee,
  continuation,
  appliquerFormat,
  basculerStyle,
  calerSurGrille,
  colonnesEntieres,
  dansPlage,
  deplacerColonnes,
  deplacerLignes,
  elargirColonnes,
  formatsDe,
  insererColonnes,
  insererLignes,
  largeursDe,
  lignesEntieres,
  normaliserPlage,
  retirerColonnes,
  retirerLignes,
  viderPlage,
  ajouterColonne,
  ajouterLigne,
  celluleSuivante,
  changerCellule,
  grilleVide,
  nombreColonnes,
  normaliser,
  nouvelleTable,
  resume,
  retirerColonne,
  retirerLigne,
} from './grille'

const g = [
  ['a', 'b'],
  ['c', 'd'],
  ['e', 'f'],
]

describe('la grille', () => {
  test('une table neuve : 4 lignes, 3 colonnes, toutes vides', () => {
    const t = nouvelleTable(0, 0)
    expect(t.contenu.cellules).toHaveLength(4)
    expect(nombreColonnes(t.contenu.cellules)).toBe(3)
    expect(t.contenu.cellules.flat().every((v) => v === '')).toBe(true)
  })

  test('une ligne s’ajoute après la ligne donnée, à la fin par défaut', () => {
    expect(ajouterLigne(g, 0)).toEqual([['a', 'b'], ['', ''], ['c', 'd'], ['e', 'f']])
    expect(ajouterLigne(g).at(-1)).toEqual(['', ''])
    expect(ajouterLigne(g, -1)[0]).toEqual(['', ''])
  })

  test('une colonne s’ajoute après la colonne donnée, à la fin par défaut', () => {
    expect(ajouterColonne(g, 0)[1]).toEqual(['c', '', 'd'])
    expect(ajouterColonne(g)[0]).toEqual(['a', 'b', ''])
    expect(ajouterColonne(g, -1)[2]).toEqual(['', 'e', 'f'])
  })

  test('retirer une ligne ou une colonne ; jamais sous le minimum', () => {
    expect(retirerLigne(g, 1)).toEqual([['a', 'b'], ['e', 'f']])
    expect(retirerLigne(retirerLigne(g, 1), 0)).toEqual([['a', 'b'], ['e', 'f']])
    expect(retirerColonne(g, 0)).toEqual([['b'], ['d'], ['f']])
    expect(retirerColonne(retirerColonne(g, 0), 0)).toEqual([['b'], ['d'], ['f']])
  })

  test('changer une cellule laisse l’original intact', () => {
    const apres = changerCellule(g, 1, 0, 'X')
    expect(apres[1]).toEqual(['X', 'd'])
    expect(g[1]).toEqual(['c', 'd'])
  })

  test('Tab avance de gauche à droite puis à la ligne ; au bout, rien', () => {
    expect(celluleSuivante(g, 0, 1)).toEqual([1, 0])
    expect(celluleSuivante(g, 1, 0, true)).toEqual([0, 1])
    expect(celluleSuivante(g, 2, 1)).toBeNull()
    expect(celluleSuivante(g, 0, 0, true)).toBeNull()
  })

  test('normaliser complète les lignes courtes et garde deux lignes au moins', () => {
    expect(normaliser([['a'], ['b', 'c']])).toEqual([['a', ''], ['b', 'c']])
    expect(normaliser([['a', 'b']])).toEqual([['a', 'b'], ['', '']])
    expect(normaliser([])).toEqual(grilleVide(2, 1))
  })

  test('le résumé nomme l’en-tête et la taille', () => {
    expect(resume({ type: 'table', cellules: [['Nom', 'Prix'], ['', '']] })).toBe('Nom | Prix (2 lignes × 2 colonnes)')
  })
})

const table = (): Table => ({
  type: 'table',
  cellules: [['A', 'B', 'C'], ['1', '2', '3'], ['4', '5', '6']],
  formats: [[{ gras: true, fond: 'entete' }, { gras: true, fond: 'entete' }, { gras: true, fond: 'entete' }], [null, { type: 'nombre' }, null], [null, null, { fond: '#ff5757' }]],
  largeurs: [10, 12, 14],
})

describe('une table neuve, ses formats et ses largeurs', () => {
  test('en-tête en gras sur fond d’en-tête, trois largeurs qui font 34', () => {
    const c = nouvelleTable(0, 0)
    expect(c.contenu.formats![0]).toEqual([{ gras: true, fond: 'entete' }, { gras: true, fond: 'entete' }, { gras: true, fond: 'entete' }])
    expect(c.contenu.formats![1]!.every((f) => f === null)).toBe(true)
    expect(c.contenu.largeurs!.reduce((a, b) => a + b, 0)).toBeCloseTo(34)
    expect(c.largeur).toBe(34)
  })

  test('sans formats, la ligne 0 est un en-tête sauf sansEntete', () => {
    const base: Table = { type: 'table', cellules: [['a', 'b'], ['c', 'd']] }
    expect(formatsDe(base)[0]![1]).toEqual({ gras: true, fond: 'entete' })
    expect(formatsDe(base)[1]![0]).toBeNull()
    expect(formatsDe({ ...base, sansEntete: true })[0]![0]).toBeNull()
  })

  test('les formats lus ont la forme des cellules, même si les formats posés sont courts', () => {
    const f = formatsDe({ type: 'table', cellules: [['a', 'b'], ['c', 'd']], formats: [[{ gras: true }]] })
    expect(f).toEqual([[{ gras: true }, null], [null, null]])
  })

  test('largeurs : partage égal, ou mise à l’échelle sur l’élément', () => {
    const base: Table = { type: 'table', cellules: [['a', 'b'], ['c', 'd']] }
    expect(largeursDe(base, 24)).toEqual([12, 12])
    expect(largeursDe({ ...base, largeurs: [10, 10] }, 20)).toEqual([10, 10])
    expect(largeursDe({ ...base, largeurs: [10, 30] }, 20)).toEqual([5, 15])
    expect(largeursDe({ ...base, largeurs: [10] }, 20)).toEqual([10, 10])
  })
})

describe('les plages', () => {
  test('normaliser remet les bornes dans l’ordre', () => {
    expect(normaliserPlage({ l1: 3, c1: 2, l2: 1, c2: 0 })).toEqual({ l1: 1, c1: 0, l2: 3, c2: 2 })
  })
  test('dansPlage, lignes et colonnes entières', () => {
    expect(dansPlage({ l1: 2, c1: 2, l2: 0, c2: 0 }, 1, 1)).toBe(true)
    expect(dansPlage({ l1: 0, c1: 0, l2: 1, c2: 1 }, 2, 0)).toBe(false)
    const t = table()
    expect(lignesEntieres([{ l1: 1, c1: 0, l2: 2, c2: 2 }], t)).toBe(true)
    expect(lignesEntieres([{ l1: 1, c1: 0, l2: 2, c2: 1 }], t)).toBe(false)
    expect(colonnesEntieres([{ l1: 0, c1: 1, l2: 2, c2: 1 }], t)).toBe(true)
    expect(colonnesEntieres([], t)).toBe(false)
  })
})

describe('insérer et retirer des lignes', () => {
  test('insérer garde les formats de même forme et reprend le style de la ligne au-dessus', () => {
    const t = insererLignes(table(), 3, 2)
    expect(t.cellules).toHaveLength(5)
    expect(t.formats).toHaveLength(5)
    expect(t.cellules[3]).toEqual(['', '', ''])
    expect(t.formats![3]).toEqual([null, null, null]) // la ligne 2 n’est pas régulière
    expect(t.formats![2]![2]).toEqual({ fond: '#ff5757' })
  })
  test('une ligne neuve prolonge ce que ses voisines partagent ; l’en-tête ne se recopie pas', () => {
    const jaune = { italique: true, fond: '#ffd14d' }
    let t = appliquerFormat(table(), [{ l1: 1, c1: 0, l2: 2, c2: 2 }], () => jaune)
    // Entre deux lignes jaunes : jaune. Sous la dernière jaune, avec une jaune au-dessus d'elle : jaune aussi.
    expect(insererLignes(t, 2, 1).formats![2]).toEqual([jaune, jaune, jaune])
    expect(insererLignes(t, 3, 1).formats![3]).toEqual([jaune, jaune, jaune])
    // Une seule ligne jaune, entourée de lignes sans fond : rien ne se recopie.
    t = appliquerFormat(table(), [{ l1: 2, c1: 0, l2: 2, c2: 2 }], () => jaune)
    expect(insererLignes(t, 3, 1).formats![3]).toEqual([null, null, null])
    expect(insererLignes(table(), 1, 1).formats![1]).toEqual([null, null, null])
  })
  test('la règle des voisines : le type ne passe jamais, le côté d’après prend le relais', () => {
    expect(continuation(null, { type: 'nombre', gras: true }, { gras: true }, null, false)).toEqual({ gras: true })
    expect(continuation(null, null, { fond: '#62dbc8' }, { fond: '#62dbc8' }, false)).toEqual({ fond: '#62dbc8' })
    expect(continuation(null, { fond: '#62dbc8', alignement: 'droite' }, null, null, true)).toEqual({ fond: '#62dbc8', alignement: 'droite' })
  })
  test('insérer au milieu décale, et le rappel réécrit les formules', () => {
    const t = { ...table(), cellules: [['A', 'B', 'C'], ['=A1', '2', '3'], ['4', '5', '6']] }
    const r = insererLignes(t, 1, 1, (f) => f.replace('A1', 'A1+1'))
    expect(r.cellules[2]![0]).toBe('=A1+1')
    expect(r.cellules[1]).toEqual(['', '', ''])
  })
  test('le nombre de lignes est borné', () => {
    // Milanote ne borne pas la table : 500 lignes d'un coup passent, seul un plafond de garde existe.
    expect(insererLignes(table(), 0, 500).cellules.length).toBe(503)
    expect(insererLignes(table(), 0, 50_000).cellules.length).toBeLessThanOrEqual(LIGNES_MAX)
    const t = table()
    expect(insererLignes(t, 0, 0)).toBe(t)
  })
  test('retirer des lignes, jamais sous deux', () => {
    const t = retirerLignes(table(), 1, 1)
    expect(t.cellules).toEqual([['A', 'B', 'C'], ['4', '5', '6']])
    expect(t.formats).toHaveLength(2)
    const inchange = table()
    expect(retirerLignes(inchange, 0, 2)).toBe(inchange)
  })
})

describe('insérer et retirer des colonnes', () => {
  test('une colonne neuve fait 12 UG et reprend le style de la voisine ligne par ligne', () => {
    const t = insererColonnes(table(), 1, 1)
    expect(t.cellules[0]).toEqual(['A', '', 'B', 'C'])
    expect(t.largeurs).toEqual([10, 12, 12, 14])
    expect(t.formats![0]![1]).toEqual({ gras: true, fond: 'entete' })
    expect(t.formats![1]![1]).toBeNull()
    expect(t.formats![2]![3]).toEqual({ fond: '#ff5757' })
  })
  test('sans largeurs, celles de l’élément servent', () => {
    const t = insererColonnes({ type: 'table', cellules: [['a', 'b'], ['c', 'd']] }, 2, 1, undefined, 20)
    expect(t.largeurs).toEqual([10, 10, 12])
  })
  test('retirer une colonne retire sa largeur ; une colonne reste au moins', () => {
    const t = retirerColonnes(table(), 0, 1)
    expect(t.cellules[0]).toEqual(['B', 'C'])
    expect(t.largeurs).toEqual([12, 14])
    const seule = { ...table(), cellules: [['a'], ['b']], formats: undefined, largeurs: [10] }
    expect(retirerColonnes(seule, 0, 1)).toBe(seule)
  })
})

describe('déplacer', () => {
  test('des lignes : le bloc commence à la place demandée', () => {
    const t = deplacerLignes(table(), 0, 1, 2)
    expect(t.cellules.map((l) => l[0])).toEqual(['1', '4', 'A'])
    expect(t.formats![2]![0]).toEqual({ gras: true, fond: 'entete' })
  })
  test('des colonnes avec leurs formats et leurs largeurs', () => {
    const t = deplacerColonnes(table(), 2, 1, 0)
    expect(t.cellules[1]).toEqual(['3', '1', '2'])
    expect(t.largeurs).toEqual([14, 10, 12])
    expect(t.formats![2]![0]).toEqual({ fond: '#ff5757' })
  })
  test('hors bornes : rien ne bouge', () => {
    const t = table()
    expect(deplacerLignes(t, 2, 2, 0)).toBe(t)
  })
})

describe('vider, mettre en forme', () => {
  test('vider efface le texte et garde les formats', () => {
    const t = viderPlage(table(), { l1: 1, c1: 1, l2: 2, c2: 2 })
    expect(t.cellules[1]).toEqual(['1', '', ''])
    expect(t.formats![1]![1]).toEqual({ type: 'nombre' })
  })
  test('appliquerFormat touche chaque cellule une fois et nettoie', () => {
    let n = 0
    const t = appliquerFormat(table(), [{ l1: 1, c1: 0, l2: 1, c2: 1 }, { l1: 1, c1: 1, l2: 1, c2: 2 }], (f) => {
      n++
      return f ? { ...f, couleur: '#d93a3a' } : { couleur: '#d93a3a' }
    })
    expect(n).toBe(3)
    expect(t.formats![1]).toEqual([{ couleur: '#d93a3a' }, { type: 'nombre', couleur: '#d93a3a' }, { couleur: '#d93a3a' }])
    expect(appliquerFormat(table(), [{ l1: 2, c1: 2, l2: 2, c2: 2 }], () => ({ gras: undefined })).formats![2]![2]).toBeNull()
  })
  test('basculer : la première cellule décide', () => {
    const toute = [{ l1: 0, c1: 0, l2: 1, c2: 1 }]
    const ote = basculerStyle(table(), toute, 'gras')
    expect(ote.formats![0]![0]).toEqual({ fond: 'entete' })
    expect(ote.formats![1]![0]).toBeNull()
    const pose = basculerStyle(table(), [{ l1: 1, c1: 0, l2: 1, c2: 1 }], 'italique')
    expect(pose.formats![1]).toEqual([{ italique: true }, { type: 'nombre', italique: true }, null])
    const ensemble = basculerStyle(table(), [{ l1: 1, c1: 0, l2: 1, c2: 0 }, { l1: 0, c1: 0, l2: 0, c2: 0 }], 'gras')
    expect(ensemble.formats![0]![0]).toEqual({ gras: true, fond: 'entete' })
    expect(ensemble.formats![1]![0]).toEqual({ gras: true })
  })
  test('changer une cellule d’une table garde formats et largeurs', () => {
    const t = changerCellule(table(), 1, 1, 'X')
    expect(t.cellules[1]![1]).toBe('X')
    expect(t.largeurs).toEqual([10, 12, 14])
    expect(t.formats![1]![1]).toEqual({ type: 'nombre' })
  })
})

describe('les largeurs de colonne', () => {
  test('le delta se partage entre les colonnes choisies', () => {
    expect(elargirColonnes([10, 10, 10], [0, 2], 4)).toEqual([12, 10, 12])
  })
  test('jamais sous 4 UG, le surplus passe aux autres', () => {
    expect(elargirColonnes([5, 20], [0, 1], -10)).toEqual([4, 11])
    expect(elargirColonnes([10], [0], -20)).toEqual([4])
  })
  test('caler sur la grille : total entier, reste sur la dernière colonne', () => {
    expect(calerSurGrille([11.3, 11.3, 11.5])).toEqual([11.3, 11.3, 11.4])
    expect(calerSurGrille([10.2, 10.2], 0)).toEqual([9.8, 10.2])
  })
})

describe('la poignée de l’élément', () => {
  const base = (): Table => ({ type: 'table', cellules: [['a', '', ''], ['', '', ''], ['', '', ''], ['', '', '']], largeurs: [12, 12, 12] })
  test('une colonne dès une demi-colonne, une ligne dès une demi-ligne', () => {
    const peu = ajusterALaPoignee(base(), [12, 12, 12], 5, 1)
    expect(peu.table.cellules).toHaveLength(4)
    expect(peu.largeurs).toHaveLength(3)
    const plus = ajusterALaPoignee(base(), [12, 12, 12], 6, 1.5)
    expect(plus.largeurs).toEqual([12, 12, 12, 12])
    expect(plus.table.cellules).toHaveLength(5)
    expect(plus.table.cellules.every((l) => l.length === 4)).toBe(true)
  })
  test('retire seulement du vide, à la fin', () => {
    const r = ajusterALaPoignee(base(), [12, 12, 12], -24, -9)
    expect(r.largeurs).toEqual([12])
    expect(r.table.cellules).toHaveLength(2)
    const garde = { ...base(), cellules: [['a', '', 'x'], ['', '', ''], ['', '', ''], ['', '', 'y']] }
    const g = ajusterALaPoignee(garde, [12, 12, 12], -24, -9)
    expect(g.largeurs).toHaveLength(3)
    expect(g.table.cellules).toHaveLength(4)
  })
  test('jamais sous deux lignes ni une colonne', () => {
    const r = ajusterALaPoignee(base(), [12, 12, 12], -500, -500)
    expect(r.table.cellules).toHaveLength(2)
    expect(r.largeurs).toHaveLength(1)
  })
})
