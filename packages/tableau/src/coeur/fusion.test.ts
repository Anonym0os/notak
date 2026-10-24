import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { fusionnerParCles } from './fusion'
import { creerMagasinYjs } from './magasinYjs'
import type { Arbre, Element } from './tableau'

const CLES = ['sujets']

describe('fusionner un geste par entrées', () => {
  it('ne touche que les entrées que le geste a changées', () => {
    const actuel = { type: 'x', sujets: { a: 1, b: 2, c: 3 } }
    const avant = { type: 'x', sujets: { a: 1, b: 1 } }
    const apres = { type: 'x', sujets: { a: 9, b: 1, d: 4 } }
    expect(fusionnerParCles(actuel, avant, apres, CLES)).toEqual({ type: 'x', sujets: { a: 9, b: 2, c: 3, d: 4 } })
  })

  it('retire ce que le geste a retiré', () => {
    expect(fusionnerParCles({ sujets: { a: 1, b: 2 } }, { sujets: { a: 1 } }, { sujets: {} }, CLES)).toEqual({ sujets: { b: 2 } })
  })

  it('les autres champs prennent la valeur du geste s’il les change', () => {
    expect(fusionnerParCles({ titre: 'x', n: 1 }, { titre: 'x', n: 1 }, { titre: 'y', n: 1 }, CLES)).toEqual({ titre: 'y', n: 1 })
    expect(fusionnerParCles({ titre: 'z' }, { titre: 'x' }, { titre: 'x' }, CLES)).toEqual({ titre: 'z' })
  })
})

describe('une carte mentale dans le magasin', () => {
  const carte = (sujets: Arbre['sujets']): Element<Arbre> => ({ id: 'k', x: 0, y: 0, largeur: 40, contenu: { type: 'arbre', sujets } })

  it('un geste calculé sur un état ancien ne défait pas ce qui a changé depuis', () => {
    const m = creerMagasinYjs(new Y.Doc())
    const depart = carte({ c: { ordre: 'V', titre: 'C' } })
    m.faire([{ type: 'creer', element: depart }])
    // Deux gestes partis du même état : l'un ajoute A, l'autre renomme le central.
    m.faire([{ type: 'contenu', id: 'k', avant: depart.contenu, apres: { type: 'arbre', sujets: { ...depart.contenu.sujets, a: { parent: 'c', ordre: 'V', titre: 'A' } } } }])
    m.faire([{ type: 'contenu', id: 'k', avant: depart.contenu, apres: { type: 'arbre', sujets: { c: { ordre: 'V', titre: 'Central' } } } }])
    const lu = m.lire().elements[0]!.contenu as Arbre
    expect(lu.sujets).toEqual({ c: { ordre: 'V', titre: 'Central' }, a: { parent: 'c', ordre: 'V', titre: 'A' } })
    // Annuler le renommage rend « C » sans retirer A.
    m.annuler()
    expect((m.lire().elements[0]!.contenu as Arbre).sujets).toEqual({ c: { ordre: 'V', titre: 'C' }, a: { parent: 'c', ordre: 'V', titre: 'A' } })
    m.detruire()
  })
})
