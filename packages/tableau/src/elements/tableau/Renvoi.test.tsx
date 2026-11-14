// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { retirerAvis } from '../../avis'
import { creerMagasin } from '../../coeur/magasin'
import type { Element, Tableau } from '../../coeur/tableau'
import '..'
import type { Services } from '../types'
import { fermerMenus } from '../../menuUnique'
import { Toile } from '../../Toile'

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
  document.elementFromPoint = () => null
  document.elementsFromPoint = () => []
  ;(globalThis as { CSS?: { escape(s: string): string } }).CSS ??= { escape: (s) => s }
  HTMLElement.prototype.setPointerCapture ??= () => {}
  HTMLElement.prototype.releasePointerCapture ??= () => {}
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  fermerMenus()
  retirerAvis()
})

const pointeur = (cible: globalThis.Element, type: string) =>
  act(() => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: 10, clientY: 10 })
    Object.assign(e, { pointerId: 1, pointerType: 'mouse' })
    cible.dispatchEvent(e)
  })
const touche = (cible: globalThis.Element, key: string) => act(() => void cible.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })))

describe('renommer une toile depuis sa carte', () => {
  it('renomme la toile sans écrire son titre dans la carte, qui perd celui d’avant ; annuler et rétablir le défont et le refont', async () => {
    // « Archives » a une carte d'avant, qui portait son titre.
    const carte = (id: string, cible: string, x: number, titre?: string): Element => ({ id, x, y: 0, largeur: 10, contenu: { type: 'tableau', cible, ...(titre ? { titre } : {}) } })
    const magasin = creerMagasin({ titre: 'Accueil', elements: [carte('c-projets', 'projets', 0), carte('c-archives', 'archives', 40, 'Archives')] })
    const titres: Record<string, string> = { projets: 'Projets', archives: 'Archives' }
    const renommerTableau = vi.fn((id: string, titre: string) => void (titres[id] = titre))
    const services: Services = { tableau: (id) => ({ titre: titres[id] ?? '', elements: [] }) as Tableau, renommerTableau, colorerTableau: vi.fn(), ouvrirTableau: vi.fn() }
    act(() => racine.render(<Toile magasin={magasin} services={services} />))
    await act(async () => {})
    const toile = hote.querySelector<HTMLElement>('.notak-toile')!
    const renommer = async (id: string, nom: string) => {
      const noeud = hote.querySelector(`.notak-carte[data-id="${id}"]`)!
      pointeur(noeud, 'pointerdown')
      pointeur(noeud, 'pointerup')
      touche(toile, 'Enter')
      await act(async () => {})
      const champ = hote.querySelector<HTMLInputElement>('.notak-renvoi-saisie')!
      champ.value = nom
      touche(champ, 'Enter')
      await act(async () => {})
    }
    const contenu = (id: string) => magasin.lire().elements.find((e) => e.id === id)!.contenu

    await renommer('c-projets', 'Chantiers')
    expect(renommerTableau).toHaveBeenLastCalledWith('projets', 'Chantiers')
    expect(contenu('c-projets')).toEqual({ type: 'tableau', cible: 'projets' })
    act(() => void magasin.annuler())
    expect(renommerTableau).toHaveBeenLastCalledWith('projets', 'Projets')
    act(() => void magasin.retablir())
    expect(renommerTableau).toHaveBeenLastCalledWith('projets', 'Chantiers')

    await renommer('c-archives', 'Classeur')
    expect(renommerTableau).toHaveBeenLastCalledWith('archives', 'Classeur')
    expect(contenu('c-archives')).toEqual({ type: 'tableau', cible: 'archives' })
  })
})
