// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import type { ContexteToile } from '../types'
import { PanneauEnvoi } from './PanneauEnvoi'
import { basculerEnvoi, envoiOuvert, fermerEnvoi } from './etatEnvoi'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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
  fermerEnvoi()
})

function monter() {
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [] })
  const recevoir = vi.fn()
  const contexte = { magasin, services: {}, centreVue: () => ({ x: 0, y: 0 }), recevoir } as unknown as ContexteToile
  act(() => racine.render(<PanneauEnvoi contexte={contexte} libelleOutil="Envoyer" />))
  return { recevoir }
}
const panneau = () => document.querySelector('.notak-envoi')

describe('le panneau d’envoi de fichiers', () => {
  it('fermé d’abord ; le clic sur l’outil l’ouvre avec son bouton et sa zone de dépôt', () => {
    monter()
    expect(panneau()).toBeNull()
    act(() => basculerEnvoi())
    expect(panneau()?.textContent).toContain('Choisir des fichiers')
    expect(panneau()?.textContent).toContain('ou déposez-les ici')
    expect(panneau()?.hasAttribute('data-sans-banque')).toBe(true)
    expect(panneau()?.querySelector('.notak-banque-envoi')).not.toBeNull()
  })

  it('Échap le ferme', () => {
    monter()
    act(() => basculerEnvoi())
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(envoiOuvert()).toBe(false)
    expect(panneau()).toBeNull()
  })

  it('un appui hors du panneau le ferme, un appui dedans non', () => {
    monter()
    act(() => basculerEnvoi())
    act(() => void panneau()!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })))
    expect(envoiOuvert()).toBe(true)
    act(() => void document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })))
    expect(envoiOuvert()).toBe(false)
  })

  it('des fichiers déposés passent à la toile, tous types acceptés, et ferment le panneau', () => {
    const { recevoir } = monter()
    act(() => basculerEnvoi())
    const fichier = new File(['x'], 'notes.pdf', { type: 'application/pdf' })
    const depot = new Event('drop', { bubbles: true, cancelable: true }) as Event & { dataTransfer?: unknown }
    depot.dataTransfer = { files: [fichier] }
    class DT {
      files: File[] = []
      items = { add: (f: File) => this.files.push(f) }
    }
    vi.stubGlobal('DataTransfer', DT)
    act(() => void panneau()!.querySelector('.notak-banque-envoi')!.dispatchEvent(depot))
    vi.unstubAllGlobals()
    expect(recevoir).toHaveBeenCalledTimes(1)
    expect(envoiOuvert()).toBe(false)
  })
})
