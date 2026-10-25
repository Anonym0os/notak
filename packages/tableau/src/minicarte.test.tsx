// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Minicarte } from './Minicarte'
import { type Boite, DELAI_MINICARTE, MINICARTE_MAX, cadreMinicarte, definirAffichageMinicarte, mondeMinicarte, versMinicarte, versToile } from './minicarteModele'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('la géométrie de la mini-carte', () => {
  it('le monde tient le contenu et la vue, avec un peu de vide autour', () => {
    const m = mondeMinicarte({ x: 0, y: 0, l: 100, h: 50 }, { x: 80, y: 40, l: 40, h: 30 })
    expect(m.x).toBeLessThan(0)
    expect(m.y).toBeLessThan(0)
    expect(m.x + m.l).toBeGreaterThan(120)
    expect(m.y + m.h).toBeGreaterThan(70)
  })

  it('le cadre garde les proportions dans 200 × 140, sans descendre sous 56 px de côté', () => {
    const large = cadreMinicarte({ x: 0, y: 0, l: 1000, h: 500 })
    expect([large.l, large.h]).toEqual([MINICARTE_MAX.l, 100])
    const haut = cadreMinicarte({ x: 0, y: 0, l: 100, h: 1000 })
    expect(haut.h).toBe(MINICARTE_MAX.h)
    expect(haut.l).toBe(56)
    expect(haut.dx).toBeGreaterThan(0)
  })

  it('un point de la mini-carte et le point de la toile qui lui répond font l’aller et retour', () => {
    const monde = { x: -20, y: 10, l: 400, h: 100 }
    const b = versMinicarte(monde, { x: 30, y: 40, l: 0, h: 0 })
    const p = versToile(monde, { x: b.x, y: b.y })
    expect(p.x).toBeCloseTo(30)
    expect(p.y).toBeCloseTo(40)
  })
})

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  vi.useFakeTimers()
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  definirAffichageMinicarte('mouvement')
  vi.useRealTimers()
})

const FORMES: Boite[] = [
  { x: 0, y: 0, l: 40, h: 20 },
  { x: 160, y: 100, l: 40, h: 20 },
]
const FENETRE = { l: 800, h: 600 }

function monter(vue: Boite, aller: (c: { x: number; y: number }) => void = () => {}, formes = vi.fn(() => FORMES)) {
  act(() => racine.render(<Minicarte lieu="tableau" version={FORMES} formes={formes} vue={vue} fenetre={FENETRE} aller={aller} />))
  return formes
}
const minicarte = () => hote.querySelector<HTMLElement>('.notak-minicarte')
const visible = () => !!minicarte()?.hasAttribute('data-visible')
const pointeur = (type: string, x: number, y: number) =>
  act(() => void minicarte()!.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 })))

describe('la mini-carte', () => {
  it('cachée à l’ouverture, sans même mesurer le contenu', () => {
    const formes = monter({ x: 0, y: 0, l: 80, h: 60 })
    expect(visible()).toBe(false)
    expect(formes).not.toHaveBeenCalled()
  })

  it('paraît quand la vue bouge, et s’efface un instant après le dernier mouvement', () => {
    monter({ x: 0, y: 0, l: 80, h: 60 })
    monter({ x: 10, y: 0, l: 80, h: 60 })
    expect(visible()).toBe(true)
    expect(hote.querySelectorAll('.notak-minicarte-forme')).toHaveLength(2)
    act(() => void vi.advanceTimersByTime(DELAI_MINICARTE - 100))
    monter({ x: 10, y: 0, l: 40, h: 30 })
    act(() => void vi.advanceTimersByTime(DELAI_MINICARTE - 100))
    expect(visible()).toBe(true)
    act(() => void vi.advanceTimersByTime(100))
    expect(visible()).toBe(false)
  })

  it('une fenêtre qu’on redimensionne ne la fait pas venir', () => {
    monter({ x: 0, y: 0, l: 80, h: 60 })
    act(() => racine.render(<Minicarte lieu="tableau" version={FORMES} formes={() => FORMES} vue={{ x: 0, y: 0, l: 90, h: 60 }} fenetre={{ l: 900, h: 600 }} aller={() => {}} />))
    expect(visible()).toBe(false)
  })

  it('« Toujours » la garde, « Jamais » la retire', () => {
    act(() => definirAffichageMinicarte('toujours'))
    monter({ x: 0, y: 0, l: 80, h: 60 })
    expect(visible()).toBe(true)
    act(() => definirAffichageMinicarte('jamais'))
    expect(minicarte()).toBeNull()
  })

  it('un clic hors du cadre de la vue y centre la vue ; tirer le cadre le promène en gardant la prise', () => {
    act(() => definirAffichageMinicarte('toujours'))
    const aller = vi.fn()
    const vue = { x: 0, y: 0, l: 80, h: 60 }
    monter(vue, aller)
    const monde = mondeMinicarte({ x: 0, y: 0, l: 200, h: 120 }, vue)
    // jsdom place la mini-carte en (0, 0) de l'écran : ses pixels sont ceux de la page.
    const coin = versMinicarte(monde, { x: 190, y: 110, l: 0, h: 0 })
    pointeur('pointerdown', coin.x, coin.y)
    expect(aller).toHaveBeenLastCalledWith({ x: expect.closeTo(190, 5), y: expect.closeTo(110, 5) })
    pointeur('pointerup', coin.x, coin.y)

    aller.mockClear()
    const champ = versMinicarte(monde, vue)
    // Pris à 10 px du centre du cadre, puis tiré de 20 px : la vue avance de 20 px de mini-carte, pas plus.
    pointeur('pointerdown', champ.x + champ.l / 2 + 10, champ.y + champ.h / 2)
    expect(aller).not.toHaveBeenCalled()
    pointeur('pointermove', champ.x + champ.l / 2 + 30, champ.y + champ.h / 2)
    const k = cadreMinicarte(monde).k
    expect(aller).toHaveBeenLastCalledWith({ x: expect.closeTo(40 + 20 / k, 5), y: expect.closeTo(30, 5) })
    pointeur('pointerup', 0, 0)
  })
})
