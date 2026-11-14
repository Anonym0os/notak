import { describe, expect, it } from 'vitest'
import { depuisTaille, point } from '../../coeur/geometrie'
import { creerMagasin } from '../../coeur/magasin'
import { nouvelleNote } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { raccourciArrangement } from './raccourcis'

/** Des images légendées (17,8 × 32,8 UG) posées en rangée, toutes choisies. */
function rangee(xs: number[]) {
  const elements = xs.map((x, k) => ({ ...nouvelleNote(x, 40, `${k}`), id: `i${k}` }))
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements })
  const contexte = {
    magasin,
    selection: new Set(elements.map((e) => e.id)),
    rect: (id: string) => {
      const e = magasin.lire().elements.find((x) => x.id === id)
      return e ? depuisTaille(point(e.x, e.y), 17.8, 32.8) : null
    },
  } as unknown as ContexteToile
  return { magasin, contexte, ys: () => magasin.lire().elements.map((e) => e.y), xs: () => magasin.lire().elements.map((e) => e.x) }
}
const LETTRES: Record<string, string> = { KeyH: 'h', KeyV: 'v', KeyW: 'w' }
/** Alt et la touche `code` d'un clavier QWERTY, comme le Mac la rend : `key` changé par Alt, `keyCode` la lettre. */
const touche = (code: string, cmdMaj = true) =>
  ({ key: 'Dead', code, keyCode: LETTRES[code]!.toUpperCase().charCodeAt(0), altKey: true, metaKey: cmdMaj, ctrlKey: false, shiftKey: cmdMaj }) as KeyboardEvent

describe('les raccourcis de l’arrangement', () => {
  it('⌥⇧⌘V sur une rangée : rien ne descend, et la touche est prise (le navigateur n’en fait pas un collage)', () => {
    const { contexte, ys, magasin } = rangee([0, 19, 38])
    expect(raccourciArrangement(touche('KeyV'), contexte)).toBe(true)
    expect(ys()).toEqual([40, 40, 40])
    expect(magasin.peutAnnuler()).toBe(false)
  })

  it('⌥⇧⌘H sur la même rangée : des écarts égaux, en un seul pas d’annulation', () => {
    const { contexte, xs, magasin } = rangee([0, 19, 41])
    expect(raccourciArrangement(touche('KeyH'), contexte)).toBe(true)
    expect(xs()).toEqual([0, 21, 42])
    magasin.annuler()
    expect(xs()).toEqual([0, 19, 41])
  })

  it('Alt+W sur une rangée déjà alignée : pris aussi, sans pas d’annulation vide', () => {
    const { contexte, magasin } = rangee([0, 19, 38])
    expect(raccourciArrangement(touche('KeyW', false), contexte)).toBe(true)
    expect(magasin.peutAnnuler()).toBe(false)
  })

  it('sans rien de choisi, la touche reste au navigateur', () => {
    const { contexte } = rangee([0, 19, 38])
    expect(raccourciArrangement(touche('KeyV'), { ...contexte, selection: new Set() } as unknown as ContexteToile)).toBe(false)
  })

  it('sur un Mac en AZERTY, ⌥A aligne à gauche et ⌥Z ne fait rien : la lettre marquée compte, pas la place QWERTY', () => {
    const { contexte, xs } = rangee([0, 25, 50])
    // La touche marquée A envoie `KeyQ` ; Alt en fait « æ » ; `keyCode` dit A.
    expect(raccourciArrangement({ key: 'æ', code: 'KeyQ', keyCode: 65, altKey: true } as KeyboardEvent, contexte)).toBe(true)
    expect(xs()).toEqual([0, 0, 0])
    // La touche marquée Q envoie `KeyA` : plus d'alignement à gauche caché sous elle, ni sous Z (`KeyW`) en haut.
    expect(raccourciArrangement({ key: '‡', code: 'KeyA', keyCode: 81, altKey: true } as KeyboardEvent, contexte)).toBe(false)
    expect(raccourciArrangement({ key: 'Â', code: 'KeyW', keyCode: 90, altKey: true } as KeyboardEvent, contexte)).toBe(false)
  })

  it('en QWERTZ, ⌥⇧⌘H répartit toujours : H n’a pas bougé', () => {
    const { contexte, xs } = rangee([0, 19, 41])
    expect(raccourciArrangement({ key: 'Ó', code: 'KeyH', keyCode: 72, altKey: true, metaKey: true, shiftKey: true } as KeyboardEvent, contexte)).toBe(true)
    expect(xs()).toEqual([0, 21, 42])
  })
})
