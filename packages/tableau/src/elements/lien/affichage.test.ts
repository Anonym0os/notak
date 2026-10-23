import { describe, expect, it } from 'vitest'
import type { Lien } from '../../coeur/tableau'
import { LARGEUR_MEDIA_SEUL, affichage, aUnMedia, avecPartie, largeurMinLien, mediaSeul, proportionLien } from './affichage'

const lien: Lien = { type: 'lien', url: 'https://x.test', statut: 'pret' }

describe('affichage d’un lien', () => {
  it('montre tout par défaut', () => {
    expect(affichage(lien)).toEqual({ apercu: true, infos: true, legende: true })
  })

  it('cache puis remontre une partie, sans laisser de clé inutile', () => {
    const cache = avecPartie(lien, 'infos', false)
    expect(cache.sansInfos).toBe(true)
    expect(affichage(cache).infos).toBe(false)
    expect(avecPartie(cache, 'infos', true)).toEqual(lien)
  })

  it('refuse de cacher la dernière partie visible', () => {
    const deux = avecPartie(avecPartie(lien, 'apercu', false), 'legende', false)
    expect(avecPartie(deux, 'infos', false)).toBe(deux)
    expect(avecPartie(deux, 'apercu', true).sansApercu).toBeUndefined()
  })

  const video: Lien = { type: 'lien', url: 'https://youtu.be/dQw4w9WgXcQ', statut: 'pret' }
  const page: Lien = { type: 'lien', url: 'https://exemple.fr', statut: 'pret', apercu: { titre: 'T', image: 'https://exemple.fr/i.png' } as Lien['apercu'] }

  it('« média seul » cache en bloc le domaine, le titre et la légende, sous 12 UG comme sur demande', () => {
    expect(aUnMedia(video)).toBe(true)
    expect(aUnMedia(lien)).toBe(false)
    expect(affichage(video, 34)).toEqual({ apercu: true, infos: true, legende: true })
    expect(affichage({ ...video, sansInfos: true }, 34)).toEqual({ apercu: true, infos: false, legende: false })
    expect(affichage(video, LARGEUR_MEDIA_SEUL - 1)).toEqual({ apercu: true, infos: false, legende: false })
    // Sans média, rien à basculer : le texte reste.
    expect(mediaSeul({ ...lien, sansInfos: true }, 5)).toBe(false)
    expect(affichage({ ...lien, sansInfos: true }, 5).infos).toBe(true)
  })

  it('remettre l’aperçu remet tout montrer', () => {
    const seul = { ...page, sansInfos: true }
    const sans = avecPartie(seul, 'apercu', false)
    expect(avecPartie(sans, 'apercu', true).sansInfos).toBeUndefined()
  })

  it('largeur minimale : 4 UG avec un média montré, 17 sans', () => {
    expect(largeurMinLien(video)).toBe(4)
    expect(largeurMinLien({ ...video, sansApercu: true })).toBe(17)
    expect(largeurMinLien(lien)).toBe(17)
  })

  it('une vidéo seule garde ses proportions, une carte à texte est libre', () => {
    expect(proportionLien({ ...video, sansInfos: true })).toBeCloseTo(16 / 9)
    expect(proportionLien(video)).toBe(0)
  })
})
