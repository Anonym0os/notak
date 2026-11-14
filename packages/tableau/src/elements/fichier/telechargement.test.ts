// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Element } from '../../coeur/tableau'
import { ECART_TELECHARGEMENTS_MS } from '../../telecharger'
import type { ContexteToile } from '../types'
import { nomTelecharge, telecharger } from './telechargement'

let liens: { href: string | null; download: string }[]
beforeEach(() => {
  liens = []
  vi.useFakeTimers()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    liens.push({ href: this.getAttribute('href'), download: this.download })
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const image = (id: string, typeMime?: string): Element =>
  ({ id, x: 0, y: 0, largeur: 100, contenu: { type: 'image', fichier: `f-${id}`, largeurOrigine: 10, hauteurOrigine: 10, ...(typeMime ? { typeMime } : {}) } }) as Element
const fichier = (id: string, nom: string): Element => ({ id, x: 0, y: 0, largeur: 100, contenu: { type: 'fichier', fichier: `f-${id}`, nom, typeMime: 'application/pdf', taille: 12 } }) as Element
const contexte = { services: { fichiers: { adresse: async (f: string) => (f === 'f-perdu' ? null : `/api/fichiers/${f}`) } } } as unknown as ContexteToile

describe('télécharger les originaux choisis', () => {
  it('le nom : celui de l’envoi, sinon « image » et l’extension de son type', () => {
    expect(nomTelecharge(fichier('a', 'devis.pdf').contenu)).toBe('devis.pdf')
    expect(nomTelecharge(image('b', 'image/jpeg').contenu)).toBe('image.jpg')
    expect(nomTelecharge(image('c').contenu)).toBe('image.png')
    // Une sorte qui n'est pas une image ne lui donne pas son extension.
    expect(nomTelecharge(image('d', 'application/pdf').contenu)).toBe('image.png')
  })

  it('plusieurs partent l’un après l’autre, à un instant d’écart : l’app de Mac ne garderait que le dernier', async () => {
    const fini = telecharger([image('a', 'image/webp'), fichier('perdu', 'x.pdf'), fichier('b', 'devis.pdf'), image('c')], contexte)
    await vi.advanceTimersByTimeAsync(0)
    expect(liens).toEqual([{ href: '/api/fichiers/f-a', download: 'image.webp' }])
    await vi.advanceTimersByTimeAsync(ECART_TELECHARGEMENTS_MS)
    expect(liens).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(ECART_TELECHARGEMENTS_MS)
    await fini
    // Celui dont l'adresse ne se trouve pas est passé, sans attente pour rien.
    expect(liens).toEqual([
      { href: '/api/fichiers/f-a', download: 'image.webp' },
      { href: '/api/fichiers/f-b', download: 'devis.pdf' },
      { href: '/api/fichiers/f-c', download: 'image.png' },
    ])
  })
})
