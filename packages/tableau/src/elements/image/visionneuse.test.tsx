// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import type { Element, Image } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { Visionneuse } from './visionneuse'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
let onglet: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
  onglet = vi.spyOn(window, 'open').mockReturnValue(null)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  vi.restoreAllMocks()
})

const element: Element<Image> = { id: 'i1', x: 0, y: 0, largeur: 20, contenu: { type: 'image', fichier: 'f1', largeurOrigine: 300, hauteurOrigine: 200, typeMime: 'image/png' } }

async function rendre(ouvrirAilleurs?: (adresse: string, nom?: string) => void) {
  const contexte = {
    magasin: creerMagasin({ titre: '', etiquettes: [], elements: [element] }),
    services: { lectureSeule: true, ouvrirAilleurs },
    choisir: () => {},
  } as unknown as ContexteToile
  await act(async () => {
    racine.render(<Visionneuse element={element} adresse="/api/fichiers/ab" contexte={contexte} />)
  })
}
const boutonOuvrir = () => document.querySelector<HTMLButtonElement>('.notak-visionneuse-barre button[aria-label^="Ouvrir"]')

describe('« Ouvrir » de la visionneuse', () => {
  it('l’hôte, s’il sait ouvrir ailleurs, reçoit l’adresse et le nom de l’image ; aucun onglet', async () => {
    const ailleurs = vi.fn()
    await rendre(ailleurs)
    expect(boutonOuvrir()!.getAttribute('aria-label')).toBe('Ouvrir avec une autre application')
    act(() => boutonOuvrir()!.click())
    expect(ailleurs).toHaveBeenCalledExactlyOnceWith('/api/fichiers/ab', 'image.png')
    expect(onglet).not.toHaveBeenCalled()
  })

  it('sans hôte pour cela, un nouvel onglet, détaché de la page', async () => {
    await rendre()
    expect(boutonOuvrir()!.getAttribute('aria-label')).toBe('Ouvrir dans un nouvel onglet')
    act(() => boutonOuvrir()!.click())
    expect(onglet).toHaveBeenCalledExactlyOnceWith('/api/fichiers/ab', '_blank', 'noopener,noreferrer')
  })
})
