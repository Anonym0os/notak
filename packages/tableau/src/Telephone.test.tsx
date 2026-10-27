// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { creerMagasin } from './coeur/magasin'
import { nouvelleNote } from './coeur/tableau'
import './elements'
import { fermerMenus } from './menuUnique'
import { EVENEMENT_CHERCHER, Toile } from './Toile'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** La toile sur un téléphone, au doigt : le « + » et la feuille des outils, la barre de sélection en bas. */

class ObservateurMuet {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let racine: Root
let hote: HTMLElement
const largeur = window.innerWidth
beforeEach(() => {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ObservateurMuet
  document.elementFromPoint ??= () => null
  document.elementsFromPoint ??= () => []
  HTMLElement.prototype.setPointerCapture ??= () => {}
  HTMLElement.prototype.releasePointerCapture ??= () => {}
  HTMLElement.prototype.hasPointerCapture ??= () => false
  ;(globalThis as { CSS?: { escape(s: string): string } }).CSS ??= { escape: (s) => s }
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }))
  Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  fermerMenus()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'innerWidth', { value: largeur, configurable: true })
})

function doigt(cible: Element, type: string, x = 200, y = 300) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y })
  Object.defineProperties(e, { pointerType: { value: 'touch' }, pointerId: { value: 1 }, isPrimary: { value: true } })
  act(() => void cible.dispatchEvent(e))
}

describe('la toile sur un téléphone', () => {
  it('n’a pas de barre à gauche, mais un « + » qui ouvre les outils en feuille', () => {
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [] })
    act(() => racine.render(<Toile magasin={magasin} />))
    expect(hote.querySelector('.notak-barre-outils')).toBeNull()
    act(() => hote.querySelector<HTMLButtonElement>('.notak-outils-ajouter')!.click())
    expect(document.querySelectorAll('.notak-outils-feuille .notak-outil').length).toBeGreaterThan(4)
  })

  it('un outil touché dans la feuille pose son élément au milieu de la vue, et la feuille se ferme', () => {
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [] })
    act(() => racine.render(<Toile magasin={magasin} />))
    act(() => hote.querySelector<HTMLButtonElement>('.notak-outils-ajouter')!.click())
    const note = document.querySelector<HTMLButtonElement>('.notak-outils-feuille .notak-outil')!
    doigt(note, 'pointerdown')
    doigt(hote.querySelector('.notak-toile')!, 'pointerup')
    expect(magasin.lire().elements).toHaveLength(1)
    expect(document.querySelector('.notak-outils-feuille')).toBeNull()
  })

  it('un élément choisi montre la barre de sélection, sans rien replier dans le « ••• »', () => {
    const n = nouvelleNote(0, 0, 'a')
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [n] })
    act(() => racine.render(<Toile magasin={magasin} services={{ barreAGauche: true }} />))
    const carte = hote.querySelector(`[data-id="${n.id}"]`)!
    doigt(carte, 'pointerdown')
    doigt(carte, 'pointerup')
    const barre = hote.querySelector('.notak-barre-outils[data-selection]')
    expect(barre).not.toBeNull()
    expect(barre!.getAttribute('data-palier')).toBe('grande')
    expect(hote.querySelector('.notak-outils-ajouter')).toBeNull()
  })

  it('le menu d’un outil de la capsule monte en feuille, qu’un toucher dedans ne referme pas', () => {
    const n = nouvelleNote(0, 0, 'a')
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [n] })
    act(() => racine.render(<Toile magasin={magasin} services={{ barreAGauche: true }} />))
    const carte = hote.querySelector(`[data-id="${n.id}"]`)!
    doigt(carte, 'pointerdown')
    doigt(carte, 'pointerup')
    const outil = hote.querySelector<HTMLButtonElement>('.notak-barre-outils[data-capsule] button[aria-expanded]')!
    act(() => outil.click())
    const feuille = document.querySelector('.notak-tiroir-bas-outil')
    expect(feuille).not.toBeNull()
    // La feuille vit hors de la barre : un toucher dedans compte pourtant comme un toucher sur l'outil.
    doigt(feuille!.querySelector('.notak-tiroir-bas-corps')!, 'pointerdown')
    expect(document.querySelector('.notak-tiroir-bas-outil')).not.toBeNull()
    act(() => document.querySelector<HTMLButtonElement>('.notak-tiroir-bas-outil .notak-tiroir-bas-fermer')!.click())
    expect(document.querySelector('.notak-tiroir-bas-outil')).toBeNull()
  })
})

describe('la recherche au doigt', () => {
  it('la loupe de l’en-tête ouvre la recherche de la toile, le champ prêt à écrire', () => {
    const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [] })
    act(() => racine.render(<Toile magasin={magasin} />))
    // jsdom ne met rien en page : la toile se dit visible.
    Object.defineProperty(hote.querySelector('.notak-toile')!, 'offsetParent', { get: () => document.body })
    act(() => void window.dispatchEvent(new Event(EVENEMENT_CHERCHER)))
    const champ = hote.querySelector<HTMLInputElement>('.notak-recherche input')
    expect(champ).not.toBeNull()
    expect(document.activeElement).toBe(champ)
  })
})

