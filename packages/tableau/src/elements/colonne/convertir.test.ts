import { describe, expect, test } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import '../index'
import { toutesLesEntreesMenu } from '../registre'
import type { ContexteToile } from '../types'
import { type Tableau, appliquer, inverse, nouvelleColonne, nouvelleNote } from '../../coeur/tableau'
import { elementsDuTableau, pasDeConversion } from './convertir'

describe('convertir une colonne en tableau', () => {
  const colonne = { ...nouvelleColonne(10, 10, 'Voyage en Italie') }
  const [a, b] = [
    { ...nouvelleNote(0, 0, 'a'), parent: colonne.id, ordre: 'b' },
    { ...nouvelleNote(0, 0, 'b'), parent: colonne.id, ordre: 'a' },
  ]
  const avant: Tableau = { titre: '', elements: [colonne, a, b] }
  const pas = pasDeConversion(colonne, [a, b], 'T2')
  const apres = pas.reduce(appliquer, avant)

  test('la colonne devient la carte du tableau, du même identifiant, avec une icône trouvée par son titre', () => {
    const carte = apres.elements.find((e) => e.id === colonne.id)!
    expect(carte.contenu).toMatchObject({ type: 'tableau', cible: 'T2', icone: 'voyage' })
    expect(carte.largeur).toBe(10)
    expect(apres.elements).toHaveLength(1)
  })

  test('tout s’annule d’un coup', () => {
    const retour = [...pas].reverse().reduce((t, op) => appliquer(t, inverse(op)), apres)
    expect(retour.elements).toHaveLength(3)
    expect(retour.elements.find((e) => e.id === colonne.id)!.contenu.type).toBe('colonne')
  })

  test('les éléments partent dans l’ordre de la colonne, empilés', () => {
    const venus = elementsDuTableau([a, b], () => 6)
    expect(venus.map((e) => e.id)).toEqual([b.id, a.id])
    expect(venus.map((e) => [e.x, e.y])).toEqual([[5, 5], [5, 13]])
    expect(venus.every((e) => e.parent === undefined && e.ordre === undefined)).toBe(true)
  })
})

describe('une colonne neuve', () => {
  test('naît sans titre : la zone montre l’invite pâle', () => {
    expect(nouvelleColonne(0, 0).contenu.titre).toBe('')
  })
})

describe('« Convertir en tableau »', () => {
  test('les cartes de la colonne vont dans les non triés du tableau neuf, dans l’ordre de la colonne', () => {
    const colonne = nouvelleColonne(10, 10, 'Voyage en Italie')
    const [a, b] = [
      { ...nouvelleNote(0, 0, 'a'), parent: colonne.id, ordre: 'b' },
      { ...nouvelleNote(0, 0, 'b'), parent: colonne.id, ordre: 'a' },
    ]
    const magasin = creerMagasin({ titre: '', elements: [colonne, a, b] })
    const deposes: { cible: string; ids: string[]; nonTries: boolean | undefined }[] = []
    const contexte = {
      magasin,
      rect: () => null,
      services: {
        creerTableau: () => 'T9',
        deposerDans: (cible: string, elements: { id: string }[], nonTries?: boolean) => void deposes.push({ cible, ids: elements.map((e) => e.id), nonTries }),
      },
    } as unknown as ContexteToile
    const entree = toutesLesEntreesMenu().find((e) => e.libelle === 'Convertir en tableau')!
    entree.faire([colonne], contexte)
    expect(deposes).toEqual([{ cible: 'T9', ids: [b.id, a.id], nonTries: true }])
    expect(magasin.lire().elements.map((e) => e.contenu.type)).toEqual(['tableau'])
  })
})
