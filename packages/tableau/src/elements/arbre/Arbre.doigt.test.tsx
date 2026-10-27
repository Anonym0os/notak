// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Arbre, Element as ElementToile } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { RenduArbre } from './Arbre'
import { ajouterEnfant, lire, nouvelArbre } from './modele/sujets'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** La carte mentale au doigt : écrire un sujet, poser un flottant, ouvrir le menu, tirer la vue, sans souris. */

const racines: { unmount(): void }[] = []
beforeEach(() => {
  HTMLElement.prototype.setPointerCapture ??= () => {}
  HTMLElement.prototype.releasePointerCapture ??= () => {}
  document.elementsFromPoint ??= () => []
})
afterEach(() => {
  for (const r of racines.splice(0)) act(() => r.unmount())
  document.body.innerHTML = ''
  vi.useRealTimers()
})

function ouvrir(contenu: Arbre) {
  let element: ElementToile<Arbre> = { id: 'k', x: 0, y: 0, largeur: 40, contenu }
  const ecouteurs = new Set<() => void>()
  const contexte = {
    magasin: { lire: () => ({ elements: [element] }), ecouter: (f: () => void) => (ecouteurs.add(f), () => ecouteurs.delete(f)), annuler() {}, retablir() {} },
    services: {},
    finirEdition() {},
  } as unknown as ContexteToile
  const hote = document.createElement('div')
  document.body.appendChild(hote)
  const racine = createRoot(hote)
  racines.push(racine)
  const changer = (a: Arbre) => {
    element = { ...element, contenu: a }
    ecouteurs.forEach((f) => f())
  }
  act(() => racine.render(<RenduArbre element={element} choisie brouillon={() => {}} enEdition contexte={contexte} changer={changer} />))
  return { courant: () => element.contenu }
}

/** Un évènement de doigt (jsdom n'a pas de PointerEvent : un MouseEvent qui en a les champs). */
function doigt(cible: Element, type: string, instant: number, x = 200, y = 120, id = 1) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y })
  Object.defineProperties(e, { pointerType: { value: 'touch' }, pointerId: { value: id }, isPrimary: { value: id === 1 }, timeStamp: { value: instant } })
  act(() => void cible.dispatchEvent(e))
}
const toucher = (cible: Element, instant: number, x = 200, y = 120) => {
  doigt(cible, 'pointerdown', instant, x, y)
  doigt(cible, 'pointerup', instant + 40, x, y)
}

const surface = () => document.querySelector('.notak-arbre-surface')!
const sujet = (titre: string) => [...document.querySelectorAll('.notak-arbre-surface [data-sujet]')].find((s) => s.textContent === titre)!
function base() {
  const a = nouvelArbre('Central')
  return ajouterEnfant(a, lire(a).central, 'Idées')[0]
}

describe('la carte mentale au doigt', () => {
  it('un toucher choisit un sujet, un second toucher l’écrit', () => {
    ouvrir(base())
    toucher(sujet('Idées'), 1000)
    expect(document.querySelector('.notak-arbre-surface textarea')).toBeNull()
    toucher(sujet('Idées'), 2000)
    expect(document.querySelector('.notak-arbre-surface textarea, .notak-arbre-champ textarea, textarea')).not.toBeNull()
  })

  it('deux touchers rapprochés sur le fond posent un sujet flottant, une seule fois', () => {
    const c = ouvrir(base())
    const avant = lire(c.courant()).sujets.size
    toucher(surface(), 1000, 500, 400)
    toucher(surface(), 1200, 505, 402)
    act(() => void surface().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 505, clientY: 402 })))
    expect(lire(c.courant()).sujets.size).toBe(avant + 1)
  })

  it('un doigt resté posé sur un sujet ouvre son menu', () => {
    vi.useFakeTimers()
    ouvrir(base())
    doigt(sujet('Idées'), 'pointerdown', 1000)
    act(() => void vi.advanceTimersByTime(600))
    expect(document.querySelector('.notak-arbre-ctx')).not.toBeNull()
    doigt(sujet('Idées'), 'pointerup', 1650)
    expect(document.querySelector('.notak-arbre-ctx')).not.toBeNull()
  })

  it('un doigt qui glisse sur le fond tire la carte, sans tracer de cadre ni ouvrir de menu', () => {
    vi.useFakeTimers()
    ouvrir(base())
    const g = () => (document.querySelector('.notak-arbre-grand > g') as SVGGElement).style.transform
    const avant = g()
    doigt(surface(), 'pointerdown', 1000, 500, 400)
    doigt(surface(), 'pointermove', 1020, 560, 460)
    doigt(surface(), 'pointermove', 1040, 600, 500)
    act(() => void vi.advanceTimersByTime(600))
    doigt(surface(), 'pointerup', 1700, 600, 500)
    expect(g()).not.toBe(avant)
    expect(document.querySelector('.notak-arbre-cadre')).toBeNull()
    expect(document.querySelector('.notak-arbre-ctx')).toBeNull()
  })
})
