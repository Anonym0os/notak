// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { creerEspace } from './coeur/espace'
import type { Id } from './coeur/tableau'
import './elements'
import { nouveauDocument } from './elements/document/texte'
import { type Adresse, EspaceNotak } from './EspaceNotak'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Un dossier (autre que l'accueil) ne se montre jamais en toile : l'hôte le montre en liste, par `dossier`. */

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
  vi.unstubAllGlobals()
})

const page = { ...nouveauDocument(0, 0), id: 'page' }
const espace = () =>
  creerEspace({
    racine: 'r',
    tableaux: {
      r: { titre: 'Accueil', dossier: true, elements: [] },
      d: { titre: 'Clients', dossier: true, elements: [page] },
      t: { titre: 'Une toile', elements: [] },
    },
  })

/** Une adresse en mémoire : ce qu'elle dit, ce qu'on y écrit, et de quoi simuler le retour du navigateur. */
function adresseEnMemoire(tableau: Id | null, element: Id | null = null) {
  let ecouteur: ((id: Id | null, element?: Id | null) => void) | null = null
  const ecrits: Id[] = []
  const adresse: Adresse = {
    lire: () => tableau,
    lireElement: () => element,
    ecrire: (id) => {
      tableau = id
      element = null
      ecrits.push(id)
    },
    ecrireElement: (t, e) => {
      tableau = t
      element = e
    },
    ecouter: (f) => {
      ecouteur = f
      return () => void (ecouteur = null)
    },
  }
  const naviguer = (t: Id | null, e: Id | null = null) => {
    tableau = t
    element = e
    act(() => ecouteur?.(t, e))
  }
  return { adresse, ecrits, naviguer }
}

function rendre(adresse: Adresse, avecDossier = true) {
  const dossier = vi.fn()
  const ouvrir: { f: ((id: Id) => void) | null } = { f: null }
  act(() =>
    racine.render(
      <EspaceNotak
        espace={espace()}
        adresse={adresse}
        actions={(_courant, o) => {
          ouvrir.f = o
          return null
        }}
        {...(avecDossier ? { dossier } : {})}
      />,
    ),
  )
  return { dossier, ouvrir: (id: Id) => act(() => ouvrir.f!(id)) }
}

describe('un dossier ne se montre pas en toile', () => {
  it('sa carte, le fil ou une notification mènent à sa liste, sans quitter la toile où l’on est', () => {
    const a = adresseEnMemoire(null)
    const { dossier, ouvrir } = rendre(a.adresse)
    ouvrir('d')
    expect(dossier).toHaveBeenCalledWith('d', { remplacer: false })
    expect(a.ecrits).not.toContain('d')
    // Une toile ordinaire, elle, s'ouvre en toile.
    ouvrir('t')
    expect(a.ecrits).toContain('t')
    expect(dossier).toHaveBeenCalledTimes(1)
  })

  it('son adresse mène à sa liste, à la place de l’adresse de sa toile', () => {
    const a = adresseEnMemoire('d')
    const { dossier } = rendre(a.adresse)
    expect(dossier).toHaveBeenCalledWith('d', { remplacer: true })
  })

  it('une page qu’il range s’ouvre en grand sur sa toile ; refermée, on retourne à sa liste', () => {
    const a = adresseEnMemoire('d', 'page')
    const { dossier } = rendre(a.adresse)
    expect(dossier).not.toHaveBeenCalled()
    a.naviguer('d', null)
    expect(dossier).toHaveBeenCalledWith('d', { remplacer: true })
  })

  it('l’accueil reste une toile, même marqué dossier', () => {
    const a = adresseEnMemoire('t')
    const { dossier, ouvrir } = rendre(a.adresse)
    ouvrir('r')
    expect(dossier).not.toHaveBeenCalled()
    expect(a.ecrits).toContain('r')
  })

  it('sans hôte qui montre les dossiers en liste, un dossier s’ouvre en toile, comme avant', () => {
    const a = adresseEnMemoire(null)
    const { dossier, ouvrir } = rendre(a.adresse, false)
    ouvrir('d')
    expect(dossier).not.toHaveBeenCalled()
    expect(a.ecrits).toContain('d')
  })
})
