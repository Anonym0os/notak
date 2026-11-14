// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Image } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { t } from '../../langue'
import { Detoureur, detourerImage } from './Detoureur'

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
  detourerImage(null)
})

const photo: Image = { type: 'image', fichier: 'f1', largeurOrigine: 6000, hauteurOrigine: 4000, typeMime: 'image/jpeg' }

async function ouvrir(retour?: () => void) {
  const faire = vi.fn()
  const contexte = {
    magasin: { faire, lire: () => ({ elements: [] }) },
    camera: { origine: { x: 0, y: 0 }, echelle: 1 },
    services: { fichiers: { enregistrer: async () => 'x', adresse: async () => 'blob:original' } },
  } as unknown as ContexteToile
  await act(async () => {
    detourerImage('i1', { retour })
    racine.render(<Detoureur id="i1" contenu={photo} adresse="blob:photo" contexte={contexte} />)
  })
  return faire
}

describe('le détourage', () => {
  it('son curseur et ses boutons sont dans la barre du bas, hors de la carte', async () => {
    await ouvrir()
    const barre = document.body.querySelector(':scope > [data-outil-image]')!
    expect(barre.querySelector('input[type="range"]')).not.toBeNull()
    expect([...barre.querySelectorAll('button')].map((b) => b.textContent)).toEqual([t('commun.annuler'), t('recadreur.valider')])
    expect(hote.querySelector('input, button')).toBeNull()
    // L'Apple Pencil posé sur l'aperçu agit comme le doigt.
    expect(hote.querySelector('.notak-detoureur')?.hasAttribute('data-poignee')).toBe(true)
  })

  it('une image illisible le dit, et Valider reste éteint', async () => {
    await ouvrir()
    // Ni `fetch` d'une adresse `blob:` ni `createImageBitmap` ici : la lecture échoue.
    await act(async () => {
      await new Promise((fin) => setTimeout(fin, 20))
    })
    expect(hote.textContent).toContain(t('detourage.illisible'))
    const valider = [...document.body.querySelectorAll<HTMLButtonElement>('[data-outil-image] button')].at(-1)!
    expect(valider.disabled).toBe(true)
  })

  it('Échap le ferme et revient d’où on l’a ouvert', async () => {
    const retour = vi.fn()
    const faire = await ouvrir(retour)
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(retour).toHaveBeenCalledTimes(1)
    expect(faire).not.toHaveBeenCalled()
  })
})
