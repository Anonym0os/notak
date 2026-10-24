import { describe, expect, it } from 'vitest'
import { type Arbre, type Id, docDepuisTexte } from '../../../coeur/tableau'
import { lignesDuPlan } from '../Plan'
import { correspondances } from '../Recherche'
import { porter } from './elements'
import { appliquerGeste } from './gestes'
import { ajouterEnfant, basculerRepli, enfantsDe, lire, nouvelArbre } from './sujets'

// Central ; A (A1, A2), B.
let a: Arbre = nouvelArbre('Central')
const c = lire(a).central
const ids: Record<string, Id> = {}
;[a, ids.A!] = ajouterEnfant(a, c, 'Alpha')
;[a, ids.B!] = ajouterEnfant(a, c, 'Bêta')
for (const n of ['A1', 'A2']) [a, ids[n]!] = ajouterEnfant(a, ids.A!, n)
const titre = () => 'X'

describe('le plan', () => {
  it('liste les sujets visibles dans l’ordre de lecture, avec leur profondeur', () => {
    expect(lignesDuPlan(lire(a)).map((x) => [a.sujets[x.id]!.titre, x.niveau])).toEqual([
      ['Central', 0],
      ['Alpha', 1],
      ['A1', 2],
      ['A2', 2],
      ['Bêta', 1],
    ])
    expect(lignesDuPlan(lire(basculerRepli(a, ids.A!))).map((x) => a.sujets[x.id]!.titre)).toEqual(['Central', 'Alpha', 'Bêta'])
  })

  it('Tab range un sujet sous son frère d’avant, Maj+Tab le remonte juste après son ancien parent', () => {
    const b = appliquerGeste(a, { type: 'indenter', id: ids.B! }, titre)!.arbre
    expect(enfantsDe(lire(b), ids.A!)).toEqual([ids.A1, ids.A2, ids.B])
    const d = appliquerGeste(b, { type: 'desindenter', id: ids.A2! }, titre)!.arbre
    expect(enfantsDe(lire(d), c)).toEqual([ids.A, ids.A2])
    expect(appliquerGeste(a, { type: 'indenter', id: ids.A! }, titre)).toBeNull()
  })
})

describe('la recherche dans la carte', () => {
  it('cherche dans les titres, les étiquettes et les notes, sans tenir compte des accents', () => {
    let b = porter(a, [ids.A1!], 'etiquettes', ['urgent'])
    b = porter(b, [ids.A2!], 'note', docDepuisTexte('voir le devis'))
    const l = lire(b)
    expect(correspondances(l, 'beta')).toEqual([ids.B])
    expect(correspondances(l, 'URGENT')).toEqual([ids.A1])
    expect(correspondances(l, 'devis')).toEqual([ids.A2])
    expect(correspondances(l, '  ')).toEqual([])
  })
})
