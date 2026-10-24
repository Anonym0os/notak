// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import type { Arbre, Element, Id } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { RenduArbre } from './Arbre'
import { ajouterEnfant, lire, nouvelArbre } from './modele/sujets'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let hote: HTMLElement
let racine: Root
beforeEach(() => {
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  document.body.innerHTML = ''
})

function monter() {
  let a: Arbre = nouvelArbre('Cours')
  const c = lire(a).central
  let p: Id
  ;[a, p] = ajouterEnfant(a, c, 'Chapitre')
  ;[a] = ajouterEnfant(a, p, 'Point')
  const element: Element<Arbre> = { id: 'E', x: 0, y: 0, largeur: 40, contenu: a }
  const magasin = creerMagasin({ titre: '', elements: [element] })
  const contexte = { magasin, services: {}, finirEdition: vi.fn(), commencerEdition: vi.fn(), choisir: () => {}, selection: new Set(['E']) } as unknown as ContexteToile
  act(() => racine.render(<RenduArbre element={element} choisie enEdition contexte={contexte} brouillon={() => {}} changer={(neuf) => magasin.faire([{ type: 'contenu', id: 'E', avant: element.contenu, apres: neuf }])} />))
  const q = <T extends globalThis.Element>(s: string) => document.querySelector<T>(s)
  const clic = (el: globalThis.Element | null) => act(() => void el?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
  const touche = (key: string, mods: Partial<KeyboardEventInit> = {}) =>
    act(() => void q('[role=dialog]')!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods })))
  return { q, clic, touche, contexte, magasin, c, p }
}

describe('la carte ouverte : barre du bas, panneau de gauche, Pitch', () => {
  it('la barre du bas porte la feuille, le compteur, le zoom et les quatre boutons', () => {
    const m = monter()
    expect(m.q('.notak-arbre-bas-onglet')?.textContent).toBe('Cours')
    expect(m.q('.notak-arbre-bas-compteur .notak-arbre-bas-valeur')?.textContent).toBe('Sujets: 1 / 3')
    expect(m.q('.notak-arbre-bas-zoom .notak-arbre-bas-valeur')?.textContent).toBe('100%')
    expect(document.querySelectorAll('.notak-arbre-bas-controles .notak-arbre-bas-bouton')).toHaveLength(4)
  })

  it('le bouton du panneau de gauche, comme Cmd+[, l’ouvre et le ferme ; la carte se cale contre lui', () => {
    const m = monter()
    expect(m.q('.notak-arbre-gauche')).toBeNull()
    m.clic(m.q('.notak-arbre-entete [aria-label="Afficher le panneau de navigation"]'))
    expect(m.q('.notak-arbre-gauche')).toBeTruthy()
    expect(m.q('.notak-arbre-fenetre')?.hasAttribute('data-gauche')).toBe(true)
    expect([...document.querySelectorAll('.notak-arbre-gauche-plan-titre')].map((t) => t.textContent)).toEqual(['Cours', 'Chapitre', 'Point'])
    m.clic(m.q('.notak-arbre-gauche-fermer'))
    expect(m.q('.notak-arbre-gauche')).toBeNull()
    m.touche('[', { metaKey: true })
    expect(m.q('.notak-arbre-gauche')).toBeTruthy()
  })

  it('cliquer un sujet du plan le choisit dans la carte', () => {
    const m = monter()
    m.touche('[', { metaKey: true })
    m.clic([...document.querySelectorAll('.notak-arbre-gauche-plan-titre')][1]!)
    expect(m.q('.notak-arbre-gauche-corps [data-choisi]')?.textContent).toContain('Chapitre')
  })

  it('Pitch lance la présentation par le central ; Échap revient à la carte', () => {
    const m = monter()
    m.clic(m.q('.notak-arbre-bas-controles [aria-label^="Accédez au mode présentation"]'))
    expect(m.q('.notak-arbre-pitch-scene')).toBeTruthy()
    expect(m.q('.notak-arbre-pitch-scene h1')?.textContent).toBe('Cours')
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(m.q('.notak-arbre-pitch-scene')).toBeNull()
  })

  it('le plan prend la place de la carte, avec le zoom du plan', () => {
    const m = monter()
    m.clic(m.q('.notak-arbre-bas-controles [aria-label="Passer au plan."]'))
    expect(m.q('.notak-arbre-plan')).toBeTruthy()
    expect(m.q('.notak-arbre-bas-compteur')).toBeNull()
    m.clic(m.q('.notak-arbre-bas-zoom button'))
    m.clic([...document.querySelectorAll('.notak-arbre-bas-menu [role^=menuitem]')][1]!)
    expect(m.q('.notak-arbre-bas-zoom .notak-arbre-bas-valeur')?.textContent).toBe('200%')
    expect((m.q('.notak-arbre-plan') as HTMLElement).style.zoom).toBe('2')
  })

  it('la note d’un sujet s’ouvre en popover près de lui (Maj+Cmd+N), pas dans le panneau de droite', () => {
    const m = monter()
    m.touche('N', { metaKey: true, shiftKey: true })
    expect(m.q('.notak-arbre-note-popover')).toBeTruthy()
    expect(m.q('.notak-arbre-panneau')).toBeNull()
    act(() => void m.q('.notak-arbre-note-popover')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(m.q('.notak-arbre-note-popover')).toBeNull()
  })

  it('Échap ferme la note même quand le clavier est resté à la carte (ouverte par le menu « + »), sans fermer la carte', () => {
    const m = monter()
    m.touche('N', { metaKey: true, shiftKey: true })
    expect(m.q('.notak-arbre-note-popover')).toBeTruthy()
    act(() => void m.q('.notak-arbre-fond')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(m.q('.notak-arbre-note-popover')).toBeNull()
    expect(m.contexte.finirEdition).not.toHaveBeenCalled()
  })

  it('Échap tapé dans un panneau ferme le panneau, pas la carte', () => {
    const m = monter()
    const echap = (el: globalThis.Element) => act(() => void el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    m.touche(']', { metaKey: true })
    expect(m.q('.notak-arbre-panneau')).toBeTruthy()
    echap(m.q('.notak-arbre-panneau button')!)
    expect(m.q('.notak-arbre-panneau')).toBeNull()
    m.touche('[', { metaKey: true })
    echap(m.q('.notak-arbre-gauche-fermer')!)
    expect(m.q('.notak-arbre-gauche')).toBeNull()
    expect(m.contexte.finirEdition).not.toHaveBeenCalled()
  })

  it('« Nouvelle feuille » pose une carte neuve à droite et l’ouvre', () => {
    vi.useFakeTimers()
    const m = monter()
    m.clic(m.q('.notak-arbre-bas-plus'))
    expect(m.magasin.lire().elements).toHaveLength(2)
    const neuf = m.magasin.lire().elements.find((e) => e.id !== 'E')!
    expect(neuf.x).toBe(42)
    expect(m.contexte.finirEdition).toHaveBeenCalled()
    vi.runAllTimers()
    expect(m.contexte.commencerEdition).toHaveBeenCalledWith(neuf.id)
    vi.useRealTimers()
  })
})
