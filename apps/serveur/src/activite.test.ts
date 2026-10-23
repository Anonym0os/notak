import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { comparer, mentionnes, observer, regrouper, sansDoublons } from './activite.ts'
import type { LigneActivite } from './base.ts'
import { texte } from './essai.ts'

const note = (mot: string, champs: Record<string, unknown> = {}) => ({ id: 'n', x: 0, y: 0, largeur: 34, plan: 'a', contenu: { type: 'note', texte: texte(mot) }, ...champs })

describe('comparer deux états d’un élément', () => {
  it('une création, une suppression définitive', () => {
    expect(comparer('n', undefined, note('Idée'))).toMatchObject({ genre: 'cree', typeElement: 'note', libelle: 'Idée' })
    expect(comparer('n', note('Idée'), undefined)).toMatchObject({ genre: 'supprime', libelle: 'Idée' })
  })

  it('la corbeille jette puis restaure ; un élément déjà jeté ne dit plus rien', () => {
    expect(comparer('n', note('Idée'), note('Idée', { corbeille: 5 }))).toMatchObject({ genre: 'supprime' })
    expect(comparer('n', note('Idée', { corbeille: 5 }), note('Idée'))).toMatchObject({ genre: 'restaure' })
    expect(comparer('n', note('Idée', { corbeille: 5 }), undefined)).toBeNull()
    expect(comparer('n', undefined, note('Idée', { corbeille: 5 }))).toBeNull()
    expect(comparer('n', note('a', { corbeille: 5 }), note('b', { corbeille: 5 }))).toBeNull()
  })

  it('un contenu qui change est une modification, un déplacement lointain en est un autre', () => {
    expect(comparer('n', note('Idée'), note('Idée bis'))).toMatchObject({ genre: 'modifie', libelle: 'Idée bis' })
    expect(comparer('n', note('Idée'), note('Idée', { x: 30 }))).toMatchObject({ genre: 'deplace' })
  })

  it('l’effleurement, le changement de plan ou de largeur ne comptent pas', () => {
    expect(comparer('n', note('Idée'), note('Idée', { x: 2, y: 1 }))).toBeNull()
    expect(comparer('n', note('Idée'), note('Idée', { plan: 'b', largeur: 40 }))).toBeNull()
  })

  it('un fil de commentaires : sa naissance sans message est muette, chaque message est un commentaire', () => {
    const fil = (...messages: { id: string; texte: string; auteur: { id: string } }[]) => ({
      id: 'c', x: 0, y: 0, largeur: 28, plan: 'a', contenu: { type: 'commentaire', messages },
    })
    const m1 = { id: 'm1', texte: 'Bonjour', auteur: { id: 'ana' } }
    const m2 = { id: 'm2', texte: 'Salut @Bob', auteur: { id: 'bob' } }
    expect(comparer('c', undefined, fil())).toBeNull()
    expect(comparer('c', undefined, fil(m1))).toMatchObject({ genre: 'commente', messages: [{ texte: 'Bonjour' }], participants: [] })
    expect(comparer('c', fil(), fil(m1))).toMatchObject({ genre: 'commente', messages: [{ texte: 'Bonjour' }], participants: [] })
    expect(comparer('c', fil(m1), fil(m1, m2))).toMatchObject({ genre: 'commente', libelle: 'Salut @Bob', participants: ['ana'] })
    expect(comparer('c', fil(m1), { ...fil(m1), contenu: { type: 'commentaire', messages: [m1], resolu: true } })).toMatchObject({ genre: 'modifie' })
  })
})

describe('observer un document', () => {
  it('ramasse ce qui change, pas ce qui précède l’observation', () => {
    const doc = new Y.Doc()
    doc.getMap('meta').set('titre', 'Avant')
    doc.getMap('elements').set('a', note('Déjà là', { id: 'a' }))
    const suivi = observer(doc)
    expect(suivi.ramasser()).toEqual([])

    doc.getMap('elements').set('b', note('Neuve', { id: 'b' }))
    doc.getMap('elements').set('a', note('Corrigée', { id: 'a' }))
    doc.getMap('meta').set('titre', 'Après')
    const pris = suivi.ramasser()
    expect(pris.map((c) => [c.genre, c.element])).toEqual([['cree', 'b'], ['modifie', 'a'], ['titre', '']])
    expect(suivi.ramasser()).toEqual([])
  })

  it('le texte d’une note, qui vit à part, compte comme une modification', () => {
    const doc = new Y.Doc()
    doc.getMap('elements').set('a', note('Texte', { id: 'a' }))
    const fragment = new Y.XmlFragment()
    doc.getMap('textes').set('a', fragment)
    const suivi = observer(doc)
    const paragraphe = new Y.XmlElement('paragraph')
    fragment.insert(0, [paragraphe])
    expect(suivi.ramasser()).toMatchObject([{ genre: 'modifie', element: 'a', typeElement: 'note' }])
  })

  it('un premier titre n’est pas un renommage', () => {
    const doc = new Y.Doc()
    const suivi = observer(doc)
    doc.getMap('meta').set('titre', 'Premier')
    expect(suivi.ramasser()).toEqual([])
  })

  it('une rafale de frappes ne fait qu’un changement par élément', () => {
    const rafale = [1, 2, 3].map(() => ({ genre: 'modifie' as const, element: 'a', typeElement: 'note', libelle: 'x' }))
    expect(sansDoublons(rafale)).toHaveLength(1)
  })
})

describe('mentions', () => {
  const gens = [
    { id: 'ana', nom: 'Ana Martin' },
    { id: 'anne', nom: 'Anne Durand' },
    { id: 'bob', nom: 'Bob Éclair' },
  ]
  it('le nom entier, ou le prénom s’il est seul à le porter, sans égard aux accents ni à la casse', () => {
    expect(mentionnes('Dis @bob eclair', gens)).toEqual(['bob'])
    expect(mentionnes('Dis @Bob !', gens)).toEqual(['bob'])
    expect(mentionnes('@Ana Martin et @anne durand', gens)).toEqual(['ana', 'anne'])
  })
  it('un prénom partagé, ou un mot qui le prolonge, ne désigne personne', () => {
    expect(mentionnes('@ana', [...gens, { id: 'ana2', nom: 'Ana Roy' }])).toEqual([])
    expect(mentionnes('@bobby', gens)).toEqual([])
    expect(mentionnes('bob@exemple.fr', gens)).toEqual([])
    expect(mentionnes('Bob sans arobase', gens)).toEqual([])
  })
})

describe('regrouper', () => {
  const ligne = (id: number, auteur: string, genre: LigneActivite['genre'], element: string, instant: number): LigneActivite => ({
    id, tableau: 't', auteur: { id: auteur, nom: auteur, couleur: '#000000' }, genre, element, typeElement: 'note', libelle: element, instant,
  })
  it('les gestes proches d’une même personne font une ligne ; un autre auteur, ou un long silence, en ouvre une autre', () => {
    const minute = 60_000
    const groupes = regrouper([
      ligne(6, 'ana', 'modifie', 'c', 100 * minute),
      ligne(5, 'ana', 'cree', 'b', 98 * minute),
      ligne(4, 'bob', 'modifie', 'a', 97 * minute),
      ligne(3, 'ana', 'modifie', 'a', 95 * minute),
      ligne(2, 'ana', 'cree', 'a', 94 * minute),
      ligne(1, 'ana', 'modifie', 'a', 50 * minute),
    ])
    expect(groupes.map((g) => [g.auteur.id, g.debut, g.fin])).toEqual([
      ['ana', 98 * minute, 100 * minute],
      ['bob', 97 * minute, 97 * minute],
      ['ana', 94 * minute, 95 * minute],
      ['ana', 50 * minute, 50 * minute],
    ])
    expect(groupes[0]!.resume).toEqual({ modifie: 1, cree: 1 })
    // Une note créée puis corrigée compte une fois, pour sa création.
    expect(groupes[2]!.resume).toEqual({ cree: 1 })
    expect(groupes[2]!.elements).toMatchObject([{ element: 'a', genre: 'cree' }])
  })
  it('rien à regrouper', () => {
    expect(regrouper([])).toEqual([])
  })
})
