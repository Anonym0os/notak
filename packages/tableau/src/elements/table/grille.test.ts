import { describe, expect, test } from 'vitest'
import {
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
