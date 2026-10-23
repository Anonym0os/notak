// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import type { ContexteToile } from '../types'
import { PanneauBanque } from './Banque'
import { basculerBanque, fermerBanque } from './banqueImages'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  localStorage.clear()
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  fermerBanque()
})

const image = (id: number) => ({ id, vignette: `https://v/${id}`, grande: `https://g/${id}`, largeur: 400, hauteur: 300, auteur: 'Ana', lienAuteur: '', lienPhoto: '' })

function monter(services: Record<string, unknown>, titre = 'Voyage Lisbonne') {
  const magasin = creerMagasin({ titre, etiquettes: [], elements: [] })
  const contexte = { magasin, services, centreVue: () => ({ x: 0, y: 0 }) } as unknown as ContexteToile
  act(() => racine.render(<PanneauBanque contexte={contexte} libelleOutil="Image" />))
  act(() => basculerBanque())
}
const attendre = () => act(async () => { await Promise.resolve() })

describe('le panneau d’images', () => {
  it('sans clé côté serveur, ne montre que l’envoi et dit que la recherche n’est pas configurée', async () => {
    const banqueImages = vi.fn(async () => {
      throw new Error('non', { cause: 'non_configuree' })
    })
    monter({ banqueImages })
    await attendre()
    const p = document.querySelector('.notak-banque')!
    expect(p.hasAttribute('data-sans-banque')).toBe(true)
    expect(p.textContent).toContain('Choisir des images')
    expect(p.textContent).toContain('pas configurée')
    expect(p.querySelector('input[type=text]')).toBeNull()
    expect(p.querySelector('.notak-banque-liste')).toBeNull()
  })

  it('avec une banque, cherche d’après le titre et montre les vignettes et le menu', async () => {
    const banqueImages = vi.fn(async () => ({ resultats: [image(1), image(2)], total: 5 }))
    monter({ banqueImages })
    await attendre()
    expect(banqueImages).toHaveBeenCalledWith('Voyage Lisbonne', 1)
    const p = document.querySelector('.notak-banque')!
    expect(p.querySelectorAll('.notak-banque-vignette')).toHaveLength(2)
    const menu = [...p.querySelectorAll('.notak-banque-modes button')].map((b) => b.textContent)
    expect(menu).toEqual(['Recommandées', 'voyage', 'lisbonne', 'Envoyer les vôtres'])
    expect(p.textContent).toContain('Images fournies par')
    expect(p.textContent).toContain('Plus d’images')
  })

  it('une recherche tapée devient un mot du menu et se retient', async () => {
    const banqueImages = vi.fn(async () => ({ resultats: [image(1)], total: 1 }))
    monter({ banqueImages }, '')
    await attendre()
    const champ = document.querySelector<HTMLInputElement>('.notak-banque-champ input')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'Océan')
      champ.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      champ.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await attendre()
    expect(banqueImages).toHaveBeenLastCalledWith('océan', 1)
    expect(JSON.parse(localStorage.getItem('notak:banque:recherches')!)).toEqual(['océan'])
    expect(document.querySelector('.notak-banque-modes')!.textContent).toContain('océan')
  })

  it('un simple clic sur une vignette dit de la glisser', async () => {
    monter({ banqueImages: async () => ({ resultats: [image(1)], total: 1 }) })
    await attendre()
    const li = document.querySelector<HTMLElement>('.notak-banque-vignette')!
    li.setPointerCapture = () => {}
    const evt = (type: string) => new MouseEvent(type, { bubbles: true, clientX: 10, clientY: 10, button: 0 })
    await act(async () => {
      li.dispatchEvent(evt('pointerdown'))
      li.dispatchEvent(evt('pointerup'))
    })
    expect(document.querySelector('.notak-banque-bulle')?.textContent).toBe('Glissez-moi')
  })
})
