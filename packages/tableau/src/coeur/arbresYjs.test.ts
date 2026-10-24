import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { lireTableau } from '../export/contenu'
import { NOM_ARBRES } from './arbresYjs'
import { type MagasinYjs, creerMagasinYjs } from './magasinYjs'
import type { Arbre, Element } from './tableau'

const carte = (sujets: Arbre['sujets']): Element<Arbre> => ({ id: 'k', x: 0, y: 0, largeur: 40, contenu: { type: 'arbre', sujets } })
const arbre = (m: MagasinYjs) => m.lire().elements.find((e) => e.id === 'k')!.contenu as Arbre

/** Un geste sur la carte, calculé sur l'état que ce magasin voit, comme le fait la carte ouverte. */
function geste(m: MagasinYjs, f: (a: Arbre) => Arbre) {
  const avant = arbre(m)
  m.faire([{ type: 'contenu', id: 'k', avant, apres: f(avant) }])
}

/** Deux appareils qui partagent une carte, puis écrivent chacun de son côté sans se voir. */
function deuxAppareils() {
  const [da, db] = [new Y.Doc(), new Y.Doc()]
  const a = creerMagasinYjs(da)
  a.faire([{ type: 'creer', element: carte({ c: { ordre: 'V', titre: 'Central' } }) }])
  Y.applyUpdate(db, Y.encodeStateAsUpdate(da))
  const b = creerMagasinYjs(db)
  const synchroniser = () => {
    const [ua, ub] = [Y.encodeStateAsUpdate(da, Y.encodeStateVector(db)), Y.encodeStateAsUpdate(db, Y.encodeStateVector(da))]
    Y.applyUpdate(db, ua)
    Y.applyUpdate(da, ub)
  }
  return { a, b, da, db, synchroniser }
}

describe('deux personnes écrivent au même instant dans une carte', () => {
  it('deux sujets différents : les deux restent, des deux côtés', () => {
    const { a, b, synchroniser } = deuxAppareils()
    geste(a, (x) => ({ ...x, sujets: { ...x.sujets, s1: { parent: 'c', ordre: 'V', titre: 'Écrit par A' } } }))
    geste(b, (x) => ({ ...x, sujets: { ...x.sujets, s2: { parent: 'c', ordre: 'W', titre: 'Écrit par B' } } }))
    synchroniser()
    for (const m of [a, b]) expect(Object.keys(arbre(m).sujets).sort()).toEqual(['c', 's1', 's2'])
  })

  it('l’un renomme le central, l’autre ajoute un sujet : rien ne se perd', () => {
    const { a, b, synchroniser } = deuxAppareils()
    geste(a, (x) => ({ ...x, sujets: { ...x.sujets, c: { ordre: 'V', titre: 'Renommé' } } }))
    geste(b, (x) => ({ ...x, sujets: { ...x.sujets, s2: { parent: 'c', ordre: 'W', titre: 'Neuf' } } }))
    synchroniser()
    for (const m of [a, b]) {
      expect(arbre(m).sujets.c!.titre).toBe('Renommé')
      expect(arbre(m).sujets.s2!.titre).toBe('Neuf')
    }
  })

  it('le même sujet : une seule version gagne, la même des deux côtés', () => {
    const { a, b, synchroniser } = deuxAppareils()
    geste(a, (x) => ({ ...x, sujets: { ...x.sujets, c: { ordre: 'V', titre: 'A' } } }))
    geste(b, (x) => ({ ...x, sujets: { ...x.sujets, c: { ordre: 'V', titre: 'B' } } }))
    synchroniser()
    expect(arbre(a).sujets.c!.titre).toBe(arbre(b).sujets.c!.titre)
  })

  it('annuler ne défait que son propre geste', () => {
    const { a, b, synchroniser } = deuxAppareils()
    geste(a, (x) => ({ ...x, sujets: { ...x.sujets, s1: { parent: 'c', ordre: 'V', titre: 'A' } } }))
    geste(b, (x) => ({ ...x, sujets: { ...x.sujets, s2: { parent: 'c', ordre: 'W', titre: 'B' } } }))
    synchroniser()
    a.annuler()
    synchroniser()
    for (const m of [a, b]) expect(Object.keys(arbre(m).sujets).sort()).toEqual(['c', 's2'])
  })

  it('un sujet inchangé garde son objet : les vues mémorisées ne se recalculent pas pour rien', () => {
    const { a } = deuxAppareils()
    const avant = arbre(a).sujets
    a.faire([{ type: 'deplacer', id: 'k', de: [0, 0], vers: [5, 5] }])
    expect(arbre(a).sujets).toBe(avant)
  })
})

describe('les cartes écrites avant `arbres`', () => {
  it('se lisent telles quelles, et rangent leurs sujets au premier geste', () => {
    const doc = new Y.Doc()
    // Une carte d'avant : ses sujets dans l'élément lui-même.
    doc.getMap('elements').set('k', { ...carte({ c: { ordre: 'V', titre: 'Ancien' }, s: { parent: 'c', ordre: 'V', titre: 'Fils' } }), plan: 'V' })
    const m = creerMagasinYjs(doc)
    expect(Object.keys(arbre(m).sujets).sort()).toEqual(['c', 's'])
    geste(m, (x) => ({ ...x, sujets: { ...x.sujets, n: { parent: 'c', ordre: 'W', titre: 'Neuf' } } }))
    expect(Object.keys(arbre(m).sujets).sort()).toEqual(['c', 'n', 's'])
    expect((doc.getMap<Element>('elements').get('k')!.contenu as Arbre).sujets).toEqual({})
    expect(doc.getMap(NOM_ARBRES).size).toBe(3)
  })
})

describe('ce que lit le serveur', () => {
  it('l’export retrouve les sujets de la carte', () => {
    const { a, da } = deuxAppareils()
    geste(a, (x) => ({ ...x, sujets: { ...x.sujets, s1: { parent: 'c', ordre: 'V', titre: 'Lu par le serveur' } } }))
    const lu = lireTableau(da).elements.find((e) => e.id === 'k')!
    expect(Object.keys(lu.contenu.sujets as object).sort()).toEqual(['c', 's1'])
  })

  it('supprimer la carte emporte ses sujets', () => {
    const { a, da } = deuxAppareils()
    const e = a.lire().elements[0]!
    a.faire([{ type: 'supprimer', element: e }])
    expect(da.getMap(NOM_ARBRES).size).toBe(0)
    a.annuler()
    expect(Object.keys(arbre(a).sujets)).toEqual(['c'])
  })
})
