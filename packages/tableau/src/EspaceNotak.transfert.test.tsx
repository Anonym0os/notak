// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { retirerAvis } from './avis'
import { type Reseau, creerEspaceDistant } from './coeur/espaceDistant'
import { type Element, nouvelleNote } from './coeur/tableau'
import './elements'
import { EspaceNotak } from './EspaceNotak'
import { fermerMenus } from './menuUnique'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** Glisser un élément sur la carte d'une autre toile, dans un espace partagé (des documents Yjs) : il change de toile. */

class ObservateurMuet {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let racine: Root
let hote: HTMLElement
const sousLePointeur = { noeuds: [] as globalThis.Element[] }
beforeEach(() => {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ObservateurMuet
  document.elementFromPoint = () => null
  document.elementsFromPoint = () => sousLePointeur.noeuds as never
  ;(globalThis as { CSS?: { escape(s: string): string } }).CSS ??= { escape: (s) => s }
  HTMLElement.prototype.setPointerCapture ??= () => {}
  HTMLElement.prototype.releasePointerCapture ??= () => {}
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
  sousLePointeur.noeuds = []
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  fermerMenus()
  retirerAvis()
})

const pointeur = (cible: globalThis.Element, type: string, x: number, y: number) =>
  act(() => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y })
    Object.assign(e, { pointerId: 1, pointerType: 'mouse' })
    cible.dispatchEvent(e)
  })

const reseau: Reseau = {
  connecter: () => ({ awareness: null, lectureSeule: () => false, refuse: () => false, synchronise: () => true, detruire() {} }),
  declarer: async () => {},
}

describe('lâché sur la carte d’une autre toile', () => {
  it('l’élément ne revient pas en double quand on annule dans sa première toile, ni n’est perdu quand on annule dans l’autre', async () => {
    const espace = creerEspaceDistant({ racine: 'atelier', utilisateur: { id: 'u1', nom: 'Ana', couleur: '#2f6feb' }, reseau })
    const atelier = espace.magasin('atelier')
    const [part, reste] = [nouvelleNote(0, 30, 'Part'), nouvelleNote(40, 30, 'Reste')]
    const carte: Element = { id: 'carte-archives', x: 0, y: 0, largeur: 10, contenu: { type: 'tableau', cible: 'archives' } }
    atelier.faire([{ type: 'creer', element: carte }, { type: 'creer', element: part }, { type: 'creer', element: reste }])
    // Le pas d'avant le glisser, et un pas d'avant qui touche ce qui part.
    atelier.faire([{ type: 'deplacer', id: reste.id, de: [40, 30], vers: [60, 30] }])
    atelier.faire([{ type: 'deplacer', id: part.id, de: [0, 30], vers: [10, 30] }])
    await act(async () => racine.render(<EspaceNotak espace={espace} />))
    await act(async () => {})
    const noeud = (id: string) => hote.querySelector(`.notak-carte[data-id="${id}"]`)!

    sousLePointeur.noeuds = [noeud(carte.id)]
    pointeur(noeud(part.id), 'pointerdown', 10, 10)
    pointeur(noeud(part.id), 'pointermove', 60, 10)
    pointeur(noeud(part.id), 'pointermove', 200, 10)
    pointeur(noeud(part.id), 'pointerup', 200, 10)
    await act(async () => {})
    const ici = () => atelier.lire().elements.map((e) => e.id)
    const labas = () => espace.tableau('archives')!.elements.map((e) => e.contenu)
    expect([ici(), labas()]).toEqual([[carte.id, reste.id], [part.contenu]])

    // Annuler dans l'atelier défait le pas d'avant le glisser ; la note partie ne revient pas.
    act(() => void atelier.annuler())
    expect(ici()).toEqual([carte.id, reste.id])
    expect(atelier.lire().elements.find((e) => e.id === reste.id)).toMatchObject({ x: 40 })
    // Dans les archives, l'arrivée n'est pas un pas : annuler ne la retire pas.
    act(() => void espace.magasin('archives').annuler())
    expect(labas()).toEqual([part.contenu])
    act(() => racine.unmount())
    racine = createRoot(hote)
    espace.detruire()
  })
})
