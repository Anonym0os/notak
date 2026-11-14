// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Image } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { t } from '../../langue'
import { Recadreur, recadrer } from './Recadreur'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  // La carte vit dans la toile d'un espace en thème sombre : la barre, posée hors d'elle, doit le reprendre.
  const espace = document.createElement('div')
  espace.className = 'notak-espace'
  espace.dataset.theme = 'sombre'
  const toile = document.createElement('div')
  toile.className = 'notak-toile'
  hote = document.createElement('div')
  toile.append(hote)
  espace.append(toile)
  document.body.append(espace)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.closest('.notak-espace')?.remove()
  recadrer(null)
})

const rogne: Image = { type: 'image', fichier: 'f1', largeurOrigine: 400, hauteurOrigine: 200, recadrage: { x: 0.25, y: 0, largeur: 0.5, hauteur: 0.5 } }

function ouvrir(contenu: Image = rogne, retour?: () => void) {
  const faire = vi.fn()
  const contexte = { magasin: { faire, lire: () => ({ elements: [] }) }, camera: { origine: { x: 0, y: 0 }, echelle: 1 }, services: {} } as unknown as ContexteToile
  act(() => {
    recadrer('i1', { retour })
    racine.render(<Recadreur id="i1" contenu={contenu} adresse="blob:image" contexte={contexte} />)
  })
  return faire
}

const touche = (key: string, cible: EventTarget = document) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  act(() => void cible.dispatchEvent(e))
  return e
}
const barre = () => document.body.querySelector<HTMLElement>(':scope > [data-outil-image]')
const bouton = (libelle: string) => [...(barre()?.querySelectorAll('button') ?? [])].find((b) => b.textContent === libelle)!

describe('le recadrage', () => {
  it('s’ouvre sur la partie déjà gardée, et non sur l’image entière', () => {
    ouvrir()
    const cadre = hote.querySelector<HTMLElement>('.notak-recadre')!
    expect([cadre.style.left, cadre.style.top, cadre.style.width, cadre.style.height]).toEqual(['25%', '0%', '50%', '50%'])
  })

  it('valider sans rien toucher ne laisse aucun pas dans l’historique, et revient d’où on l’a ouvert', () => {
    const retour = vi.fn()
    const faire = ouvrir(rogne, retour)
    touche('Enter')
    expect(faire).not.toHaveBeenCalled()
    expect(retour).toHaveBeenCalledTimes(1)
  })

  it('« Toute l’image » puis valider retire le recadrage', () => {
    const faire = ouvrir()
    act(() => bouton(t('recadreur.toute')).click())
    act(() => bouton(t('recadreur.valider')).click())
    expect(faire).toHaveBeenCalledTimes(1)
    expect(faire.mock.calls[0]![0][0].apres.recadrage).toBeUndefined()
  })

  it('ses boutons sont dans une barre posée sous la page, hors du zoom, au thème de la toile', () => {
    ouvrir()
    expect(barre()).not.toBeNull()
    expect(barre()!.style.colorScheme).toBe('dark')
    expect(hote.querySelector('button')).toBeNull()
  })

  it('Entrée sur un bouton de la barre le laisse faire ce qu’il dit', () => {
    const faire = ouvrir()
    const e = touche('Enter', bouton(t('commun.annuler')))
    expect(e.defaultPrevented).toBe(false)
    expect(faire).not.toHaveBeenCalled()
  })

  it('Échap revient d’où on l’a ouvert ; refermé parce qu’on a choisi autre chose, il n’y revient pas', () => {
    const retour = vi.fn()
    ouvrir(rogne, retour)
    touche('Escape')
    expect(retour).toHaveBeenCalledTimes(1)
    const autre = vi.fn()
    ouvrir(rogne, autre)
    act(() => recadrer(null))
    expect(autre).not.toHaveBeenCalled()
  })

  it('montre les traits dessinés sur l’image, qu’on recadre en les voyant', () => {
    ouvrir({ ...rogne, traits: [{ couleur: '#e5383b', epaisseur: 0.01, points: [[0.1, 0.1], [0.9, 0.9]] }] })
    expect(hote.querySelector('.notak-recadreur .notak-traits path')).not.toBeNull()
  })

  it('se manie tout entier : l’Apple Pencil y agit comme le doigt, sans ouvrir le dessin de la toile', () => {
    ouvrir()
    expect(hote.querySelector('.notak-recadreur')?.hasAttribute('data-poignee')).toBe(true)
  })

  it('a des poignées aux coins et au milieu des bords', () => {
    ouvrir()
    expect([...hote.querySelectorAll<HTMLElement>('.notak-recadre-poignee')].map((p) => p.dataset.poignee).sort()).toEqual(['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w'])
  })
})
