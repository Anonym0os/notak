import { describe, expect, it } from 'vitest'
import { definirLangue } from '../langue'
import { CATALOGUE, TRANSFORMATIONS, chercher, couleurDeAttribut, couleurEnAttribut, declencheurSlash, tropLoin } from './catalogue'

definirLangue('fr')
const ids = (requete: string, entrees = CATALOGUE) => chercher(entrees, requete).map((e) => e.id)

describe('NOTION.md § 3 : le menu « / »', () => {
  it('s’ouvre sur `/` en tête de bloc ou après une espace, pas dans un mot ni sur `/ `', () => {
    expect(declencheurSlash('/')).toEqual({ requete: '', longueur: 1 })
    expect(declencheurSlash('voir /tit')).toEqual({ requete: 'tit', longueur: 4 })
    expect(declencheurSlash('et/ou')).toBeNull()
    expect(declencheurSlash('/ ')).toBeNull()
    expect(declencheurSlash('https://exemple.fr')).toBeNull()
  })

  it('la requête garde ses espaces après le premier caractère', () => {
    expect(declencheurSlash('/titre dé')?.requete).toBe('titre dé')
  })

  it('sans requête : les blocs, sans les couleurs ni les actions', () => {
    const tout = ids('')
    expect(tout[0]).toBe('texte')
    expect(tout.some((i) => i.startsWith('couleur-') || i.startsWith('action-'))).toBe(false)
  })

  it('cherche sans accent ni majuscule, sur le début des mots du nom et des mots-clés', () => {
    expect(ids('tit')).toEqual(expect.arrayContaining(['titre1', 'titre2', 'titre3', 'titreDeroulant1']))
    expect(ids('DEROUL')[0]).toBe('deroulant')
    expect(ids('todo')).toEqual(['tache'])
    expect(ids('h2')[0]).toBe('titre2')
    expect(ids('col3')).toEqual(['colonnes3'])
  })

  it('un mot-clé exact passe en tête', () => {
    expect(ids('#')[0]).toBe('titre1')
    expect(ids('---')[0]).toBe('separateur')
  })

  it('les couleurs et les actions se cherchent', () => {
    expect(ids('rouge')).toEqual(['couleur-rouge', 'couleur-rouge-fond'])
    expect(ids('fond bleu')).toEqual(['couleur-bleu-fond'])
    expect(ids('bleu f')[0]).toBe('couleur-bleu-fond')
    expect(ids('dupli')).toEqual(['action-dupliquer'])
  })

  it('se ferme quand rien ne répond depuis trois caractères', () => {
    expect(tropLoin('titrz', 4)).toBe(false)
    expect(tropLoin('titrzzz', 4)).toBe(true)
  })

  it('« Transformer en » ne propose que des blocs de texte', () => {
    expect(TRANSFORMATIONS.every((e) => e.effet.genre === 'vers')).toBe(true)
    expect(ids('sep', TRANSFORMATIONS)).toEqual([])
  })
})

describe('NOTION.md § 1 : les couleurs', () => {
  it('s’écrivent en attribut et se relisent', () => {
    expect(couleurEnAttribut({ nom: 'rouge', fond: false })).toBe('rouge')
    expect(couleurEnAttribut({ nom: 'rouge', fond: true })).toBe('rouge-fond')
    expect(couleurEnAttribut({ nom: 'defaut', fond: true })).toBeNull()
    expect(couleurDeAttribut('vert-fond')).toEqual({ nom: 'vert', fond: true })
    expect(couleurDeAttribut('fuchsia')).toBeNull()
  })
})
