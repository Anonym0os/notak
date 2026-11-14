// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BoutonRecentrer, DELAI_PASTILLE_ZOOM, PastilleZoom } from './PastilleZoom'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const monter = (echelle: number, remettre = () => {}) => act(() => racine.render(<PastilleZoom echelle={echelle} remettre={remettre} />))
const pastille = () => hote.querySelector<HTMLButtonElement>('.notak-zoom-pastille')!
const visible = () => pastille().hasAttribute('data-visible')

describe('la pastille du zoom', () => {
  it('reste cachée à l’ouverture, même sur un tableau déjà zoomé', () => {
    monter(1.5)
    expect(visible()).toBe(false)
  })

  it('paraît à chaque changement, avec le pourcentage', () => {
    monter(1)
    monter(1.5)
    expect(visible()).toBe(true)
    expect(pastille().textContent).toBe('150 %')
  })

  it('disparaît une seconde après le dernier cran, pas avant', () => {
    monter(1)
    monter(1.2)
    act(() => void vi.advanceTimersByTime(DELAI_PASTILLE_ZOOM - 100))
    monter(1.5)
    act(() => void vi.advanceTimersByTime(DELAI_PASTILLE_ZOOM - 100))
    expect(visible()).toBe(true)
    act(() => void vi.advanceTimersByTime(100))
    expect(visible()).toBe(false)
  })

  it('un clic remet à 100 %', () => {
    const remettre = vi.fn()
    monter(1)
    monter(2, remettre)
    act(() => pastille().click())
    expect(remettre).toHaveBeenCalledOnce()
  })
})

describe('le bouton « Recentrer »', () => {
  const doigt = (oui: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: oui && q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {} }))
  const monterBouton = (visible: boolean, recentrer = () => {}) =>
    act(() =>
      racine.render(
        <>
          <BoutonRecentrer visible={visible} recentrer={recentrer} />
          <PastilleZoom echelle={1} remettre={() => {}} />
        </>,
      ),
    )
  const bouton = () => hote.querySelector<HTMLButtonElement>('.notak-recentrer')!

  it('ne se montre que quand plus rien n’est en vue, et ne se prend pas au clavier caché', () => {
    doigt(false)
    monterBouton(false)
    expect(bouton().hasAttribute('data-visible')).toBe(false)
    expect(bouton().getAttribute('aria-hidden')).toBe('true')
    expect(bouton().tabIndex).toBe(-1)
    monterBouton(true)
    expect(bouton().hasAttribute('data-visible')).toBe(true)
    expect(bouton().tabIndex).toBe(0)
  })

  it('un clic ramène sur le contenu', () => {
    doigt(false)
    const recentrer = vi.fn()
    monterBouton(true, recentrer)
    act(() => bouton().click())
    expect(recentrer).toHaveBeenCalledOnce()
  })

  it('au bureau, il dit sa touche (Z, comme Tout voir) ; au doigt, il n’en dit aucune', () => {
    doigt(false)
    monterBouton(true)
    expect(bouton().textContent).toBe('RecentrerZ')
    expect(bouton().querySelector('kbd')?.textContent).toBe('Z')
    act(() => racine.unmount())
    racine = createRoot(hote)
    doigt(true)
    monterBouton(true)
    expect(bouton().textContent).toBe('Recentrer')
    expect(bouton().querySelector('kbd')).toBeNull()
  })

  it('les gestes de la toile ne partent pas de lui', () => {
    doigt(false)
    // La toile écoute par React : un appui, un double-clic et un clic droit sur le bouton ne lui arrivent pas.
    const appui = vi.fn()
    const double = vi.fn()
    const menu = vi.fn()
    act(() =>
      racine.render(
        <div onPointerDown={appui} onDoubleClick={double} onContextMenu={menu}>
          <BoutonRecentrer visible recentrer={() => {}} />
        </div>,
      ),
    )
    act(() => {
      bouton().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      bouton().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
      bouton().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    })
    expect(appui).not.toHaveBeenCalled()
    expect(double).not.toHaveBeenCalled()
    expect(menu).not.toHaveBeenCalled()
  })

  it('vient avant la pastille du zoom, qui se range au-dessus de lui quand les deux paraissent', () => {
    doigt(false)
    monterBouton(true)
    expect(bouton().nextElementSibling?.classList.contains('notak-zoom-pastille')).toBe(true)
  })
})
