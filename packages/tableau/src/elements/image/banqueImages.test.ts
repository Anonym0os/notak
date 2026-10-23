// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import type { Image } from '../../coeur/tableau'
import type { ContexteToile, ImageDeBanque } from '../types'
import { basculerBanque, banqueOuverte, fermerBanque, lireHistorique, motsDuMenu, motsDuTitre, noterRecherche, poserImageDeBanque } from './banqueImages'

beforeEach(() => {
  localStorage.clear()
  fermerBanque()
})

describe('motsDuTitre', () => {
  it('ne garde que les mots qui disent quelque chose, et seulement s’il y en a plusieurs', () => {
    expect(motsDuTitre('Voyage à Lisbonne : été 2026 !')).toEqual(['voyage', 'lisbonne', 'été', '2026'])
    expect(motsDuTitre('Lisbonne')).toEqual([])
    expect(motsDuTitre('Le  de la')).toEqual([])
  })
})

describe('historique des recherches', () => {
  it('garde les recherches en minuscules, sans doublon, la plus récente en tête, dix au plus', () => {
    noterRecherche('Mer')
    noterRecherche('forêt')
    expect(noterRecherche('MER')).toEqual(['mer', 'forêt'])
    for (let i = 0; i < 15; i++) noterRecherche(`mot${i}`)
    expect(lireHistorique()).toHaveLength(10)
    expect(lireHistorique()[0]).toBe('mot14')
  })

  it('ignore un terme vide', () => {
    expect(noterRecherche('   ')).toEqual([])
  })

  it('survit à un stockage qui refuse', () => {
    const lire = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('refusé')
    })
    const ecrire = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('refusé')
    })
    expect(lireHistorique()).toEqual([])
    expect(noterRecherche('mer')).toEqual(['mer'])
    lire.mockRestore()
    ecrire.mockRestore()
  })

  it('range les mots du titre avant les recherches, sans doublon', () => {
    expect(motsDuMenu('Voyage Lisbonne', ['mer', 'voyage'])).toEqual(['voyage', 'lisbonne', 'mer'])
  })
})

describe('l’ouverture du panneau', () => {
  it('se bascule et se ferme', () => {
    expect(banqueOuverte()).toBe(false)
    basculerBanque()
    expect(banqueOuverte()).toBe(true)
    basculerBanque()
    expect(banqueOuverte()).toBe(false)
  })
})

describe('poserImageDeBanque', () => {
  const image: ImageDeBanque = { id: 1, vignette: 'https://v', grande: 'https://g', largeur: 4000, hauteur: 3000, auteur: 'Ana Lys', lienAuteur: '', lienPhoto: '' }
  const monde = (services: Record<string, unknown>) => {
    const magasin = creerMagasin({ titre: 'T', etiquettes: [], elements: [] })
    return { magasin, contexte: { magasin, services } as unknown as ContexteToile }
  }

  it('rapatrie l’image et la pose avec son crédit en légende', async () => {
    const rapatrier = vi.fn(async () => ({ id: 'f-1', type: 'image/jpeg' }))
    const { magasin, contexte } = monde({ rapatrier })
    expect(await poserImageDeBanque(image, { x: 200, y: 100 }, contexte)).toBe(true)
    expect(rapatrier).toHaveBeenCalledWith('https://g')
    const [e] = magasin.lire().elements
    const c = e!.contenu as Image
    expect(c).toMatchObject({ type: 'image', fichier: 'f-1', typeMime: 'image/jpeg', legende: 'Photo : Ana Lys, Pexels' })
    expect(c.largeurOrigine / c.hauteurOrigine).toBeCloseTo(4 / 3)
  })

  it('ne pose rien sans rapatriement ou en lecture seule', async () => {
    const a = monde({})
    expect(await poserImageDeBanque(image, { x: 0, y: 0 }, a.contexte)).toBe(false)
    const b = monde({ rapatrier: async () => ({ id: 'x', type: 'image/png' }), lectureSeule: true })
    expect(await poserImageDeBanque(image, { x: 0, y: 0 }, b.contexte)).toBe(false)
    expect(a.magasin.lire().elements).toHaveLength(0)
  })
})
