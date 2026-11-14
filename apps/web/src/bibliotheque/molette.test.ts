// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { decalageDeLaMolette, suivreLaMolette } from './molette'

const cran = (deltaY: number, autres: Partial<WheelEvent> = {}) => ({ deltaX: 0, deltaY, deltaMode: 0, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...autres })
/** Une rangée de 1 000 px vue sur 400, au début. */
const rangee = (scrollLeft = 0) => ({ scrollLeft, scrollWidth: 1000, clientWidth: 400 })
const pageQuiTient = { scrollHeight: 600, clientHeight: 600 }
const pageQuiDefile = { scrollHeight: 2400, clientHeight: 600 }

describe('la molette sur une rangée qui défile de côté', () => {
  it('laisse la page défiler quand elle le peut, comme le Finder et Drive', () => {
    expect(decalageDeLaMolette(cran(100), rangee(), pageQuiDefile)).toBe(0)
  })

  it('passe à la rangée quand la page n’a rien à faire défiler, sans dépasser ses bouts', () => {
    expect(decalageDeLaMolette(cran(100), rangee(), pageQuiTient)).toBe(100)
    expect(decalageDeLaMolette(cran(-100), rangee(300), pageQuiTient)).toBe(-100)
    expect(decalageDeLaMolette(cran(100), rangee(550), pageQuiTient)).toBe(50)
    expect(decalageDeLaMolette(cran(100), rangee(600), pageQuiTient)).toBe(0)
    expect(decalageDeLaMolette(cran(-100), rangee(0), pageQuiTient)).toBe(0)
    // Des lignes (Firefox) se comptent en pixels.
    expect(decalageDeLaMolette(cran(3, { deltaMode: 1 }), rangee(), pageQuiTient)).toBe(48)
  })

  it('ne touche ni à un geste de côté, ni au zoom, ni à Maj + molette, ni à une rangée qui tient', () => {
    expect(decalageDeLaMolette(cran(10, { deltaX: 40 }), rangee(), pageQuiTient)).toBe(0)
    expect(decalageDeLaMolette(cran(100, { ctrlKey: true }), rangee(), pageQuiTient)).toBe(0)
    expect(decalageDeLaMolette(cran(100, { shiftKey: true }), rangee(), pageQuiTient)).toBe(0)
    expect(decalageDeLaMolette(cran(100), { scrollLeft: 0, scrollWidth: 400, clientWidth: 400 }, pageQuiTient)).toBe(0)
  })

  it('prend le cran à la page quand la rangée le fait défiler, et le lui laisse sinon', () => {
    const el = document.createElement('ul')
    let gauche = 0
    Object.defineProperties(el, {
      scrollWidth: { value: 1000 },
      clientWidth: { value: 400 },
      scrollLeft: { get: () => gauche, set: (v: number) => void (gauche = v) },
    })
    const page = Object.defineProperties(document.createElement('main'), { scrollHeight: { value: 600, writable: true }, clientHeight: { value: 600 } })
    const arreter = suivreLaMolette(el, () => page)
    const tourner = (deltaY: number) => {
      const e = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true })
      el.dispatchEvent(e)
      return e.defaultPrevented
    }
    expect([tourner(120), gauche]).toEqual([true, 120])
    // La page grandit (on a ouvert d'autres rubriques) : la molette lui revient.
    Object.defineProperty(page, 'scrollHeight', { value: 2400 })
    expect([tourner(120), gauche]).toEqual([false, 120])
    arreter()
    Object.defineProperty(page, 'scrollHeight', { value: 600 })
    expect([tourner(120), gauche]).toEqual([false, 120])
  })
})
