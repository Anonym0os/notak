// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { creerEspace } from './coeur/espace'
import type { Id } from './coeur/tableau'
import './elements'
import { type Adresse, EspaceNotak } from './EspaceNotak'
import { apprendre, oublierDisposition } from './touches'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class ObservateurMuet {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ObservateurMuet
  document.elementFromPoint ??= () => null
  document.elementsFromPoint ??= () => []
  ;(globalThis as { CSS?: { escape(s: string): string } }).CSS ??= { escape: (s) => s }
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  oublierDisposition()
  localStorage.clear()
})

/** L'espace monté, sur l'accueil ; `ouvrir` mène à un tableau, `ecrits` dit où l'adresse est allée. */
function monter() {
  const espace = creerEspace({
    racine: 'r',
    tableaux: { r: { titre: 'Accueil', elements: [] }, t: { titre: 'Une', elements: [] }, u: { titre: 'Deux', elements: [] } },
  })
  let tableau: Id | null = null
  const ecrits: Id[] = []
  const adresse: Adresse = {
    lire: () => tableau,
    lireElement: () => null,
    ecrire: (id) => {
      tableau = id
      ecrits.push(id)
    },
    ecrireElement: (t) => {
      tableau = t
    },
    ecouter: () => () => {},
  }
  const ouvrir: { f: ((id: Id) => void) | null } = { f: null }
  act(() =>
    racine.render(
      <EspaceNotak
        espace={espace}
        adresse={adresse}
        actions={(_courant, o) => {
          ouvrir.f = o
          return null
        }}
      />,
    ),
  )
  return { ecrits, ouvrir: (id: Id) => act(() => ouvrir.f!(id)) }
}

/** Une touche frappée hors de tout champ, comme sur la toile. */
const taper = (init: KeyboardEventInit) => act(() => void document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })))
const grille = () => (JSON.parse(localStorage.getItem('notak:reglages') ?? '{}') as { grille?: number }).grille

describe('les raccourcis de l’espace, sur toute disposition', () => {
  it('⌘[ et ⌘] avec le crochet tel qu’on le tape : ⌥⇧( et ⌥⇧) sur un Mac en AZERTY', () => {
    const { ecrits, ouvrir } = monter()
    ouvrir('t')
    ouvrir('u')
    taper({ key: '[', code: 'Digit5', keyCode: 219, metaKey: true, altKey: true, shiftKey: true })
    expect(ecrits.at(-1)).toBe('t')
    taper({ key: ']', code: 'Minus', keyCode: 221, metaKey: true, altKey: true, shiftKey: true })
    expect(ecrits.at(-1)).toBe('u')
    // Maj+Cmd+[ sans Alt reste aux onglets du navigateur, et sa place QWERTY sert toujours (⌘^ en AZERTY).
    taper({ key: '{', code: 'BracketLeft', keyCode: 219, metaKey: true, shiftKey: true })
    expect(ecrits.at(-1)).toBe('u')
    taper({ key: 'Dead', code: 'BracketLeft', keyCode: 219, metaKey: true })
    expect(ecrits.at(-1)).toBe('t')
    // Sous Windows, AltGr (Ctrl+Alt) et 5 tapent « [ » en AZERTY : une frappe, pas un retour.
    taper({ key: '[', code: 'Digit5', keyCode: 219, ctrlKey: true, altKey: true })
    expect(ecrits.at(-1)).toBe('t')
  })

  it('⇧⌘, resserre la grille et ⇧⌘. l’élargit : en AZERTY, la virgule à la place QWERTY de M, le point sous Maj', () => {
    monter()
    // Ce qu'on a tapé ailleurs, sans modificateur : la virgule est sur la touche que QWERTY place à M.
    apprendre(new KeyboardEvent('keydown', { key: ',', code: 'KeyM' }))
    apprendre(new KeyboardEvent('keydown', { key: ';', code: 'Comma' }))
    taper({ key: '?', code: 'KeyM', keyCode: 188, metaKey: true, shiftKey: true })
    expect(grille()).toBe(9)
    // La place QWERTY du point, qui en AZERTY donne « / » sous Maj, ne fait plus rien.
    taper({ key: '/', code: 'Period', keyCode: 191, metaKey: true, shiftKey: true })
    expect(grille()).toBe(9)
    taper({ key: '.', code: 'Comma', keyCode: 190, metaKey: true, shiftKey: true })
    expect(grille()).toBe(10)
  })

  it('⌥⌘P lit la lettre marquée : Alt en fait « π », et en Dvorak la lettre P est à la place QWERTY de R', () => {
    monter()
    taper({ key: 'π', code: 'KeyR', keyCode: 80, metaKey: true, altKey: true })
    expect(document.querySelector('.notak-espace')?.hasAttribute('data-presentation')).toBe(true)
  })
})
