// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reparerToucher } from './toucher'

/** Un évènement de doigt (jsdom n'a pas de PointerEvent : un MouseEvent qui en a les champs). */
function doigt(cible: Element, type: string, instant: number, x = 10, y = 10) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y })
  Object.defineProperties(e, { pointerType: { value: 'touch' }, pointerId: { value: 1 }, isPrimary: { value: true }, timeStamp: { value: instant } })
  cible.dispatchEvent(e)
}
/** Le clic que WebKit tire lui-même. */
function clicDeWebKit(cible: Element) {
  cible.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

let fin: () => void
let bouton: HTMLButtonElement
let clics: number
beforeEach(() => {
  vi.useFakeTimers()
  document.body.innerHTML = '<button type="button"><span>Ajouter</span></button><input />'
  bouton = document.querySelector('button')!
  clics = 0
  bouton.addEventListener('click', () => clics++)
  document.elementFromPoint = () => bouton.firstElementChild
  fin = reparerToucher(window)
})
afterEach(() => {
  fin()
  vi.useRealTimers()
})

describe('le toucher qui n’arrive pas jusqu’au clic', () => {
  it('un toucher bref sans clic de WebKit reçoit son clic, une fois', () => {
    doigt(bouton.firstElementChild!, 'pointerdown', 0)
    doigt(bouton.firstElementChild!, 'pointerup', 80)
    vi.advanceTimersByTime(200)
    expect(clics).toBe(1)
  })

  it('quand WebKit tire le clic à temps, rien n’est ajouté', () => {
    doigt(bouton, 'pointerdown', 0)
    doigt(bouton, 'pointerup', 80)
    clicDeWebKit(bouton)
    vi.advanceTimersByTime(200)
    expect(clics).toBe(1)
  })

  it('le clic de WebKit qui arrive après le nôtre est absorbé', () => {
    doigt(bouton, 'pointerdown', 0)
    doigt(bouton, 'pointerup', 80)
    vi.advanceTimersByTime(100)
    clicDeWebKit(bouton)
    expect(clics).toBe(1)
  })

  it('un doigt qui glisse ou s’attarde ne clique pas', () => {
    doigt(bouton, 'pointerdown', 0, 10, 10)
    doigt(bouton, 'pointerup', 80, 60, 10)
    doigt(bouton, 'pointerdown', 1000)
    doigt(bouton, 'pointerup', 1900)
    vi.advanceTimersByTime(200)
    expect(clics).toBe(0)
  })

  it('un champ garde son comportement natif', () => {
    const champ = document.querySelector('input')!
    const vu = vi.fn()
    champ.addEventListener('click', vu)
    doigt(champ, 'pointerdown', 0)
    doigt(champ, 'pointerup', 50)
    vi.advanceTimersByTime(200)
    expect(vu).not.toHaveBeenCalled()
  })
})
