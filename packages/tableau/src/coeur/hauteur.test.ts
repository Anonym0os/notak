import { describe, expect, it } from 'vitest'
import { hauteurTiree } from './hauteur'

describe('hauteur tirée', () => {
  it('borne le haut quand le contenu dépasse', () => {
    expect(hauteurTiree(120, 300)).toEqual({ max: 12 })
  })

  it('garde de la place sous un contenu court', () => {
    expect(hauteurTiree(200, 60)).toEqual({ min: 20 })
  })

  it('rend la hauteur au contenu quand on s’en approche', () => {
    expect(hauteurTiree(110, 125)).toBeUndefined()
    expect(hauteurTiree(100, 100)).toBeUndefined()
  })

  it('ne descend jamais sous une ligne, ni sous deux quand il y en a plusieurs', () => {
    expect(hauteurTiree(10, 300)).toEqual({ max: 9 })
    expect(hauteurTiree(10, 58)).toBeUndefined()
  })
})
