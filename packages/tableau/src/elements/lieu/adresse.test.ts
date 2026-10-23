import { describe, expect, test } from 'vitest'
import { lieuVide, requete, resume, urlCarte } from './adresse'

describe('le lieu', () => {
  test('la recherche met le nom avant l’adresse, sur une ligne', () => {
    expect(requete({ type: 'lieu', nom: 'Café Rouge', adresse: '12 rue des Lilas\n75020 Paris' })).toBe('Café Rouge, 12 rue des Lilas 75020 Paris')
    expect(requete({ type: 'lieu', adresse: '  1 place Bellecour ' })).toBe('1 place Bellecour')
  })

  test('le lien encode la recherche', () => {
    expect(urlCarte({ type: 'lieu', adresse: '5 rue de l’Église & co' })).toBe(
      'https://www.openstreetmap.org/search?query=5%20rue%20de%20l%E2%80%99%C3%89glise%20%26%20co',
    )
  })

  test('sans nom ni adresse, pas de lien', () => {
    expect(urlCarte({ type: 'lieu', adresse: '   ' })).toBeNull()
    expect(lieuVide({ type: 'lieu', adresse: ' ', nom: '' })).toBe(true)
    expect(lieuVide({ type: 'lieu', adresse: '', nom: 'Gare' })).toBe(false)
  })

  test('le résumé prend le nom, sinon la première ligne de l’adresse', () => {
    expect(resume({ type: 'lieu', nom: 'Gare', adresse: 'x' })).toBe('Gare')
    expect(resume({ type: 'lieu', adresse: '3 rue A\n75000 Paris' })).toBe('3 rue A')
    expect(resume({ type: 'lieu', adresse: '' })).toBe('Lieu')
  })
})
