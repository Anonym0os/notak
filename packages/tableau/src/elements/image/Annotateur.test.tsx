// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Element, Image, TraitImage } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { t } from '../../langue'
import { Annotateur } from './Annotateur'
import { annoter } from './modeAnnotation'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom ne mesure rien et ne capture pas les pointeurs : une image de 200 × 100 px à l'écran suffit.
const mesure = HTMLElement.prototype.getBoundingClientRect
beforeAll(() => {
  HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100, x: 0, y: 0, toJSON: () => ({}) })
  globalThis.Element.prototype.setPointerCapture = () => {}
})
afterAll(() => {
  HTMLElement.prototype.getBoundingClientRect = mesure
})

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  annoter(null)
})

const element: Element<Image> = { id: 'i1', x: 0, y: 0, largeur: 20, contenu: { type: 'image', fichier: 'f1', largeurOrigine: 400, hauteurOrigine: 200 } }

function ouvrir(retour?: () => void) {
  const faire = vi.fn()
  const brouillon = vi.fn<(traits: TraitImage[] | null) => void>()
  const doubleClic = vi.fn()
  const contexte = { magasin: { faire, lire: () => ({ elements: [element] }) }, camera: { origine: { x: 0, y: 0 }, echelle: 1 }, services: {} } as unknown as ContexteToile
  act(() => {
    annoter('i1', { retour })
    racine.render(
      <div onDoubleClick={doubleClic}>
        <Annotateur element={element} contexte={contexte} brouillon={brouillon} />
      </div>,
    )
  })
  return { faire, brouillon, doubleClic, couche: hote.querySelector<HTMLElement>('.notak-annotation')! }
}

const pointeur = (cible: EventTarget, type: string, pointerId: number, x: number, y: number, pointerType = 'mouse') =>
  act(() => void cible.dispatchEvent(new PointerEvent(type, { pointerId, pointerType, button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true })))
const enregistrer = () => [...document.body.querySelectorAll<HTMLButtonElement>('[data-outil-image] button')].find((b) => b.textContent === t('croquis.enregistrer'))!

describe('dessiner sur une image', () => {
  it('un trait se tient d’un seul pointeur : un autre ne s’y mêle pas, ni ne le termine', () => {
    const { brouillon, couche } = ouvrir()
    pointeur(couche, 'pointerdown', 1, 20, 20)
    pointeur(couche, 'pointermove', 1, 60, 40)
    pointeur(couche, 'pointermove', 2, 190, 90)
    pointeur(couche, 'pointerup', 2, 190, 90)
    expect(enregistrer().disabled).toBe(true)
    const trace = brouillon.mock.calls.at(-1)![0]!
    expect(trace).toHaveLength(1)
    expect(trace[0]!.points).toEqual([[0.1, 0.2], [0.3, 0.4]])
    pointeur(couche, 'pointerup', 1, 60, 40)
    expect(enregistrer().disabled).toBe(false)
  })

  it('un second doigt posé pendant un trait au doigt (on pince la toile) efface ce trait', () => {
    const { brouillon, couche } = ouvrir()
    pointeur(couche, 'pointerdown', 1, 20, 20, 'touch')
    pointeur(couche, 'pointermove', 1, 60, 40, 'touch')
    pointeur(document.body, 'pointerdown', 2, 150, 50, 'touch')
    expect(brouillon.mock.calls.at(-1)![0]).toEqual([])
    pointeur(couche, 'pointerup', 1, 60, 40, 'touch')
    expect(enregistrer().disabled).toBe(true)
  })

  it('la couche se manie : le Pencil y dessine sur la photo, et un double-clic n’ouvre pas l’image en grand', () => {
    const { couche, doubleClic } = ouvrir()
    expect(couche.hasAttribute('data-poignee')).toBe(true)
    act(() => void couche.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    expect(doubleClic).not.toHaveBeenCalled()
  })

  it('Enregistrer pose les traits d’un pas et revient d’où on avait ouvert le dessin', () => {
    const retour = vi.fn()
    const { faire, couche } = ouvrir(retour)
    pointeur(couche, 'pointerdown', 1, 20, 20)
    pointeur(couche, 'pointermove', 1, 60, 40)
    pointeur(couche, 'pointerup', 1, 60, 40)
    act(() => enregistrer().click())
    expect(faire).toHaveBeenCalledTimes(1)
    expect(faire.mock.calls[0]![0][0].apres.traits).toHaveLength(1)
    expect(retour).toHaveBeenCalledTimes(1)
  })
})
