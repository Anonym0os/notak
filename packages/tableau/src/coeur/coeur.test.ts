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

  test('ce qu’un geste fait hors du tableau se défait et se refait avec lui', () => {
    const h = new Historique()
    const a = nouvelleNote(0, 0, 'a')
    const faits: string[] = []
    h.inscrire([{ type: 'creer', element: a }], { faire: () => faits.push('refait'), defaire: () => faits.push('défait') })
    h.annuler({ titre: '', elements: [a] })
    h.retablir(vide())
    expect(faits).toEqual(['défait', 'refait'])
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
    proche(cam.echelleMin(depuisTaille(point(0, 0), 20_000, 100), VUE), (1000 * 0.6) / 200_000)
  })

  test('le zoom va de 2 à 800 %', () => {
    expect(cam.ECHELLE_MIN_PLAFOND).toBe(0.02)
    expect(cam.ECHELLE_MAX).toBe(8)
    const g = new cam.GesteZoom()
    let e = 1
    for (let i = 0; i < 60; i++) e = g.appliquer(e, 1.2, 0.02, i * 16)
    expect(e).toBe(8)
    e = 1
    for (let i = 0; i < 60; i++) e = g.appliquer(e, 0.8, 0.02, 5_000 + i * 16)
    expect(e).toBe(0.02)
  })

  test('les crans du clavier montent et descendent dans l’ordre', () => {
    proche(cam.cranDessus(1, 0.4), 1.2)
    proche(cam.cranDessus(1.3, 0.4), 1.5)
    proche(cam.cranDessus(3, 0.4), 4)
    proche(cam.cranDessus(6, 0.4), 8)
    proche(cam.cranDessus(8, 0.4), 8)
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

  test('le cadrage d’un aperçu fait tout tenir sans grossir au-delà de 100 %', () => {
    expect(cam.cadrage(depuisTaille(point(0, 0), 10, 10), VUE)!.echelle).toBe(1)
    proche(cam.cadrage(depuisTaille(point(0, 0), 150, 10), VUE)!.echelle, 1000 / 1500 / 1.4)
    const c = cam.centreCamera(cam.cadrage(depuisTaille(point(100, -50), 40, 20), VUE)!, VUE)
    proche(c.x, 120)
    proche(c.y, -40)
    expect(cam.cadrage(null, VUE)).toBeNull()
  })

  test('ajuster ramène à 100 % quand on y est déjà, ou quand il irait dans le même sens', () => {
    expect(cam.revenirA100(0.5, 0.5)).toBe(true)
    expect(cam.revenirA100(0.4, 0.7)).toBe(true)
    expect(cam.revenirA100(2, 1.2)).toBe(true)
    expect(cam.revenirA100(1, 0.6)).toBe(false)
    expect(cam.revenirA100(0.7, 0.4)).toBe(false)
  })

  test('la vue va au-delà du contenu dans les quatre sens, jusqu’à n’en garder qu’un tiers, à tout zoom', () => {
    const grand = depuisTaille(point(0, 0), 400, 300)
    for (const echelle of [0.5, 1, 3]) {
      const k = cam.PX_PAR_UG * echelle
      const z = cam.zoneLibre(grand, VUE, echelle)!
      // Au plus haut : le haut du contenu descend aux deux tiers de l'écran, bien au-delà du milieu.
      proche(cam.versEcran({ origine: point(0, z.min.y), echelle }, grand.min).y, (2 / 3) * VUE.hauteur)
      // Au plus bas : son bas remonte au tiers ; à gauche et à droite, de même.
      proche(cam.versEcran({ origine: point(0, z.max.y), echelle }, grand.max).y, VUE.hauteur / 3)
      proche(cam.versEcran({ origine: point(z.min.x, 0), echelle }, grand.min).x, (2 / 3) * VUE.largeur)
      proche(cam.versEcran({ origine: point(z.max.x, 0), echelle }, grand.max).x, VUE.largeur / 3)
      // Dans la zone, la vue reste où on l'a mise ; au-delà, elle revient à son bord.
      const dedans = { origine: point(z.min.x + 1, z.min.y + 1), echelle }
      expect(cam.bornerVue(dedans, grand, VUE, false)).toBe(dedans)
      const loin = cam.bornerVue({ origine: point(z.min.x - 500 / k, z.max.y + 500 / k), echelle }, grand, VUE, false)
      proche(loin.origine.x, z.min.x)
      proche(loin.origine.y, z.max.y)
    }
    expect(cam.bornerVue(cam.CAMERA_DEPART, null, VUE)).toBe(cam.CAMERA_DEPART)
    expect(cam.zoneLibre(null, VUE, 1)).toBeNull()
  })

  test('une vue pas encore mesurée (cachée, ou au premier rendu) ne borne rien et ne retient rien', () => {
    const grand = depuisTaille(point(0, 0), 400, 300)
    const loin: cam.Camera = { origine: point(-900, -900), echelle: 1 }
    for (const v of [{ largeur: 0, hauteur: 0 }, { largeur: 1, hauteur: 1 }]) {
      expect(cam.zoneLibre(grand, v, 1)).toBeNull()
      expect(cam.bornerVue(loin, grand, v)).toBe(loin)
      expect(cam.tendre(loin, grand, v)).toBe(loin)
      expect(cam.detendre(loin, grand, v)).toBe(loin)
      expect(cam.rappeler(loin, grand, v, 16)).toBe(loin)
      const pas = cam.defilerTendu(loin, 30, 40, grand, v)
      expect([pas.origine.x, pas.origine.y]).toEqual([-903, -904])
    }
  })

  test('un contenu plus petit qu’un tiers de la vue s’y promène partout, sans jamais en sortir', () => {
    const petit = depuisTaille(point(0, 0), 20, 10)
    const z = cam.zoneLibre(petit, VUE, 1)!
    // Son coin peut toucher chaque bord de l'écran, pas davantage.
    proche(cam.versEcran({ origine: z.min, echelle: 1 }, petit.max).x, VUE.largeur)
    proche(cam.versEcran({ origine: z.min, echelle: 1 }, petit.max).y, VUE.hauteur)
    proche(cam.versEcran({ origine: z.max, echelle: 1 }, petit.min).x, 0)
    proche(cam.versEcran({ origine: z.max, echelle: 1 }, petit.min).y, 0)
  })

  test('dézoomé au point que tout tient, le contenu se recentre quand le zoom change', () => {
    const petit = depuisTaille(point(0, 0), 20, 10)
    const centre = cam.centreCamera(cam.bornerVue({ origine: point(300, 300), echelle: 0.25 }, petit, VUE), VUE)
    proche(centre.x, 10)
    proche(centre.y, 5)
  })

  test('au-delà de sa zone, la toile résiste de plus en plus, comme une liste d’iOS, sans jamais s’écarter d’une vue', () => {
    const d = 800
    // Au début, elle suit à peu près la moitié du geste (0,55, la constante d'UIScrollView) ; ensuite de moins en moins.
    proche(cam.tension(1, d), 0.55)
    let avant = 0
    let pente = Infinity
    for (let x = 50; x <= 5000; x += 50) {
      const y = cam.tension(x, d)
      expect(y).toBeGreaterThan(avant)
      expect(y - avant).toBeLessThan(pente)
      expect(y).toBeLessThan(d)
      pente = y - avant
      avant = y
    }
    // Tiré d'une demi-vue, elle n'en fait qu'un cinquième environ.
    expect(cam.tension(400, d)).toBeCloseTo(172.5, 0)
    for (const x of [0, 3, 120, 900]) proche(cam.traction(cam.tension(x, d), d), x)
  })

  test('un geste qui tire la vue au-delà la montre retenue, et la retrouve telle quelle en revenant', () => {
    const grand = depuisTaille(point(0, 0), 400, 300)
    const z = cam.zoneLibre(grand, VUE, 1)!
    const bord: cam.Camera = { origine: point(100, z.min.y), echelle: 1 }
    // Tirée vers le bas de 300 px au-delà du bord, elle n'en descend que 128.
    const tiree = cam.defiler(bord, 0, 300)
    const montree = cam.tendre(tiree, grand, VUE)
    proche(montree.origine.x, 100)
    proche((z.min.y - montree.origine.y) * cam.PX_PAR_UG, cam.tension(300, VUE.hauteur))
    proche(cam.detendre(montree, grand, VUE).origine.y, tiree.origine.y)
    // Dans la zone, rien ne la retient.
    expect(cam.tendre(bord, grand, VUE)).toBe(bord)
    // À la molette : des pas qui s'éloignent portent de moins en moins loin ; les mêmes pas en sens inverse la ramènent
    // exactement au bord.
    let c = bord
    const ecarts: number[] = []
    for (let i = 0; i < 5; i++) {
      c = cam.defilerTendu(c, 0, 60, grand, VUE)
      ecarts.push((z.min.y - c.origine.y) * cam.PX_PAR_UG)
    }
    for (let i = 1; i < 5; i++) expect(ecarts[i]! - ecarts[i - 1]!).toBeLessThan(i === 1 ? ecarts[0]! : ecarts[i - 1]! - ecarts[i - 2]!)
    for (let i = 0; i < 5; i++) c = cam.defilerTendu(c, 0, -60, grand, VUE)
    proche(c.origine.y, z.min.y)
  })

  test('lâchée au-delà, elle revient à son bord en ressort : sans rebond, en une demi-seconde environ', () => {
    const depart: cam.Camera = { origine: point(-80, -60), echelle: 1 }
    const cible: cam.Camera = { origine: point(-66, -53), echelle: 1 }
    expect(cam.revenir(depart, cible, 0).camera.origine).toEqual(depart.origine)
    let avant = depart.origine.y
    let fin = -1
    for (let t = 0; t <= 1000; t += 8) {
      const { camera: c, fini } = cam.revenir(depart, cible, t)
      // Toujours entre le départ et le bord, et toujours plus près : elle ne le dépasse jamais.
      expect(c.origine.y).toBeGreaterThanOrEqual(avant)
      expect(c.origine.y).toBeLessThanOrEqual(cible.origine.y)
      avant = c.origine.y
      if (fini && fin < 0) fin = t
    }
    expect(fin).toBeGreaterThan(350)
    expect(fin).toBeLessThan(650)
    expect(cam.revenir(depart, cible, fin).camera).toBe(cible)
  })

  test('l’élan d’un pavé tactile la fait rebondir sur son bord au lieu de l’y étirer', () => {
    const grand = depuisTaille(point(0, 0), 400, 300)
    const z = cam.zoneLibre(grand, VUE, 1)!
    // Lancée vers le haut à 3 600 px/s, au bord : l'élan envoie un pas toutes les 16 ms, chacun 5 % plus petit.
    let c: cam.Camera = { origine: point(100, z.min.y), echelle: 1 }
    let pas = 60
    let plusLoin = 0
    for (let i = 0; i < 120; i++, pas *= 0.95) {
      c = cam.defilerTendu(cam.rappeler(c, grand, VUE, 16), 0, pas, grand, VUE)
      plusLoin = Math.max(plusLoin, (z.min.y - c.origine.y) * cam.PX_PAR_UG)
    }
    // Elle s'écarte d'un peu plus d'un huitième de vue au plus, et l'élan éteint, elle est presque revenue.
    expect(plusLoin).toBeGreaterThan(40)
    expect(plusLoin).toBeLessThan(VUE.hauteur / 6)
    expect((z.min.y - c.origine.y) * cam.PX_PAR_UG).toBeLessThan(5)
    // Le premier pas d'un geste ne rappelle rien : il n'y a pas eu d'intervalle.
    expect(cam.rappeler(c, grand, VUE, 0)).toBe(c)
  })

  test('plus aucun élément dans la vue, barres ôtées', () => {
    const c: cam.Camera = { origine: point(0, 0), echelle: 1 }
    const dedans = depuisTaille(point(50, 40), 10, 10)
    const sousLEntete = depuisTaille(point(50, 0), 10, 5)
    const loin = depuisTaille(point(500, 500), 10, 10)
    expect(cam.rienEnVue([dedans, loin], c, VUE)).toBe(false)
    expect(cam.rienEnVue([loin], c, VUE)).toBe(true)
    // Ce que l'en-tête couvre ne se voit pas.
    expect(cam.rienEnVue([sousLEntete], c, VUE)).toBe(false)
    expect(cam.rienEnVue([sousLEntete], c, VUE, { haut: 68, gauche: 0 })).toBe(true)
    expect(cam.rienEnVue([], c, VUE)).toBe(true)
  })

  test('l’arrivée sur une toile jamais vue : à 100 %, au milieu de la place libre, ou son coin après les barres', () => {
    const degagement = { haut: 68, gauche: 90 }
    const ecran = (c: cam.Camera, p: { x: number; y: number }) => cam.versEcran(c, point(p.x, p.y))
    const coin = point(90 + cam.AIR_ARRIVEE, 68 + cam.AIR_ARRIVEE)
    // Plus large et plus haut que la vue : le coin du contenu juste après les barres, avec un peu d'air.
    const grand = depuisTaille(point(10, 5), 200, 150)
    const c = cam.arrivee(grand, VUE, degagement)
    expect(c.echelle).toBe(1)
    expect(ecran(c, grand.min)).toEqual(coin)
    // Trop large seulement : on commence aussi en haut, comme une page, pas au milieu de la hauteur.
    const large = depuisTaille(point(0, 0), 200, 20)
    expect(ecran(cam.arrivee(large, VUE, degagement), large.min)).toEqual(coin)
    // Petit : au milieu de ce que les barres laissent libre.
    const petit = depuisTaille(point(-30, 40), 20, 10)
    const p = cam.arrivee(petit, VUE, degagement)
    const [debut, fin] = [ecran(p, petit.min), ecran(p, petit.max)]
    proche((debut.x + fin.x) / 2, (90 + 1000) / 2)
    proche((debut.y + fin.y) / 2, (68 + 800) / 2)
    // Les bornes du document la laissent où elle est.
    expect(cam.bornerVue(c, grand, VUE, false)).toBe(c)
  })

  test('sans recentrage (un élément a bougé), la vue dézoomée reste où elle est tant qu’elle garde le contenu', () => {
    const c = { origine: point(-300, -250), echelle: 0.25 }
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

  test('sous 40 %, les crans descendent par 25, 15, 10, 5 % jusqu’au minimum', () => {
    const vus: number[] = []
    for (let e = 1; e > 0.021; ) vus.push(Math.round((e = cam.cranDessous(e, 0.02)) * 100))
    expect(vus).toEqual([73, 57, 47, 40, 25, 15, 10, 5, 2])
    // Un minimum qui tombe entre deux crans en devient un, et ceux d'en dessous partent.
    proche(cam.cranDessous(0.05, 0.03), 0.03)
    proche(cam.cranDessus(0.03, 0.03), 0.05)
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
