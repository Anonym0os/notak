import { describe, expect, test } from 'vitest'
import { depuisTaille, point } from './geometrie'
import {
  SEUIL_DROIT,
  aimanterAngle,
  auMoins,
  longueurMin,
  courbeDepuisPoint,
  decouper,
  evaluer,
  lignesASupprimer,
  pointControle,
  quadratique,
  relier,
  sommetsFleche,
  tracer,
} from './lignes'
import type { Element, Ligne, Tableau } from './tableau'

const proche = (p: { x: number; y: number }, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 3)
  expect(p.y).toBeCloseTo(y, 3)
}

describe('point de contrôle', () => {
  const [a, b] = [point(0, 0), point(20, 0)]

  test('sans courbe : droit', () => {
    expect(pointControle(a, b)).toBeNull()
  })
  test('l’écart est perpendiculaire à la corde, à la position donnée', () => {
    const c = pointControle(a, b, { ecart: 10, position: 0.5 })!
    proche(c, 10, 10)
    proche(pointControle(a, b, { ecart: -6, position: 0.25 })!, 5, -6)
  })
  test('moins de 2 UG du milieu : droit', () => {
    expect(pointControle(a, b, { ecart: SEUIL_DROIT - 0.1, position: 0.5 })).toBeNull()
    expect(pointControle(a, b, { ecart: SEUIL_DROIT, position: 0.5 })).not.toBeNull()
    expect(pointControle(a, b, { ecart: 0, position: 0.5 })).toBeNull()
  })
  test('corde nulle : droit', () => {
    expect(pointControle(a, a, { ecart: 10, position: 0.5 })).toBeNull()
  })
  test('courbeDepuisPoint est l’inverse de pointControle', () => {
    const courbe = { ecart: 7, position: 0.3 }
    const c = pointControle(a, b, courbe)!
    expect(courbeDepuisPoint(a, b, c)).toEqual(courbe)
    const oblique = pointControle(point(3, 4), point(13, -8), { ecart: -9, position: 0.6 })!
    const retour = courbeDepuisPoint(point(3, 4), point(13, -8), oblique)!
    expect(retour.ecart).toBeCloseTo(-9, 1)
    expect(retour.position).toBeCloseTo(0.6, 1)
  })
  test('un point ramené près du milieu remet le trait droit', () => {
    expect(courbeDepuisPoint(a, b, point(10.5, 1))).toBeUndefined()
    expect(courbeDepuisPoint(a, b, point(10, 1.9))).toBeUndefined()
    expect(courbeDepuisPoint(a, b, point(10, 2.5))).toBeDefined()
  })
  test('la position reste entre 0 et 1', () => {
    expect(courbeDepuisPoint(a, b, point(50, 5))!.position).toBe(1)
    expect(courbeDepuisPoint(a, b, point(-30, 5))!.position).toBe(0)
  })
})

describe('Bézier', () => {
  test('évaluation aux bouts et au milieu', () => {
    const q = { a: point(0, 0), c: point(10, 20), b: point(20, 0) }
    proche(evaluer(q, 0), 0, 0)
    proche(evaluer(q, 1), 20, 0)
    proche(evaluer(q, 0.5), 10, 10)
  })
  test('un morceau découpé suit la même courbe', () => {
    const q = { a: point(0, 0), c: point(10, 20), b: point(30, 0) }
    const m = decouper(q, 0.2, 0.7)
    for (const u of [0, 0.3, 0.5, 1]) {
      const [p, r] = [evaluer(m, u), evaluer(q, 0.2 + u * 0.5)]
      proche(p, r.x, r.y)
    }
  })
})

describe('tracer', () => {
  const gauche = depuisTaille(point(0, 0), 10, 10) // centre (5, 5)
  const droite = depuisTaille(point(40, 0), 10, 10) // centre (45, 5)

  test('libre des deux côtés : de bout en bout', () => {
    const t = tracer({ a: point(0, 0), b: point(10, 0) })!
    proche(t.debut, 0, 0)
    proche(t.fin, 10, 0)
    expect(t.droit).toBe(true)
    proche(t.milieu, 5, 0)
    proche(t.versFin, 1, 0)
    proche(t.versDebut, -1, 0)
  })
  test('droit : le trait s’arrête sur le bord des deux rectangles', () => {
    const t = tracer({ a: point(5, 5), b: point(45, 5), rectA: gauche, rectB: droite })!
    proche(t.debut, 10, 5)
    proche(t.fin, 40, 5)
    proche(t.milieu, 25, 5)
  })
  test('en diagonale : l’intersection est sur le bord, pas ailleurs', () => {
    const bas = depuisTaille(point(0, 40), 10, 10)
    const t = tracer({ a: point(5, 5), b: point(5, 45), rectA: gauche, rectB: bas })!
    proche(t.debut, 5, 10)
    proche(t.fin, 5, 40)
    const diag = tracer({ a: point(5, 5), b: point(25, 45), rectA: gauche, rectB: depuisTaille(point(20, 40), 10, 10) })!
    expect(diag.debut.x).toBeCloseTo(7.5, 2) // pente 2 : sort par le bas à y = 10
    expect(diag.debut.y).toBeCloseTo(10, 2)
  })
  test('un seul bout accroché : l’autre reste au point libre', () => {
    const t = tracer({ a: point(5, 5), b: point(30, 5), rectA: gauche })!
    proche(t.debut, 10, 5)
    proche(t.fin, 30, 5)
  })
  test('courbe : elle sort du rectangle sur le bord, et suit la courbe', () => {
    const courbe = { ecart: 20, position: 0.5 }
    const t = tracer({ a: point(5, 5), b: point(45, 5), rectA: gauche, rectB: droite, courbe })!
    const q = quadratique(point(5, 5), point(45, 5), courbe)
    expect(t.droit).toBe(false)
    // Le début est sur le bord du rectangle (haut ou droite) et sur la courbe d'origine.
    const surBord = Math.abs(t.debut.x - 10) < 1e-3 || Math.abs(t.debut.y - 0) < 1e-3
    expect(surBord).toBe(true)
    expect(t.debut.x).toBeGreaterThanOrEqual(5)
    const proches = Array.from({ length: 2001 }, (_, i) => evaluer(q, i / 2000)).some(
      (p) => Math.hypot(p.x - t.debut.x, p.y - t.debut.y) < 0.02,
    )
    expect(proches).toBe(true)
  })
  test('des éléments qui se chevauchent : rien à tracer', () => {
    const [r1, r2] = [depuisTaille(point(0, 0), 10, 10), depuisTaille(point(5, 0), 10, 10)]
    expect(tracer({ a: point(5, 5), b: point(10, 5), rectA: r1, rectB: r2 })).toBeNull()
  })
  test('le recul raccourcit le trait mais pas la pointe', () => {
    const t = tracer({ a: point(5, 5), b: point(45, 5), rectA: gauche, rectB: droite, reculA: 2, reculB: 3 })!
    proche(t.debut, 10, 5)
    proche(t.fin, 40, 5)
    proche(t.chemin.a, 12, 5)
    proche(t.chemin.b, 37, 5)
  })
  test('un trait plus court que le recul n’est pas raccourci', () => {
    const t = tracer({ a: point(0, 0), b: point(1, 0), reculA: 5, reculB: 5 })!
    proche(t.chemin.a, 0, 0)
    proche(t.chemin.b, 1, 0)
  })
})

describe('pointes', () => {
  test('flèche : pointe sur le bout, base en arrière', () => {
    const [bout, g, d] = sommetsFleche(point(10, 0), point(1, 0), 1)
    proche(bout, 10, 0)
    proche(g, 9, 0.45)
    proche(d, 9, -0.45)
  })
})

describe('relier (arbre couvrant minimal)', () => {
  const item = (id: string, x: number, y: number) => ({ id, centre: point(x, y) })

  test('n éléments : n−1 lignes', () => {
    const items = [item('a', 0, 0), item('b', 10, 0), item('c', 20, 0), item('d', 0, 50)]
    expect(relier(items)).toHaveLength(3)
  })
  test('relie les plus proches, pas tout à tout', () => {
    // a — b — c alignés : a–c est plus long que a–b et b–c.
    const lignes = relier([item('a', 0, 0), item('b', 10, 0), item('c', 20, 0)])
    const paires = lignes.map((l) => [...l].sort().join('')).sort()
    expect(paires).toEqual(['ab', 'bc'])
  })
  test('un élément seul : rien', () => {
    expect(relier([item('a', 0, 0)])).toEqual([])
    expect(relier([])).toEqual([])
  })
  test('ne double pas une ligne qui existe déjà, dans un sens ou dans l’autre', () => {
    const items = [item('a', 0, 0), item('b', 10, 0), item('c', 20, 0)]
    expect(relier(items, [['b', 'a']]).map((l) => [...l].sort().join(''))).toEqual(['bc'])
    expect(relier(items, [['a', 'b'], ['c', 'b']])).toEqual([])
  })
  test('une liaison existante qui passe par un tiers compte comme chemin', () => {
    // a–c existe : b est seul, il se relie une seule fois, au plus proche.
    const items = [item('a', 0, 0), item('b', 10, 0), item('c', 100, 0)]
    expect(relier(items, [['a', 'c']])).toEqual([['a', 'b']])
  })
  test('une ligne vers un élément hors sélection est ignorée', () => {
    const items = [item('a', 0, 0), item('b', 10, 0)]
    expect(relier(items, [['a', 'z']])).toEqual([['a', 'b']])
  })
})

describe('lignes à supprimer', () => {
  const note = (id: string): Element => ({
    id,
    x: 0,
    y: 0,
    largeur: 34,
    contenu: { type: 'note', texte: { type: 'doc' } },
  })
  const ligne = (id: string, depart: Ligne['depart'], arrivee: Ligne['arrivee']): Element => ({
    id,
    x: 0,
    y: 0,
    largeur: 1,
    contenu: { type: 'ligne', depart, arrivee, pointeDepart: 'rien', pointeArrivee: 'fleche', trait: 'plein', epaisseur: 2 },
  })
  const tableau: Tableau = {
    titre: '',
    elements: [
      note('a'),
      note('b'),
      note('c'),
      ligne('ab', { element: 'a' }, { element: 'b' }),
      ligne('bc', { element: 'b' }, { element: 'c' }),
      ligne('libre', { x: 0, y: 0 }, { x: 5, y: 5 }),
      ligne('ac', { element: 'a' }, { x: 9, y: 9 }),
    ],
  }
  const ids = (es: Element[]) => es.map((e) => e.id).sort()

  test('les lignes accrochées par un bout ou l’autre partent avec l’élément', () => {
    expect(ids(lignesASupprimer([tableau.elements[0]!], tableau))).toEqual(['ab', 'ac'])
    expect(ids(lignesASupprimer([tableau.elements[1]!], tableau))).toEqual(['ab', 'bc'])
  })
  test('une ligne libre reste', () => {
    expect(ids(lignesASupprimer([tableau.elements[2]!], tableau))).toEqual(['bc'])
  })
  test('une ligne déjà supprimée n’est pas redonnée', () => {
    const els = tableau.elements
    expect(ids(lignesASupprimer([els[0]!, els[3]!], tableau))).toEqual(['ac'])
  })
  test('supprimer une ligne seule n’emporte rien', () => {
    expect(lignesASupprimer([tableau.elements[3]!], tableau)).toEqual([])
  })
})

describe('angle et longueur', () => {
  const o = point(0, 0)
  test('Maj cale à 45°', () => {
    expect(aimanterAngle(o, point(10, 2))).toEqual(point(10, 0))
    expect(aimanterAngle(o, point(-1, -9))).toEqual(point(0, -9))
    expect(aimanterAngle(o, point(7, -6))).toEqual(point(7, -7))
  })
  test('une ligne fléchée garde de quoi loger ses pointes', () => {
    expect(longueurMin('fleche', 'fleche')).toBe(1.5)
    expect(auMoins(o, point(0.5, 0), longueurMin('rien', 'fleche'))).toEqual(point(1, 0))
    expect(auMoins(o, point(3, 4), 1)).toEqual(point(3, 4))
  })
})
