// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { jouerFin, jouerSortieFin } from './jouer'

/** Un écran de fin : son fond (posé par `poser`), la carte, et la vignette quand `vignette` est vrai. */
function ecran(poser: (el: HTMLElement) => void, vignette = false) {
  const fin = document.createElement('div')
  fin.className = 'notak-arbre-diapo-fin'
  poser(fin)
  const carte = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  carte.setAttribute('class', 'notak-arbre-diapo-fin-carte')
  fin.append(carte)
  if (vignette) {
    const v = document.createElement('div')
    v.className = 'notak-arbre-diapo-fin-vignette'
    fin.append(v)
    // jsdom ne pose rien : l'écran fait 1000 × 500, la vignette 200 × 100 en haut à droite.
    Object.defineProperty(fin, 'offsetWidth', { value: 1000 })
    fin.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 500, right: 1000, bottom: 500, x: 0, y: 0, toJSON() {} }) as DOMRect
    v.getBoundingClientRect = () => ({ left: 770, top: 30, width: 200, height: 100, right: 970, bottom: 130, x: 770, y: 30, toJSON() {} }) as DOMRect
  }
  document.body.append(fin)
  return fin
}

afterEach(() => document.body.replaceChildren())

describe('l’écran de fin', () => {
  it('garde son fond après l’apparition : posé en background-color', async () => {
    const fin = ecran((el) => (el.style.backgroundColor = 'var(--notak-arbre-fond)'))
    const j = jouerFin(null, fin)
    j.achever()
    expect(await j.fini).toBe(true)
    expect(fin.style.backgroundColor).toBe('var(--notak-arbre-fond)')
  })

  it('garde son fond après l’apparition : posé par le raccourci background', async () => {
    const fin = ecran((el) => (el.style.background = 'var(--notak-arbre-fond)'))
    const j = jouerFin(null, fin)
    j.achever()
    await j.fini
    expect(fin.style.background).toContain('var(--notak-arbre-fond)')
  })

  it('« Merci » quitté disparaît dès la première image sous sa vignette, puis reste caché', async () => {
    const fin = ecran((el) => (el.style.backgroundColor = '#fff'), true)
    const merci = document.createElement('div')
    document.body.append(merci)
    const j = jouerFin(merci, fin, true)
    expect(merci.style.visibility).toBe('hidden')
    expect(merci.style.opacity).toBe('')
    j.achever()
    await j.fini
    expect(merci.style.visibility).toBe('hidden')
  })

  it('une autre diapositive quittée se fond', () => {
    const fin = ecran((el) => (el.style.backgroundColor = '#fff'), true)
    const autre = document.createElement('div')
    document.body.append(autre)
    const j = jouerFin(autre, fin, false)
    expect(autre.style.visibility).toBe('')
    expect(autre.style.opacity).toBe('1')
    j.arreter()
  })

  it('la sortie efface toute la scène, puis la laisse cachée sans rien y laisser', async () => {
    const scene = document.createElement('div')
    scene.style.background = '#000'
    document.body.append(scene)
    const j = jouerSortieFin(scene)
    expect(scene.style.opacity).toBe('1')
    j.achever()
    await j.fini
    expect(scene.style.opacity).toBe('')
    expect(scene.style.visibility).toBe('hidden')
    expect(scene.style.background).toContain('rgb(0, 0, 0)')
  })
})
