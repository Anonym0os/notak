import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APPUI_LONG, avalerLeClicSuivant, suivreAppuiLong } from './appuiLong'

/** Une fenêtre d'essai : de quoi écouter et envoyer des événements. */
const fenetre = () => new EventTarget() as unknown as Window
const pointeur = (type: string, x: number, y: number, pointerId = 1) => Object.assign(new Event(type), { clientX: x, clientY: y, pointerId })

describe('l’appui long', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('tient au bout d’une demi-seconde sans bouger, au point de départ', () => {
    const f = fenetre()
    const tenus: { x: number; y: number }[] = []
    suivreAppuiLong({ clientX: 10, clientY: 20, pointerId: 1 }, { tenu: (p) => tenus.push(p), fenetre: f })
    f.dispatchEvent(pointeur('pointermove', 14, 23))
    vi.advanceTimersByTime(APPUI_LONG - 1)
    expect(tenus).toEqual([])
    vi.advanceTimersByTime(1)
    expect(tenus).toEqual([{ x: 10, y: 20 }])
  })

  it('s’annule si le doigt bouge (on fait défiler), se lève, ou si le système le reprend', () => {
    for (const fin of [pointeur('pointermove', 10, 40), pointeur('pointerup', 10, 20), pointeur('pointercancel', 10, 20), new Event('scroll')]) {
      const f = fenetre()
      const tenu = vi.fn()
      suivreAppuiLong({ clientX: 10, clientY: 20, pointerId: 1 }, { tenu, fenetre: f })
      f.dispatchEvent(fin)
      vi.advanceTimersByTime(APPUI_LONG * 2)
      expect(tenu).not.toHaveBeenCalled()
    }
  })

  it('un autre doigt qui bouge ne l’annule pas', () => {
    const f = fenetre()
    const tenu = vi.fn()
    suivreAppuiLong({ clientX: 10, clientY: 20, pointerId: 1 }, { tenu, fenetre: f })
    f.dispatchEvent(pointeur('pointermove', 300, 300, 2))
    vi.advanceTimersByTime(APPUI_LONG)
    expect(tenu).toHaveBeenCalledOnce()
  })

  it('rend de quoi l’abandonner', () => {
    const f = fenetre()
    const tenu = vi.fn()
    const abandonner = suivreAppuiLong({ clientX: 0, clientY: 0, pointerId: 1 }, { tenu, fenetre: f })
    abandonner()
    vi.advanceTimersByTime(APPUI_LONG)
    expect(tenu).not.toHaveBeenCalled()
  })

  it('avale le clic du même geste, pas celui d’un nouvel appui', () => {
    const f = fenetre()
    avalerLeClicSuivant(f)
    const clic = new Event('click', { cancelable: true })
    f.dispatchEvent(clic)
    expect(clic.defaultPrevented).toBe(true)
    const suivant = new Event('click', { cancelable: true })
    f.dispatchEvent(suivant)
    expect(suivant.defaultPrevented).toBe(false)

    avalerLeClicSuivant(f)
    f.dispatchEvent(new Event('pointerdown'))
    const apresUnAppui = new Event('click', { cancelable: true })
    f.dispatchEvent(apresUnAppui)
    expect(apresUnAppui.defaultPrevented).toBe(false)
  })
})
