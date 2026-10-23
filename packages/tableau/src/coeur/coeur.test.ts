import { describe, expect, test } from 'vitest'
import * as cam from './camera'
import { chevauche, depuisCoins, depuisTaille, point } from './geometrie'
import { Historique } from './historique'
import { cliquer, lasso, traverse } from './selection'
import {
  POSITION_MAX,
  type Operation,
  type Tableau,
  aimanter,
  appliquer,
  auPremierPlan,
  inverse,
  nouvelId,
  nouvelleNote,
} from './tableau'

const VUE: cam.Vue = { largeur: 1000, hauteur: 800 }
const vide = (): Tableau => ({ titre: 'Essai', elements: [] })

describe('géométrie', () => {
  test('deux rectangles qui se touchent d’un bord se chevauchent', () => {
    const a = depuisTaille(point(0, 0), 10, 10)
    expect(chevauche(a, depuisTaille(point(10, 0), 5, 5))).toBe(true)
    expect(chevauche(a, depuisTaille(point(10.5, 0), 5, 5))).toBe(false)
  })
})

describe('tableau', () => {
  test('chaque opération suivie de son inverse rend le tableau d’origine', () => {
    const note = nouvelleNote(0, 0, 'a')
    const origine = appliquer(vide(), { type: 'creer', element: note })
    const ops: Operation[] = [
      { type: 'deplacer', id: note.id, de: [0, 0], vers: [12, -4] },
      { type: 'redimensionner', id: note.id, de: 34, vers: 20 },
      { type: 'contenu', id: note.id, avant: note.contenu, apres: nouvelleNote(0, 0, 'b').contenu },
      { type: 'supprimer', element: note },
    ]
    for (const op of ops) {
      const apres = appliquer(origine, op)
      expect(apres).not.toEqual(origine)
      expect(appliquer(apres, inverse(op))).toEqual(origine)
    }
  })

  test('redimensionner ne change que la largeur', () => {
    const note = nouvelleNote(3, 4, 'a')
    const t = appliquer({ titre: '', elements: [note] }, { type: 'redimensionner', id: note.id, de: 34, vers: 21 })
    expect(t.elements[0]).toEqual({ ...note, largeur: 21 })
  })

  test('une position est arrondie à la grille et bornée', () => {
    expect(aimanter(point(3.4, -2.6))).toEqual([3, -3])
    expect(aimanter(point(99_999, 0))).toEqual([POSITION_MAX, 0])
  })

  test('le premier plan garde l’ordre des éléments remontés', () => {
    const [a, b, c] = ['a', 'b', 'c'].map((s) => nouvelleNote(0, 0, s))
    const t = auPremierPlan({ titre: '', elements: [a!, b!, c!] }, [a!.id, b!.id])
    expect(t.elements.map((e) => e.id)).toEqual([c!.id, a!.id, b!.id])
  })

  test('un identifiant fait 26 caractères et se trie par date', () => {
    const [x, y] = [nouvelId(1_000), nouvelId(2_000)]
    expect(x).toHaveLength(26)
    expect(x < y).toBe(true)
  })
})

describe('historique', () => {
  test('un geste de groupe s’annule et se rétablit d’un coup', () => {
    const h = new Historique()
    const [a, b] = [nouvelleNote(0, 0, 'a'), nouvelleNote(40, 0, 'b')]
    const avant = { titre: '', elements: [a, b] }
    const pas: Operation[] = [
      { type: 'deplacer', id: a.id, de: [0, 0], vers: [5, 5] },
      { type: 'deplacer', id: b.id, de: [40, 0], vers: [45, 5] },
    ]
    const apres = pas.reduce(appliquer, avant)
    h.inscrire(pas)
    expect(h.annuler(apres)).toEqual(avant)
    expect(h.retablir(avant)).toEqual(apres)
  })

  test('un nouveau geste efface ce qu’on pouvait rétablir', () => {
    const h = new Historique()
    const a = nouvelleNote(0, 0, 'a')
    h.inscrire([{ type: 'creer', element: a }])
    h.annuler({ titre: '', elements: [a] })
    h.inscrire([{ type: 'creer', element: nouvelleNote(1, 1, 'b') }])
    expect(h.retablir(vide())).toBeNull()
  })

  test('l’historique oublie les plus vieux pas', () => {
    const h = new Historique()
    for (let i = 0; i <= 500; i++) h.inscrire([{ type: 'creer', element: nouvelleNote(i, 0) }])
    let n = 0
    let t: Tableau | null = vide()
    while ((t = h.annuler(t ?? vide()))) n++
    expect(n).toBe(400)
  })
})

describe('sélection', () => {
  const carre = (x: number) => depuisTaille(point(x, 0), 10, 10)

  test('le lasso prend une ligne par son trait, pas par sa boîte', () => {
    const diagonale = [point(0, 0), point(10, 10), point(20, 20)]
    // Le coin vide de la boîte de la diagonale ne la prend pas ; le trait, si.
    expect(traverse(depuisTaille(point(14, 0), 6, 6), diagonale)).toBe(false)
    expect(traverse(depuisTaille(point(8, 8), 4, 4), diagonale)).toBe(true)
    // Un segment qui traverse la zone sans point dedans compte aussi.
    expect(traverse(depuisTaille(point(4, 4), 2, 2), [point(0, 5), point(10, 5)])).toBe(true)
    expect(lasso(depuisTaille(point(14, 0), 6, 6), [['l', diagonale]], new Set(), false).size).toBe(0)
  })

  test('le lasso prend ce qu’il touche et inverse avec Maj', () => {
    const rects: [string, ReturnType<typeof carre>][] = [
      ['a', carre(0)],
      ['b', carre(20)],
      ['c', carre(40)],
    ]
    const zone = depuisCoins(point(5, 5), point(25, 6))
    expect(lasso(zone, rects, new Set(), false)).toEqual(new Set(['a', 'b']))
    expect(lasso(zone, rects, new Set(['b', 'c']), true)).toEqual(new Set(['a', 'c']))
  })

  test('cliquer un élément déjà choisi garde le groupe', () => {
    const groupe = new Set(['a', 'b'])
    expect(cliquer(groupe, 'a', false)).toEqual(groupe)
    expect(cliquer(groupe, 'a', true)).toEqual(new Set(['b']))
    expect(cliquer(new Set(['b']), 'a', false)).toEqual(new Set(['a']))
  })
})

describe('caméra', () => {
  const proche = (a: number, b: number) => expect(a).toBeCloseTo(b, 3)

  test('un point va à l’écran et en revient', () => {
    const c: cam.Camera = { origine: point(-12, 7.5), echelle: 1.7 }
    const r = cam.versTableau(c, cam.versEcran(c, point(33, -4)))
    proche(r.x, 33)
    proche(r.y, -4)
  })

  test('le zoom garde immobile le point fixe', () => {
    const c: cam.Camera = { origine: point(3, 3), echelle: 1 }
    const fixe = point(420, 130)
    const [avant, apres] = [cam.versTableau(c, fixe), cam.versTableau(cam.echelleAutour(c, 2, fixe), fixe)]
    proche(avant.x, apres.x)
    proche(avant.y, apres.y)
  })

  test('un geste de zoom s’arrête à 100 %, un nouveau geste repart au-dessus', () => {
    const g = new cam.GesteZoom()
    let e = 0.8
    for (let i = 0; i < 20; i++) e = g.appliquer(e, 1.1, 0.4, i * 16)
    expect(e).toBe(1)
    expect(g.appliquer(e, 1.1, 0.4, 2_000)).toBeGreaterThan(1)
  })

  test('un geste de dézoom parti de 100 % reste dessous', () => {
    const g = new cam.GesteZoom()
    const e = g.appliquer(1, 0.9, 0.4, 0)
    expect(e).toBeLessThan(1)
    expect(g.appliquer(e, 10, 0.4, 10)).toBe(1)
  })

  test('le zoom arrière minimal fait tenir le contenu et plafonne', () => {
    expect(cam.echelleMin(depuisTaille(point(0, 0), 10, 10), VUE)).toBe(cam.ECHELLE_MIN_PLAFOND)
    proche(cam.echelleMin(depuisTaille(point(0, 0), 2000, 100), VUE), (1000 * 0.6) / 20_000)
  })

  test('les crans du clavier montent et descendent dans l’ordre', () => {
    proche(cam.cranDessus(1, 0.4), 1.2)
    proche(cam.cranDessus(1.3, 0.4), 1.5)
    proche(cam.cranDessus(3, 0.4), 3)
    proche(cam.cranDessous(1.2, 0.4), 1)
    const sous = cam.cranDessous(1, 0.4)
    expect(sous < 1 && sous > 0.4).toBe(true)
    proche(cam.cranDessous(0.41, 0.4), 0.4)
  })

  test('ajuster plafonne selon la taille du contenu et centre le contenu', () => {
    proche(cam.ajuster(depuisTaille(point(0, 0), 10, 10), VUE)!.echelle, 1.3)
    // Ce qui tient à 100 % grossit sans marge ; le reste se réduit avec un cinquième de vide de chaque côté.
    proche(cam.ajuster(depuisTaille(point(0, 0), 90, 10), VUE)!.echelle, 1000 / 900)
    proche(cam.ajuster(depuisTaille(point(0, 0), 150, 10), VUE)!.echelle, 1000 / 1500 / 1.4)
    expect(cam.ajuster(null, VUE)).toBeNull()
    const c = cam.centreCamera(cam.ajuster(depuisTaille(point(100, -50), 40, 20), VUE)!, VUE)
    proche(c.x, 120)
    proche(c.y, -40)
  })

  test('ajuster ramène à 100 % quand on y est déjà, ou quand il irait dans le même sens', () => {
    expect(cam.revenirA100(0.5, 0.5)).toBe(true)
    expect(cam.revenirA100(0.4, 0.7)).toBe(true)
    expect(cam.revenirA100(2, 1.2)).toBe(true)
    expect(cam.revenirA100(1, 0.6)).toBe(false)
    expect(cam.revenirA100(0.7, 0.4)).toBe(false)
  })

  test('le document est borné en haut à gauche, et se recentre quand tout tient', () => {
    const grand = depuisTaille(point(0, 0), 400, 300)
    // Trop à gauche et trop haut : la vue revient à la marge (50 × 40 UG).
    const c = cam.bornerVue({ origine: point(-200, -100), echelle: 1 }, grand, VUE)
    expect([c.origine.x, c.origine.y]).toEqual([-50, -40])
    // Plus loin à droite ou en bas : rien n'arrête la vue.
    expect(cam.bornerVue({ origine: point(120, 90), echelle: 1 }, grand, VUE).origine).toEqual(point(120, 90))
    // Dézoomé au point que tout tient : le contenu se centre.
    const petit = depuisTaille(point(0, 0), 20, 10)
    const centre = cam.centreCamera(cam.bornerVue({ origine: point(300, 300), echelle: 0.25 }, petit, VUE), VUE)
    proche(centre.x, 10)
    proche(centre.y, 5)
    expect(cam.bornerVue(cam.CAMERA_DEPART, null, VUE)).toBe(cam.CAMERA_DEPART)
  })

  test('sans recentrage (un élément a bougé), la vue dézoomée reste où elle est', () => {
    const c = { origine: point(300, 300), echelle: 0.25 }
    expect(cam.bornerVue(c, depuisTaille(point(0, 0), 20, 10), VUE, false)).toBe(c)
  })

  test('très dézoomé, un écart de moins d’un demi-pixel laisse la caméra telle quelle', () => {
    const c = { origine: point(0, 0), echelle: 0.001 }
    const tout = cam.bornerVue(c, depuisTaille(point(0, 0), 20, 10), VUE)
    // Le même contenu, mesuré un poil autrement (l'arrondi de l'écran) : pas de nouvelle correction.
    const remesure = depuisTaille(point(0.01, 0.01), 20, 10)
    expect(cam.bornerVue(tout, remesure, VUE)).toBe(tout)
  })

  test('les crans du bas, du minimum à 100 % : 40, 47, 57, 73 %', () => {
    const vus: number[] = []
    for (let e = 1; e > 0.41; ) vus.push(Math.round((e = cam.cranDessous(e, 0.4)) * 100))
    expect(vus).toEqual([73, 57, 47, 40])
    expect(Math.round(cam.cranDessus(0.4, 0.4) * 100)).toBe(47)
  })

  test('la courbe part de zéro et finit à un', () => {
    proche(cam.adoucir(0), 0)
    proche(cam.adoucir(1), 1)
    expect(cam.adoucir(0.25)).toBeLessThan(0.25)
    expect(cam.adoucir(0.75)).toBeGreaterThan(0.75)
  })

  test('l’animation finit sur sa cible', () => {
    const cible = cam.centree(point(50, 50), 2, VUE)
    const milieu = cam.animer(cam.CAMERA_DEPART, cible, 300, VUE)
    expect(milieu.fini).toBe(false)
    expect(milieu.camera.echelle > 1 && milieu.camera.echelle < 2).toBe(true)
    expect(cam.animer(cam.CAMERA_DEPART, cible, 600, VUE)).toEqual({ camera: cible, fini: true })
  })
})
