// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { insererTexte, lire, poserSelection, rendre, selectionDe } from './richeDom'

const hotes: HTMLElement[] = []
function hote(): HTMLElement {
  const e = document.createElement('div')
  e.contentEditable = 'true'
  document.body.append(e)
  hotes.push(e)
  return e
}
afterEach(() => hotes.splice(0).forEach((e) => e.remove()))

describe('le texte riche dans un élément éditable', () => {
  it('ce qu’on écrit se relit à l’identique', () => {
    const e = hote()
    const passages = [
      { de: 0, a: 3, gras: true as const },
      { de: 4, a: 9, lien: 'https://exemple.fr' },
      { de: 10, a: 13, couleur: 'rouge', italique: true as const },
    ]
    rendre(e, 'abc defgh ijk', passages)
    expect(e.textContent).toBe('abc defgh ijk')
    expect(lire(e)).toEqual({ texte: 'abc defgh ijk', passages })
  })

  it('un retour à la ligne final reçoit sa sentinelle, qui ne compte pas dans le texte', () => {
    const e = hote()
    rendre(e, 'a\n', [])
    expect(e.querySelector('br[data-fin]')).not.toBeNull()
    expect(lire(e).texte).toBe('a\n')
  })

  it('le gras qu’un navigateur pose de lui-même se lit', () => {
    const e = hote()
    e.innerHTML = 'un <strong>deux</strong> trois'
    expect(lire(e).passages).toEqual([{ de: 3, a: 7, gras: true }])
  })

  it('la sélection va et vient entre le DOM et les décalages du texte', () => {
    const e = hote()
    rendre(e, 'abc defgh', [{ de: 4, a: 9, gras: true }])
    poserSelection(e, 2, 6)
    expect(selectionDe(e)).toEqual({ de: 2, a: 6 })
  })

  it('un texte inséré remplace la sélection', () => {
    const e = hote()
    rendre(e, 'abcdef', [])
    poserSelection(e, 2, 4)
    insererTexte(e, 'XY')
    expect(lire(e).texte).toBe('abXYef')
  })
})
