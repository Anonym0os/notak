import { describe, expect, it } from 'vitest'
import { declencheurDans, filtrer, sansDoublons } from './suggestion'

describe('le déclencheur', () => {
  it('@ en début de texte ou après une espace propose une personne', () => {
    expect(declencheurDans('@')).toEqual({ genre: 'mention', requete: '', longueur: 1 })
    expect(declencheurDans('Bonjour @Cl')).toEqual({ genre: 'mention', requete: 'Cl', longueur: 3 })
  })
  it('@ dans une adresse de courriel ne propose rien', () => {
    expect(declencheurDans('écrire à jean@exemple')).toBeNull()
  })
  it('[[ propose un tableau, titre à espaces compris', () => {
    expect(declencheurDans('voir [[Voyage à Li')).toEqual({ genre: 'tableau', requete: 'Voyage à Li', longueur: 13 })
  })
  it('une proposition refermée n’en est plus une', () => {
    expect(declencheurDans('[[Voyage]] puis')).toBeNull()
    expect(declencheurDans('@Claire merci')).toBeNull()
  })
})

describe('filtrer', () => {
  const gens = [
    { id: '1', libelle: 'Émilie Durand' },
    { id: '2', libelle: 'Claire Emile' },
    { id: '3', libelle: 'Zoé' },
  ]
  it('sans accent ni majuscule, les débuts d’abord', () => {
    expect(filtrer(gens, 'emi').map((p) => p.id)).toEqual(['1', '2'])
    expect(filtrer(gens, 'ZOE').map((p) => p.id)).toEqual(['3'])
  })
  it('sans requête, les premières', () => {
    expect(filtrer(gens, '', 2).map((p) => p.id)).toEqual(['1', '2'])
  })
  it('une personne ouverte deux fois n’est proposée qu’une', () => {
    expect(sansDoublons([...gens, gens[0]!]).length).toBe(3)
  })
})

describe('une citation dans le texte', () => {
  it('se lit par son nom dans le texte brut (recherche, résumé)', async () => {
    const { texteBrut } = await import('../../coeur/tableau')
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'mention', attrs: { id: 'u1', label: 'Claire' } }] },
        { type: 'paragraph', content: [{ type: 'lienTableau', attrs: { id: 'T', label: 'Voyage' } }] },
      ],
    }
    expect(texteBrut(doc)).toBe('@Claire\nVoyage')
  })
})

describe('les personnes proposées', () => {
  it('portent leur photo et leur courriel', async () => {
    const { personnesProposees } = await import('./Propositions')
    const contexte = {
      services: {
        presence: { autres: () => [], moi: () => ({ id: 'u1', nom: 'Moi', couleur: '#111111', photo: 'f1' }), ecouter: () => () => {}, signaler: () => {} },
        membres: () => [{ id: 'u2', nom: 'Ana', courriel: 'ana@exemple.fr' }],
      },
    } as never
    expect(personnesProposees(contexte)).toEqual([
      { id: 'u1', libelle: 'Moi', teinte: '#111111', photo: 'f1' },
      { id: 'u2', libelle: 'Ana', courriel: 'ana@exemple.fr' },
    ])
  })
})
