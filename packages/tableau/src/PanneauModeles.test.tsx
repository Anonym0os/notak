// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PanneauModeles, modelesProposes } from './PanneauModeles'
import { MODELES } from './modeles'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Le choix d'un modèle sur une toile neuve : un panneau sombre au bureau, une feuille claire au téléphone. */

let racine: Root
let hote: HTMLElement
const largeur = window.innerWidth
const telephone = (oui: boolean) => {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: oui && q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {} }))
  Object.defineProperty(window, 'innerWidth', { value: oui ? 390 : 1280, configurable: true })
}
beforeEach(() => {
  vi.useFakeTimers()
  hote = document.createElement('div')
  hote.className = 'notak-espace'
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'innerWidth', { value: largeur, configurable: true })
})

const proposes = modelesProposes(MODELES)
function monter(choisi: string | null, plus: Partial<Parameters<typeof PanneauModeles>[0]> = {}) {
  const rappels = { surChoix: vi.fn(), continuer: vi.fn(), fermer: vi.fn(), toucherDehors: vi.fn(), surHauteur: vi.fn(), plus: vi.fn() }
  act(() =>
    racine.render(
      <PanneauModeles modeles={proposes} catalogue={MODELES} choisi={choisi} garder={false} surGarder={() => {}} signal={0} {...rappels} {...plus} />,
    ),
  )
  // La feuille ignore les touchers le temps du clic fantôme de la webview.
  act(() => void vi.advanceTimersByTime(400))
  return rappels
}
const cartes = () => [...document.querySelectorAll<HTMLButtonElement>('.notak-feuille-modeles-cartes [role="option"]')]

describe('le choix d’un modèle au téléphone', () => {
  beforeEach(() => telephone(true))

  it('monte en feuille claire : « Toile vide » puis une carte avec sa vignette par modèle proposé', () => {
    monter(null)
    expect(document.querySelector('.notak-choix-modele')).toBeNull()
    expect(document.querySelector('.notak-tiroir-bas.notak-feuille-modeles')).not.toBeNull()
    expect(cartes().map((c) => c.textContent)).toEqual(['Toile vide', ...proposes.map((m) => m.titre)])
    expect(cartes()[0]!.getAttribute('aria-selected')).toBe('true')
    expect(document.querySelectorAll('.notak-feuille-modeles-cartes .notak-modeles-apercu')).toHaveLength(proposes.length)
  })

  it('choisit d’un toucher sur une carte, et le bouton principal reste en bas', () => {
    const r = monter(null)
    act(() => cartes()[2]!.click())
    expect(r.surChoix).toHaveBeenCalledWith(proposes[1]!.id)
    const feuille = document.querySelector('.notak-tiroir-bas')!
    expect(feuille.lastElementChild!.querySelector('.notak-feuille-modeles-continuer')).not.toBeNull()
    expect(feuille.querySelector('.notak-tiroir-bas-fermer')).toBeNull()
  })

  it('ne montre la case « Garder le contenu d’exemple » qu’une fois un modèle choisi', () => {
    monter(null)
    expect(document.querySelector('.notak-feuille-modeles-pied label')).toBeNull()
    expect(document.querySelector('.notak-feuille-modeles-continuer')!.textContent).toBe('Continuer')
    monter(proposes[0]!.id)
    expect(document.querySelector('.notak-feuille-modeles-pied label')!.textContent).toContain('Garder le contenu')
    expect(document.querySelector('.notak-feuille-modeles-continuer')!.textContent).toBe('Utiliser ce modèle')
  })

  it('ouvre « Tout voir » en sous-page ; un modèle pris là revient en tête de la rangée', () => {
    const r = monter(null)
    act(() => document.querySelector<HTMLButtonElement>('.notak-feuille-modeles-voir')!.click())
    const lignes = document.querySelectorAll<HTMLButtonElement>('.notak-feuille-modeles-liste [role="option"]')
    expect(lignes).toHaveLength(MODELES.length)
    const autre = MODELES.find((m) => !proposes.includes(m))!
    act(() => [...lignes].find((l) => l.textContent!.startsWith(autre.titre))!.click())
    expect(r.surChoix).toHaveBeenCalledWith(autre.id)
    expect(document.querySelector('.notak-feuille-modeles-liste')).toBeNull()
    monter(autre.id)
    expect(cartes()[1]!.textContent).toBe(autre.titre)
    expect(cartes()[1]!.getAttribute('aria-selected')).toBe('true')
  })

  it('un toucher au-dessus de la feuille ne la ferme pas ; le X, lui, la ferme', () => {
    const r = monter(proposes[0]!.id)
    act(() => document.querySelector<HTMLElement>('.notak-tiroir-bas-voile')!.click())
    expect(r.toucherDehors).toHaveBeenCalled()
    expect(r.fermer).not.toHaveBeenCalled()
    act(() => document.querySelector<HTMLButtonElement>('.notak-feuille-modeles-fermer')!.click())
    expect(r.fermer).toHaveBeenCalled()
  })

  it('dit la place qu’elle prend en bas, sauf en sous-page, puis plus rien une fois fermée', () => {
    const r = monter(null)
    expect(r.surHauteur).toHaveBeenCalledWith(expect.any(Number))
    r.surHauteur.mockClear()
    act(() => document.querySelector<HTMLButtonElement>('.notak-feuille-modeles-voir')!.click())
    expect(r.surHauteur).not.toHaveBeenCalled()
    act(() => racine.render(<></>))
    expect(r.surHauteur).toHaveBeenLastCalledWith(null)
  })
})

describe('le choix d’un modèle au bureau', () => {
  beforeEach(() => telephone(false))

  it('reste le panneau sombre, sans feuille', () => {
    monter(null)
    expect(document.querySelector('.notak-choix-modele')).not.toBeNull()
    expect(document.querySelector('.notak-tiroir-bas')).toBeNull()
  })
})
