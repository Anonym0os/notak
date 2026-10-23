import { describe, expect, it } from 'vitest'
import type { Lien } from '../../coeur/tableau'
import { affichage, avecPartie } from './affichage'

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
})
