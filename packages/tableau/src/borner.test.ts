// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { bornerMenu } from './borner'

/** Un menu dont le rectangle suit son `translate` et son éventuel retournement, comme le ferait la mise en page. */
function menu(rect: { left: number; top: number; width: number; height: number }, retourne?: { top: number }) {
  const el = document.createElement('div')
  el.getBoundingClientRect = () => {
    const [dx, dy] = (el.style.translate || '0px 0px').split(' ').map(parseFloat)
    const top = ('retourne' in el.dataset && retourne ? retourne.top : rect.top) + (dy ?? 0)
    const left = rect.left + (dx ?? 0)
    return { left, top, right: left + rect.width, bottom: top + rect.height, width: rect.width, height: rect.height, x: left, y: top, toJSON() {} }
  }
  return el
}

describe('bornerMenu', () => {
  it('laisse en place un menu qui tient', () => {
    window.innerWidth = 1000
    window.innerHeight = 800
    const el = menu({ left: 100, top: 100, width: 200, height: 100 })
    bornerMenu(el, 8)
    expect(el.style.translate).toBe('')
    expect('retourne' in el.dataset).toBe(false)
  })

  it('retourne vers le haut un menu qui dépasse en bas', () => {
    window.innerWidth = 1000
    window.innerHeight = 800
    const el = menu({ left: 100, top: 750, width: 200, height: 100 }, { top: 600 })
    bornerMenu(el, 8)
    expect('retourne' in el.dataset).toBe(true)
    expect(el.style.translate).toBe('')
  })

  it('glisse un menu qui dépasse à droite, et ne passe pas sous la barre de gauche', () => {
    window.innerWidth = 1000
    window.innerHeight = 800
    const droite = menu({ left: 900, top: 100, width: 200, height: 100 })
    bornerMenu(droite, 84)
    expect(droite.style.translate).toBe('-108px 0px')
    const gauche = menu({ left: 20, top: 100, width: 200, height: 100 })
    bornerMenu(gauche, 84)
    expect(gauche.style.translate).toBe('64px 0px')
  })
})
