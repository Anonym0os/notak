import { describe, expect, it } from 'vitest'
import { CAMERA_DEPART } from './camera'
import {
  type Espace,
  VUES_MAX,
  avancer,
  courantDe,
  creerEspace,
  espaceDepuis,
  lireVues,
  memoriserVue,
  ouvrir,
  parcoursDepart,
  reculer,
  tronquerFil,
} from './espace'
import { type Element, type Tableau, nouvelleNote } from './tableau'

const renvoi = (id: string, cible: string): Element => ({
  id,
  x: 0,
  y: 0,
  largeur: 12,
  contenu: { type: 'tableau', cible },
})
const tab = (id: string, titre: string, ...elements: Element[]): Tableau => ({ id, titre, elements })

/** a (racine) -> b -> c ; d n'est atteint par personne. */
const exemple = (): Espace => ({
  racine: 'a',
  tableaux: {
    a: tab('a', 'A', renvoi('ra', 'b')),
    b: tab('b', 'B', renvoi('rb', 'c')),
    c: tab('c', 'C'),
    d: tab('d', 'D'),
  },
})

describe('espace', () => {
  it('donne un magasin par tableau, gardé en cache, avec son historique', () => {
    const e = creerEspace(exemple())
    expect(e.magasin('a')).toBe(e.magasin('a'))
    const note = nouvelleNote(0, 0)
    e.magasin('b').faire([{ type: 'creer', element: note }])
    expect(e.magasin('b').lire().elements).toHaveLength(2)
    expect(e.magasin('c').annuler()).toBe(false)
    expect(e.magasin('b').annuler()).toBe(true)
    expect(e.magasin('b').lire().elements).toHaveLength(1)
  })

  it('prévient à chaque changement de n’importe quel tableau, et lire() reste stable entre deux', () => {
    const e = creerEspace(exemple())
    let n = 0
    const arret = e.ecouter(() => n++)
    const avant = e.lire()
    expect(e.lire()).toBe(avant)
    e.magasin('c').faire([{ type: 'creer', element: nouvelleNote(1, 1) }])
    e.creerTableau('E')
    expect(n).toBe(2)
    expect(e.lire()).not.toBe(avant)
    expect(e.lire().tableaux.c!.elements).toHaveLength(1)
    arret()
    e.creerTableau('F')
    expect(n).toBe(2)
  })

  it('crée un tableau vide, titré, sans couleur (tuile grise)', () => {
    const e = creerEspace(exemple())
    const id = e.creerTableau('Neuf')
    const t = e.lire().tableaux[id]!
    expect(t).toMatchObject({ id, titre: 'Neuf', elements: [] })
    expect(e.magasin(id).lire().titre).toBe('Neuf')
    expect(t.couleur).toBeUndefined()
  })

  it('renomme un tableau', () => {
    const e = creerEspace(exemple())
    e.renommer('c', 'Nouveau nom')
    expect(e.lire().tableaux.c!.titre).toBe('Nouveau nom')
  })

  it('trace le chemin de la racine, en suivant les renvois', () => {
    const e = creerEspace(exemple())
    expect(e.chemin('a')).toEqual(['a'])
    expect(e.chemin('b')).toEqual(['a', 'b'])
    expect(e.chemin('c')).toEqual(['a', 'b', 'c'])
    expect(e.parent('c')).toBe('b')
    expect(e.parent('a')).toBeNull()
  })

  it('suit un renvoi ajouté, et prend le plus court quand il y en a deux', () => {
    const e = creerEspace(exemple())
    e.magasin('a').faire([{ type: 'creer', element: renvoi('ra2', 'c') }])
    expect(e.chemin('c')).toEqual(['a', 'c'])
  })

  it('arrête le chemin d’un orphelin à lui-même', () => {
    const e = creerEspace(exemple())
    expect(e.chemin('d')).toEqual(['d'])
    expect(e.parent('d')).toBeNull()
    // Supprimer le renvoi vers b orpheline b et c.
    const ra = e.magasin('a').lire().elements[0]!
    e.magasin('a').faire([{ type: 'supprimer', element: ra }])
    expect(e.chemin('b')).toEqual(['b'])
    expect(e.chemin('c')).toEqual(['c'])
  })

  it('ne boucle pas sur des renvois circulaires', () => {
    const e = creerEspace(exemple())
    e.magasin('c').faire([{ type: 'creer', element: renvoi('rc', 'a') }])
    expect(e.chemin('c')).toEqual(['a', 'b', 'c'])
  })

  it('refuse un tableau inconnu', () => {
    expect(() => creerEspace(exemple()).magasin('z')).toThrow()
  })
})

describe('migration', () => {
  it('fait d’un ancien tableau la racine d’un espace', () => {
    const ancien: Tableau = { titre: 'Mon tableau', elements: [nouvelleNote(0, 0)] }
    const e = espaceDepuis(ancien)
    expect(Object.keys(e.tableaux)).toEqual([e.racine])
    expect(e.tableaux[e.racine]).toMatchObject({ id: e.racine, titre: 'Mon tableau' })
    expect(e.tableaux[e.racine]!.elements).toHaveLength(1)
  })

  it('garde l’id d’un ancien tableau qui en avait un, et laisse un espace tel quel', () => {
    expect(espaceDepuis({ id: 'x', titre: 'T', elements: [] }).racine).toBe('x')
    const e = exemple()
    expect(espaceDepuis(e)).toBe(e)
  })
})

describe('fil d’Ariane', () => {
  const l = (n: number) => Array.from({ length: n }, () => 100)

  it('montre tout ce qui tient', () => {
    expect(tronquerFil(l(4), 400, 30)).toEqual({ visibles: [0, 1, 2, 3], caches: [] })
  })

  it('garde le premier et les derniers, et cache le milieu', () => {
    // 6 segments de 100 dans 450 : premier (100) + « … » (30) + 3 derniers (300) = 430.
    expect(tronquerFil(l(6), 450, 30)).toEqual({ visibles: [0, 3, 4, 5], caches: [1, 2] })
  })

  it('garde toujours le dernier, même sans place', () => {
    expect(tronquerFil(l(5), 50, 30)).toEqual({ visibles: [0, 4], caches: [1, 2, 3] })
  })

  it('ne cache rien d’un fil de deux segments', () => {
    expect(tronquerFil(l(2), 10, 30).caches).toEqual([])
  })
})

describe('mémoire des vues', () => {
  const cam = (x: number) => ({ origine: { x, y: 0 }, echelle: 1 })

  it('note la vue d’un tableau sans toucher à l’objet d’avant', () => {
    const v0 = {}
    const v1 = memoriserVue(v0, 'a', cam(5), 1)
    expect(v0).toEqual({})
    expect(v1.a).toEqual({ camera: cam(5), t: 1 })
    expect(memoriserVue(v1, 'a', cam(9), 2).a!.camera).toEqual(cam(9))
  })

  it('oublie les plus anciennes au-delà du maximum', () => {
    let v = {}
    for (let i = 0; i < VUES_MAX + 20; i++) v = memoriserVue(v, `t${i}`, CAMERA_DEPART, i)
    expect(Object.keys(v)).toHaveLength(VUES_MAX)
    expect(v).not.toHaveProperty('t0')
    expect(v).toHaveProperty(`t${VUES_MAX + 19}`)
  })

  it('en relisant, écarte ce qui est mal formé', () => {
    const lues = lireVues({
      bon: { camera: cam(3), t: 7 },
      sans: { t: 1 },
      nan: { camera: { origine: { x: Number.NaN, y: 0 }, echelle: 1 }, t: 1 },
      zero: { camera: { origine: { x: 0, y: 0 }, echelle: 0 }, t: 1 },
    })
    expect(Object.keys(lues)).toEqual(['bon'])
    expect(lireVues(null)).toEqual({})
    expect(lireVues('x')).toEqual({})
  })
})

describe('navigation', () => {
  it('ouvre, recule, avance, et efface l’avant en ouvrant ailleurs', () => {
    let p = parcoursDepart('a')
    p = ouvrir(ouvrir(p, 'b'), 'c')
    expect(courantDe(p)).toBe('c')
    p = reculer(reculer(p))
    expect(courantDe(p)).toBe('a')
    expect(reculer(p)).toBe(p)
    p = avancer(p)
    expect(courantDe(p)).toBe('b')
    p = ouvrir(p, 'd')
    expect(p.pile).toEqual(['a', 'b', 'd'])
    expect(avancer(p)).toBe(p)
  })

  it('ne note pas deux fois le même tableau de suite', () => {
    const p = parcoursDepart('a')
    expect(ouvrir(p, 'a')).toBe(p)
  })
})
