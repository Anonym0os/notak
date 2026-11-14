// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import type { Element, Image } from '../../coeur/tableau'
import { publierVue } from '../../vueZoom'
import type { ContexteToile } from '../types'
import { DELAI_ZOOM_POSE } from './copies'
import { RenduImage } from './Image'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Les décodages demandés, qu'on termine à la main : la copie suivante n'est prête qu'à ce moment. */
let decodages: { src: string; finir(): void }[]
/** L'observateur de la vue et ce qu'il suit : on dit à la main si la carte est à l'écran. */
let vue: { rappel?: IntersectionObserverCallback; suivis: Set<HTMLElement>; crees: number }
let racine: Root
let hote: HTMLElement

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(2)
  decodages = []
  ;(HTMLImageElement.prototype as { decode?: () => Promise<void> }).decode = function (this: HTMLImageElement) {
    return new Promise<void>((finir) => void decodages.push({ src: this.src, finir }))
  }
  vue = { suivis: new Set(), crees: 0 }
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(rappel: IntersectionObserverCallback) {
        vue.rappel = rappel
        vue.crees++
      }
      observe(noeud: HTMLElement) {
        vue.suivis.add(noeud)
      }
      unobserve(noeud: HTMLElement) {
        vue.suivis.delete(noeud)
      }
      disconnect() {
        vue.suivis.clear()
      }
    },
  )
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  publierVue(null, null)
  delete (HTMLImageElement.prototype as { decode?: unknown }).decode
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** Le contexte d'une toile à 100 % ; sa caméra se change en place, comme celle de la toile. */
const toile = () =>
  ({
    magasin: creerMagasin({ titre: '', etiquettes: [], elements: [] }),
    camera: { origine: { x: 0, y: 0 }, echelle: 1 },
    services: { fichiers: { enregistrer: async () => 'x', adresse: async () => '/api/fichiers/ab' } },
    finirEdition: () => {},
    commencerEdition: () => {},
  }) as unknown as ContexteToile & { camera: { echelle: number } }

/** Une photo d'iPhone de 48 Mpx posée sur 20 UG. */
async function poser() {
  const contexte = toile()
  const element: Element<Image> = {
    id: 'i1',
    x: 0,
    y: 0,
    largeur: 20,
    contenu: { type: 'image', fichier: 'f1', largeurOrigine: 8064, hauteurOrigine: 6048, typeMime: 'image/jpeg' },
  }
  await act(async () => {
    racine.render(<RenduImage element={element} choisie={false} enEdition={false} contexte={contexte} brouillon={() => {}} changer={() => {}} />)
  })
  return contexte
}

const peinte = () => hote.querySelector('img.notak-image')!.getAttribute('src')
/** La toile zoome : elle publie son échelle à chaque image du geste, et la caméra suit. */
const zoomer = (contexte: { camera: { echelle: number } }, echelle: number) =>
  act(() => {
    contexte.camera = { ...contexte.camera, echelle }
    publierVue({ echelle }, null)
  })
const attendre = (ms: number) => act(() => void vi.advanceTimersByTime(ms))
/** La carte entre dans la vue ou en sort. */
const aLEcran = (vu: boolean) =>
  act(() => vue.rappel!([...vue.suivis].map((target) => ({ isIntersecting: vu, target }) as unknown as IntersectionObserverEntry), {} as IntersectionObserver))

describe('la copie que peint la carte d’une photo', () => {
  it('passe à la copie au-dessus une fois le zoom posé, sans rien demander pendant le geste, et sans clignoter', async () => {
    const contexte = await poser()
    // 20 UG à 100 % : 200 px, 400 sur un écran Retina.
    expect(peinte()).toBe('/api/fichiers/ab?l=400')
    for (const echelle of [1.5, 2.5, 4]) {
      zoomer(contexte, echelle)
      await attendre(DELAI_ZOOM_POSE / 3)
    }
    expect(decodages).toEqual([])
    await attendre(DELAI_ZOOM_POSE)
    // 800 px à 400 %, 1600 sur un écran Retina : la copie se charge à part, la carte garde la sienne en attendant.
    expect(decodages.map((d) => d.src)).toEqual([expect.stringMatching(/\/api\/fichiers\/ab\?l=1600$/)])
    expect(peinte()).toBe('/api/fichiers/ab?l=400')
    await act(async () => decodages[0]!.finir())
    expect(peinte()).toBe('/api/fichiers/ab?l=1600')
  })

  it('à l’écran, elle ne redescend jamais quand on recule', async () => {
    const contexte = await poser()
    aLEcran(true)
    zoomer(contexte, 4)
    await attendre(DELAI_ZOOM_POSE)
    await act(async () => decodages[0]!.finir())
    zoomer(contexte, 1)
    await attendre(DELAI_ZOOM_POSE)
    expect(peinte()).toBe('/api/fichiers/ab?l=1600')
    expect(decodages).toHaveLength(1)
  })

  it('hors de l’écran, elle ne charge rien de plus grand ; elle le fait en y entrant, et revient en le quittant', async () => {
    const contexte = await poser()
    aLEcran(false)
    zoomer(contexte, 4)
    await attendre(DELAI_ZOOM_POSE)
    expect(decodages).toEqual([])
    expect(peinte()).toBe('/api/fichiers/ab?l=400')
    // Un défilement l'amène à l'écran : elle se remesure une fois la vue posée.
    aLEcran(true)
    expect(decodages).toEqual([])
    await attendre(DELAI_ZOOM_POSE)
    await act(async () => decodages[0]!.finir())
    expect(peinte()).toBe('/api/fichiers/ab?l=1600')
    // On recule, puis on passe à autre chose : sortie de l'écran, elle rend sa grande copie pour celle du zoom.
    zoomer(contexte, 1)
    await attendre(DELAI_ZOOM_POSE)
    aLEcran(false)
    await attendre(DELAI_ZOOM_POSE)
    expect(decodages.map((d) => d.src).at(-1)).toMatch(/\?l=400$/)
  })

  it('les cartes d’une toile partagent un seul observateur de la vue, rendu quand la dernière s’en va', async () => {
    const contexte = toile()
    const photo = (fichier: string): Element<Image> => ({ id: fichier, x: 0, y: 0, largeur: 20, contenu: { type: 'image', fichier, largeurOrigine: 4000, hauteurOrigine: 3000 } })
    await act(async () => {
      racine.render(
        <>
          {['f1', 'f2'].map((f) => (
            <RenduImage key={f} element={photo(f)} choisie={false} enEdition={false} contexte={contexte} brouillon={() => {}} changer={() => {}} />
          ))}
        </>,
      )
    })
    expect([vue.crees, vue.suivis.size]).toEqual([1, 2])
    act(() => racine.render(<></>))
    expect(vue.suivis.size).toBe(0)
  })

  it('une carte que traverse un défilement rapide ne charge rien', async () => {
    const contexte = await poser()
    aLEcran(false)
    zoomer(contexte, 4)
    await attendre(DELAI_ZOOM_POSE)
    aLEcran(true)
    await attendre(DELAI_ZOOM_POSE / 2)
    aLEcran(false)
    await attendre(DELAI_ZOOM_POSE)
    expect(decodages).toEqual([])
  })
})
