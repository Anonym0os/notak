// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { depuisTaille, point } from '../../coeur/geometrie'
import { creerMagasin } from '../../coeur/magasin'
import { type Element, nouvelleNote } from '../../coeur/tableau'
import { fermerMenus } from '../../menuUnique'
import type { ContexteToile } from '../types'
import './index'
import { OutilArrangement } from './Outil'

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
  fermerMenus()
})

/** Trois notes de 10 × 10 UG posées en (x, y) ; la barre flottante montre l'outil par ses boutons de texte. */
function monter(places: [number, number][]) {
  const notes: Element[] = places.map(([x, y], k) => ({ ...nouvelleNote(x, y, `n${k}`), id: `n${k}` }))
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements: notes })
  const contexte = {
    magasin,
    rect: (id: string) => {
      const e = magasin.lire().elements.find((x) => x.id === id)
      return e ? depuisTaille(point(e.x, e.y), 10, 10) : null
    },
    selection: new Set(notes.map((n) => n.id)),
    services: {},
  } as unknown as ContexteToile
  act(() => racine.render(<OutilArrangement elements={notes} contexte={contexte} />))
  const bouton = [...hote.querySelectorAll('button')].find((b) => b.textContent === 'Répartir')!
  const places_ = () => magasin.lire().elements.map((e) => [e.x, e.y])
  return { bouton, places: places_, magasin }
}

describe('Répartir, d’un clic', () => {
  it('une rangée se répartit en largeur au premier clic, sans menu, et s’annule d’un pas', () => {
    const { bouton, places, magasin } = monter([[0, 0], [12, 0], [40, 0]])
    expect(bouton.getAttribute('aria-label')).toBe('Répartir horizontalement')
    act(() => bouton.click())
    expect(places()).toEqual([[0, 0], [20, 0], [40, 0]])
    expect(hote.querySelector('[role="menu"]')).toBeNull()
    act(() => void magasin.annuler())
    expect(places()).toEqual([[0, 0], [12, 0], [40, 0]])
  })

  it('une colonne se répartit en hauteur', () => {
    const { bouton, places } = monter([[0, 0], [0, 12], [0, 40]])
    expect(bouton.getAttribute('aria-label')).toBe('Répartir verticalement')
    act(() => bouton.click())
    expect(places()).toEqual([[0, 0], [0, 20], [0, 40]])
  })

  it('une diagonale : le menu nomme les deux axes, avec leurs raccourcis', () => {
    const { bouton, places } = monter([[0, 0], [12, 15], [40, 40]])
    act(() => bouton.click())
    const lignes = [...hote.querySelectorAll('.notak-arrangement-axes .notak-e')]
    expect(lignes.map((l) => l.querySelector('.notak-e-libelle')!.textContent)).toEqual(['Répartir horizontalement', 'Répartir verticalement'])
    expect(lignes[0]!.querySelector('.notak-touches')!.getAttribute('aria-label')).toBe('⌥⇧⌘H')
    act(() => (lignes[1] as HTMLButtonElement).click())
    expect(places()).toEqual([[0, 0], [12, 20], [40, 40]])
    expect(hote.querySelector('.notak-arrangement-axes')).toBeNull()
  })

  it('des éléments empilés : l’outil est grisé et dit pourquoi', () => {
    const { bouton } = monter([[0, 0], [2, 2], [4, 4]])
    expect(bouton.disabled).toBe(true)
    expect(bouton.getAttribute('aria-label')).toBe('Pour répartir, il faut trois éléments en rangée ou en colonne')
  })
})
