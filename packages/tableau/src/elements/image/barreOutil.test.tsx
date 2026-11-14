// @vitest-environment jsdom
import { act, useRef } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContexteToile } from '../types'
import { BarreOutil, useAmenerALaVue } from './barreOutil'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// La toile fait 1 000 × 700 px ; la carte de l'outil est loin à droite, hors de l'écran.
const mesure = HTMLElement.prototype.getBoundingClientRect
const boite = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect
beforeAll(() => {
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    if (this.classList.contains('notak-toile')) return boite(0, 0, 1000, 700)
    if (this.classList.contains('notak-carte')) return boite(1500, 200, 300, 200)
    return boite(0, 0, 0, 0)
  }
})
afterAll(() => {
  HTMLElement.prototype.getBoundingClientRect = mesure
})

let racine: Root
let hote: HTMLElement
let toile: HTMLElement
beforeEach(() => {
  const espace = document.createElement('div')
  espace.className = 'notak-espace'
  espace.dataset.theme = 'sombre'
  toile = document.createElement('div')
  toile.className = 'notak-toile'
  hote = document.createElement('div')
  hote.className = 'notak-carte'
  toile.append(hote)
  espace.append(toile)
  document.body.append(espace)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  toile.closest('.notak-espace')?.remove()
})

function Outil({ contexte, entiere }: { contexte: ContexteToile; entiere: boolean }) {
  const ancre = useRef<HTMLDivElement>(null)
  useAmenerALaVue(ancre, contexte, entiere)
  return (
    <div ref={ancre}>
      <BarreOutil etiquette="Outil">
        <button type="button">Valider</button>
      </BarreOutil>
    </div>
  )
}

const attendre = (ms: number) => act(async () => void (await new Promise((fin) => setTimeout(fin, ms))))

describe('les outils d’une image', () => {
  it('ouverts sur une image hors de l’écran, l’amènent dans la zone libre, une fois', async () => {
    const poserCamera = vi.fn()
    const contexte = { camera: { origine: { x: 0, y: 0 }, echelle: 1 }, poserCamera } as unknown as ContexteToile
    act(() => racine.render(<Outil contexte={contexte} entiere />))
    await attendre(100)
    expect(poserCamera).toHaveBeenCalledTimes(1)
    const [camera, enCours] = poserCamera.mock.calls[0]!
    expect(enCours).toBe(false)
    // La carte (centre à 1 650 px, 300 px du haut) vient au centre de la zone : la vue glisse vers la droite.
    expect(camera.echelle).toBe(1)
    expect(camera.origine.x).toBeGreaterThan(0)
    act(() => racine.render(<Outil contexte={contexte} entiere />))
    await attendre(100)
    expect(poserCamera).toHaveBeenCalledTimes(1)
  })

  it('posent leur barre sous la page, au thème de la toile', () => {
    const contexte = { camera: { origine: { x: 0, y: 0 }, echelle: 1 } } as unknown as ContexteToile
    act(() => racine.render(<Outil contexte={contexte} entiere={false} />))
    const barre = document.body.querySelector<HTMLElement>(':scope > [data-outil-image]')!
    expect(barre.getAttribute('role')).toBe('toolbar')
    expect(barre.style.colorScheme).toBe('dark')
  })
})
