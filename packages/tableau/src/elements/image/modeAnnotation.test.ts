import { afterEach, describe, expect, it, vi } from 'vitest'
import { annoter, etatAnnotation, terminerAnnotation } from './modeAnnotation'

afterEach(() => annoter(null))

describe('le mode dessin d’une image', () => {
  it('terminé de soi-même, il revient d’où on l’avait ouvert (la visionneuse), une fois', () => {
    const retour = vi.fn()
    annoter('a', { retour })
    terminerAnnotation()
    expect(etatAnnotation().id).toBeNull()
    expect(retour).toHaveBeenCalledTimes(1)
    terminerAnnotation()
    expect(retour).toHaveBeenCalledTimes(1)
  })

  it('refermé parce qu’on a choisi autre chose, il n’y revient pas', () => {
    const retour = vi.fn()
    annoter('a', { retour })
    annoter(null)
    expect(retour).not.toHaveBeenCalled()
  })

  it('passer à une autre image oublie où revenir', () => {
    const retour = vi.fn()
    annoter('a', { retour })
    annoter('b')
    terminerAnnotation()
    expect(retour).not.toHaveBeenCalled()
  })
})
