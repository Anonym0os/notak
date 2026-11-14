import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { type Magasin, creerMagasin } from './magasin'
import { creerMagasinYjs } from './magasinYjs'
import { type Contenu, type Element, type Image, type Operation, docDepuisTexte, nouvelleNote } from './tableau'

/** Une photo à peine posée : ses couleurs ne sont pas encore lues. */
const photo = (id: string, x = 0): Element<Image> => ({ id, x, y: 0, largeur: 10, contenu: { type: 'image', fichier: `envoi-${id}`, largeurOrigine: 10, hauteurOrigine: 10 } })
const trouver = (m: Magasin, id: string) => m.lire().elements.find((e) => e.id === id)
/** Ses couleurs, lues après la pose : la correction type, qui n'est pas un geste de la personne. */
const colorer = (m: Magasin, id: string): Operation[] => {
  const { contenu } = trouver(m, id)!
  return [{ type: 'contenu', id, avant: contenu, apres: { ...contenu, couleurs: ['#aa0000'] } as Contenu }]
}
const couleurs = (m: Magasin, id: string) => (trouver(m, id)?.contenu as Image | undefined)?.couleurs
const place = (m: Magasin, id: string) => {
  const e = trouver(m, id)
  return e && [e.x, e.y]
}
const ids = (m: Magasin) => m.lire().elements.map((e) => e.id)

// Le magasin d'une toile seule, qui garde les opérations, et le partagé, qui garde ce qu'elles ont écrit dans un
// document relié à un autre poste.
for (const [nom, nouveau] of [
  ['en mémoire', () => creerMagasin({ titre: 'Toile', elements: [] })],
  [
    'partagé',
    () => {
      const [a, b] = [new Y.Doc(), new Y.Doc()]
      a.on('update', (u: Uint8Array) => Y.applyUpdate(b, u))
      return creerMagasinYjs(a)
    },
  ],
] as const) {
  describe(`corriger, magasin ${nom}`, () => {
    it('une correction écrite pendant un glisser : Annuler défait le glisser, puis la pose, puis le pas d’avant', () => {
      const m = nouveau()
      const n = nouvelleNote(0, 0)
      m.faire([{ type: 'creer', element: n }])
      m.faire([{ type: 'creer', element: photo('p', 20) }])
      m.appliquerSeulement([{ type: 'deplacer', id: n.id, de: [0, 0], vers: [5, 5] }])
      m.corriger(colorer(m, 'p'))
      m.appliquerSeulement([{ type: 'deplacer', id: n.id, de: [5, 5], vers: [9, 9] }])
      m.inscrire([{ type: 'deplacer', id: n.id, de: [0, 0], vers: [9, 9] }])
      expect(m.annuler()).toBe(true)
      expect(place(m, n.id)).toEqual([0, 0])
      expect(couleurs(m, 'p')).toEqual(['#aa0000'])
      expect(m.annuler()).toBe(true)
      expect(ids(m)).toEqual([n.id])
      expect(m.annuler()).toBe(true)
      expect(ids(m)).toEqual([])
      expect(m.annuler()).toBe(false)
      for (let i = 0; i < 3; i++) expect(m.retablir()).toBe(true)
      expect(place(m, n.id)).toEqual([9, 9])
      expect(couleurs(m, 'p')).toEqual(['#aa0000'])
    })

    it('une correction écrite pendant une saisie : Annuler défait la saisie, la note, puis la pose avec ses couleurs', () => {
      const m = nouveau()
      const n = nouvelleNote(30, 0)
      m.faire([{ type: 'creer', element: photo('p') }])
      m.faire([{ type: 'creer', element: n }])
      const [milieu, fin] = ['Bon', 'Bonjour'].map((texte): Contenu => ({ type: 'note', texte: docDepuisTexte(texte) }))
      m.appliquerSeulement([{ type: 'contenu', id: n.id, avant: n.contenu, apres: milieu! }])
      m.corriger(colorer(m, 'p'))
      m.appliquerSeulement([{ type: 'contenu', id: n.id, avant: milieu!, apres: fin! }])
      m.inscrire([{ type: 'contenu', id: n.id, avant: n.contenu, apres: fin! }])
      expect(m.annuler()).toBe(true)
      expect(trouver(m, n.id)?.contenu).toEqual(n.contenu)
      expect(m.annuler()).toBe(true)
      expect(ids(m)).toEqual(['p'])
      expect(couleurs(m, 'p')).toEqual(['#aa0000'])
      expect(m.annuler()).toBe(true)
      expect(ids(m)).toEqual([])
      expect(m.annuler()).toBe(false)
    })

    it('la photo qu’on glisse, corrigée en chemin : le glisser reste un pas, qui la ramène au départ, puis la pose s’annule', () => {
      const m = nouveau()
      m.faire([{ type: 'creer', element: photo('p') }])
      m.appliquerSeulement([{ type: 'deplacer', id: 'p', de: [0, 0], vers: [5, 0] }])
      m.corriger(colorer(m, 'p'))
      m.appliquerSeulement([{ type: 'deplacer', id: 'p', de: [5, 0], vers: [8, 0] }])
      m.inscrire([{ type: 'deplacer', id: 'p', de: [0, 0], vers: [8, 0] }])
      expect(couleurs(m, 'p')).toEqual(['#aa0000'])
      // Ses couleurs, le glisser défait, dépendent du magasin : le partagé rend la photo d'avant lui (voir `passerLaMain`).
      expect(m.annuler()).toBe(true)
      expect(place(m, 'p')).toEqual([0, 0])
      expect(m.annuler()).toBe(true)
      expect(ids(m)).toEqual([])
      expect(m.annuler()).toBe(false)
      expect(m.retablir()).toBe(true)
      expect(m.retablir()).toBe(true)
      expect(place(m, 'p')).toEqual([8, 0])
      expect(couleurs(m, 'p')).toEqual(['#aa0000'])
    })

    it('ne vide pas ce qu’on peut rétablir', () => {
      const m = nouveau()
      const n = nouvelleNote(30, 0)
      m.faire([{ type: 'creer', element: photo('p') }])
      m.faire([{ type: 'creer', element: n }])
      m.annuler()
      m.corriger(colorer(m, 'p'))
      expect(m.peutRetablir()).toBe(true)
      expect(m.retablir()).toBe(true)
      expect(ids(m)).toEqual(['p', n.id])
      expect(m.annuler()).toBe(true)
      expect(m.annuler()).toBe(true)
      expect(ids(m)).toEqual([])
      expect(m.annuler()).toBe(false)
    })

    it('corrigée quand son déplacement est défait, la photo se déplace de nouveau, revient corrigée, puis sa pose s’annule', () => {
      const m = nouveau()
      m.faire([{ type: 'creer', element: photo('p') }])
      m.faire([{ type: 'deplacer', id: 'p', de: [0, 0], vers: [5, 0] }])
      m.annuler()
      m.corriger(colorer(m, 'p'))
      expect(m.retablir()).toBe(true)
      expect(place(m, 'p')).toEqual([5, 0])
      expect(m.annuler()).toBe(true)
      expect(place(m, 'p')).toEqual([0, 0])
      expect(couleurs(m, 'p')).toEqual(['#aa0000'])
      expect(m.annuler()).toBe(true)
      expect(ids(m)).toEqual([])
      expect(m.annuler()).toBe(false)
      expect(m.retablir()).toBe(true)
      expect(couleurs(m, 'p')).toEqual(['#aa0000'])
    })

    it('n’est pas un pas : annuler la création l’emporte, rétablir la garde, et une seconde correction suit la première', () => {
      const m = nouveau()
      const n = nouvelleNote(1, 0)
      m.faire([{ type: 'creer', element: n }])
      m.corriger([{ type: 'deplacer', id: n.id, de: [1, 0], vers: [9, 0] }])
      m.corriger([{ type: 'deplacer', id: n.id, de: [9, 0], vers: [12, 0] }])
      m.corriger([{ type: 'redimensionner', id: n.id, de: n.largeur, vers: 40 }])
      expect(m.annuler()).toBe(true)
      expect(m.lire().elements).toEqual([])
      expect(m.annuler()).toBe(false)
      expect(m.retablir()).toBe(true)
      expect(m.lire().elements).toEqual([{ ...n, x: 12, largeur: 40 }])
      expect(m.retablir()).toBe(false)
    })

    it('rejoint le pas qui a créé l’élément, même si d’autres l’ont suivi', () => {
      const m = nouveau()
      const [n, o] = [nouvelleNote(1, 0), nouvelleNote(2, 0)]
      m.faire([{ type: 'creer', element: n }])
      m.faire([{ type: 'creer', element: o }])
      m.corriger([{ type: 'deplacer', id: n.id, de: [1, 0], vers: [9, 0] }])
      m.annuler()
      expect(m.lire().elements).toEqual([{ ...n, x: 9 }])
      m.annuler()
      expect(m.lire().elements).toEqual([])
      m.retablir()
      expect(m.lire().elements).toEqual([{ ...n, x: 9 }])
    })
  })
}
