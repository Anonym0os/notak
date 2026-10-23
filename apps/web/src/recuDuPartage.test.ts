import { describe, expect, it } from 'vitest'
import { fauxCaches } from './fauxCaches'
import { CACHE_PARTAGE, arriveeDepuisParametres, lireArrivee, numeroDuPartage, oublierArrivee } from './recuDuPartage'

const ID = '123e4567-e89b-12d3-a456-426614174000'

describe('arriveeDepuisParametres', () => {
  it('lit le titre, le texte et l’adresse', () => {
    expect(arriveeDepuisParametres(new URLSearchParams('titre=A&texte=B&adresse=https%3A%2F%2Fx.fr'))).toEqual({ titre: 'A', texte: 'B', adresse: 'https://x.fr' })
  })
  it('rend null sans rien', () => {
    expect(arriveeDepuisParametres(new URLSearchParams(''))).toBeNull()
    expect(arriveeDepuisParametres(new URLSearchParams('titre=&autre=1'))).toBeNull()
  })
  it('borne la longueur d’un texte', () => {
    expect(arriveeDepuisParametres(new URLSearchParams({ texte: 'a'.repeat(50_000) }))?.texte).toHaveLength(20_000)
  })
})

describe('numeroDuPartage', () => {
  it('ne prend qu’un numéro bien formé', () => {
    expect(numeroDuPartage(`?recu=${ID}`)).toBe(ID)
    expect(numeroDuPartage('?recu=../../x')).toBeNull()
    expect(numeroDuPartage('')).toBeNull()
  })
})

async function ranger(stockage: ReturnType<typeof fauxCaches>) {
  const cache = await stockage.open(CACHE_PARTAGE)
  await cache.put(`/partage-recu/${ID}/0`, new Response('octets', { headers: { 'content-type': 'image/png', 'x-nom': encodeURIComponent('été.png') } }))
  await cache.put(
    `/partage-recu/${ID}`,
    new Response(JSON.stringify({ titre: 'T', texte: '', adresse: 'https://x.fr', fichiers: [`/partage-recu/${ID}/0`, '/partage-recu/autre/0', 3] })),
  )
  await cache.put('/partage-recu/autre/0', new Response('autre'))
}

describe('lireArrivee', () => {
  it('relit le partage rangé : texte, adresse et images avec leur nom et leur type', async () => {
    const s = fauxCaches()
    await ranger(s)
    const a = await lireArrivee(`?recu=${ID}`, s)
    expect(a).toMatchObject({ titre: 'T', adresse: 'https://x.fr' })
    expect(a?.texte).toBeUndefined()
    expect(a?.fichiers).toHaveLength(1)
    expect(a!.fichiers![0]).toMatchObject({ name: 'été.png', type: 'image/png' })
    expect(await a!.fichiers![0]!.text()).toBe('octets')
  })
  it('rend null quand le partage n’est plus là, ou sans cache', async () => {
    expect(await lireArrivee(`?recu=${ID}`, fauxCaches())).toBeNull()
    expect(await lireArrivee(`?recu=${ID}`, undefined as never)).toBeNull()
  })
  it('à défaut, lit l’adresse', async () => {
    expect(await lireArrivee('?texte=Bonjour', fauxCaches())).toEqual({ texte: 'Bonjour' })
    expect(await lireArrivee('', fauxCaches())).toBeNull()
  })
})

describe('oublierArrivee', () => {
  it('efface ce partage-là et pas les autres', async () => {
    const s = fauxCaches()
    await ranger(s)
    await oublierArrivee(`?recu=${ID}`, s)
    const cache = await s.open(CACHE_PARTAGE)
    expect(await cache.match(`/partage-recu/${ID}`)).toBeUndefined()
    expect(await cache.match(`/partage-recu/${ID}/0`)).toBeUndefined()
    expect(await cache.match('/partage-recu/autre/0')).toBeDefined()
  })
})
