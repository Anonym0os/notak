// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Moi } from './api'
import { PartageEnFenetre } from './Partage'

vi.mock('./api', async (origine) => ({
  ...(await origine<typeof import('./api')>()),
  listerAcces: async () => [{ utilisateur: 'moi', email: 'moi@x.fr', role: 'proprietaire', enAttente: false }],
  listerLiens: async () => [],
  listerBlocages: async () => [],
  listerEspaces: async () => [],
  etatVerrou: async () => ({ protege: false }),
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom ne fait pas de dialogue modal : `open` suffit pour ce qu'on vérifie.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
}

const MOI: Moi = { id: 'moi', email: 'moi@x.fr', nom: 'Moi', couleur: '#000000', racine: 'r', photo: null }

let racine: Root
let hote: HTMLDivElement
beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
})

const ouvrir = async (fermer: () => void) => {
  await act(async () => racine.render(<PartageEnFenetre tableau="t" moi={MOI} fermer={fermer} />))
  return hote.querySelector('dialog')!
}
const appuyer = (cible: Element) => cible.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
const cliquer = (cible: Element) => cible.dispatchEvent(new MouseEvent('click', { bubbles: true }))

describe('PartageEnFenetre', () => {
  it('ne se ferme pas quand un appui dans un champ se relâche sur le fond', async () => {
    const fermer = vi.fn()
    const boite = await ouvrir(fermer)
    const champ = boite.querySelector('input')!
    expect(champ).not.toBeNull()
    act(() => {
      appuyer(champ)
      cliquer(boite)
    })
    expect(fermer).not.toHaveBeenCalled()
  })

  it('se ferme quand l’appui et le clic sont sur le fond', async () => {
    const fermer = vi.fn()
    const boite = await ouvrir(fermer)
    act(() => {
      appuyer(boite)
      cliquer(boite)
    })
    expect(fermer).toHaveBeenCalledOnce()
  })

  it('ne porte qu’un seul rôle de dialogue, et se referme en partant', async () => {
    const boite = await ouvrir(() => {})
    expect(boite.open).toBe(true)
    expect(hote.querySelectorAll('[role="dialog"]')).toHaveLength(0)
    act(() => racine.render(<></>))
    expect(boite.open).toBe(false)
  })
})
