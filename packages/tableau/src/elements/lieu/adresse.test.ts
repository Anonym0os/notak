import { describe, expect, test } from 'vitest'
import { avecPosition, lieuVide, positionValable, requete, resume, urlCarte, urlCarteIntegree } from './adresse'

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

describe('la carte intégrée', () => {
  test('l’adresse de la carte porte un cadre autour du point et une épingle', () => {
    const u = new URL(urlCarteIntegree({ lat: 48.8566, lon: 2.3522 }))
    expect(u.origin + u.pathname).toBe('https://www.openstreetmap.org/export/embed.html')
    expect(u.searchParams.get('marker')).toBe('48.85660,2.35220')
    const [o, s, e, n] = u.searchParams.get('bbox')!.split(',').map(Number)
    expect(o! < 2.3522 && 2.3522 < e!).toBe(true)
    expect(s! < 48.8566 && 48.8566 < n!).toBe(true)
  })

  test('la position gardée ne vaut que pour l’adresse qui l’a donnée', () => {
    const lieu = avecPosition({ type: 'lieu', adresse: '1 place Bellecour' }, { lat: 45.757, lon: 4.832 })
    expect(positionValable(lieu)).toMatchObject({ lat: 45.757, lon: 4.832 })
    expect(positionValable({ ...lieu, adresse: '2 place Bellecour' })).toBeUndefined()
  })

  test('une adresse introuvable ne laisse aucune position', () => {
    const lieu = avecPosition({ type: 'lieu', adresse: 'x' }, { lat: 1, lon: 2 })
    expect(avecPosition(lieu, null).position).toBeUndefined()
    expect(avecPosition(lieu, { lat: Number.NaN, lon: 2 }).position).toBeUndefined()
  })
})
