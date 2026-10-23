import { afterEach, describe, expect, it, vi } from 'vitest'
import { premierePage } from './apercuPdf'

afterEach(() => vi.unstubAllGlobals())

describe('première page d’un PDF', () => {
  it('un fichier qui ne se lit pas : pas d’aperçu', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }))
    expect(await premierePage('/api/fichiers/absent')).toBeNull()
  })

  it('le dessin est gardé par adresse : un seul calcul', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 500 }))
    const a = premierePage('/api/fichiers/deux')
    expect(premierePage('/api/fichiers/deux')).toBe(a)
    await a
  })

  it('un dessin qui traîne passe pour manqué au bout du délai', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => {}))
    expect(await premierePage('/api/fichiers/lent', 20)).toBeNull()
  })
})
