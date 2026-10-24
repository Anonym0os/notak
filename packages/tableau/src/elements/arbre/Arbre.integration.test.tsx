// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { Arbre, Element as ElementToile } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { RenduArbre } from './Arbre'
import { ajouterEnfant, ajouterFlottant, lire, nouvelArbre } from './modele/sujets'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const racines: { unmount(): void }[] = []
afterEach(() => {
  for (const r of racines.splice(0)) act(() => r.unmount())
  document.body.innerHTML = ''
})

/** La carte ouverte en grand, avec un faux magasin : ce qu'on y fait change l'élément, comme sur la toile. */
function ouvrir(contenu: Arbre) {
  let element: ElementToile<Arbre> = { id: 'k', x: 0, y: 0, largeur: 40, contenu }
  const ecouteurs = new Set<() => void>()
  const contexte = {
    magasin: { lire: () => ({ elements: [element] }), ecouter: (f: () => void) => (ecouteurs.add(f), () => ecouteurs.delete(f)), annuler() {}, retablir() {} },
    services: {},
    finirEdition() {},
  } as unknown as ContexteToile
  const hote = document.createElement('div')
  document.body.appendChild(hote)
  const racine = createRoot(hote)
  racines.push(racine)
  const changer = (a: Arbre) => {
    element = { ...element, contenu: a }
    ecouteurs.forEach((f) => f())
  }
  act(() => racine.render(<RenduArbre element={element} choisie brouillon={() => {}} enEdition contexte={contexte} changer={changer} />))
  return { courant: () => element.contenu }
}

const racineGrande = () => document.querySelector('.notak-arbre-fond')!
const clic = (e: Element) => act(() => void e.dispatchEvent(new MouseEvent('click', { bubbles: true })))
const menuContextuel = (e: Element, init: MouseEventInit = {}) => act(() => void e.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 120, ...init })))
const entrees = () => [...document.querySelectorAll('.notak-arbre-ctx > button, .notak-arbre-ctx > hr, .notak-arbre-ctx > .notak-arbre-menu-hote > button')].map((b) => (b.tagName === 'HR' ? '—' : b.querySelector('.notak-arbre-entree-libelle')!.textContent))

function base() {
  let a: Arbre = nouvelArbre('Central')
  ;[a] = ajouterEnfant(a, lire(a).central, 'Idées')
  ;[a] = ajouterFlottant(a, { x: 300, y: 100 }, 'Libre')
  return a
}

describe('la carte ouverte en grand, avec ses menus et ses insertions', () => {
  it('s’ouvre avec la barre d’outils, le « + » et ses entrées', () => {
    ouvrir(base())
    expect(racineGrande()).toBeTruthy()
    expect(document.querySelectorAll('.notak-arbre-outils .notak-arbre-bouton').length).toBeGreaterThanOrEqual(7)
    clic(document.querySelector('.notak-arbre-plus')!)
    const menu = [...document.querySelectorAll('.notak-arbre-deroulant .notak-arbre-entree-libelle')].map((e) => e.textContent)
    expect(menu).toEqual(['Note', 'Tâches à faire', 'Lien', 'Pièce jointe', 'Note audio', 'Autocollant', 'Illustration', 'Image locale', 'Équation'])
  })

  it('un clic droit sur un sujet ouvre son menu, qui commence par Insérer ; le sujet est choisi', () => {
    ouvrir(base())
    const sujet = [...document.querySelectorAll('.notak-arbre-surface [data-sujet]')].find((s) => s.textContent === 'Idées')!
    menuContextuel(sujet)
    expect(document.querySelector('.notak-arbre-ctx')).toBeTruthy()
    const e = entrees()
    expect(e[0]).toBe('Insérer')
    expect(e).toContain('Couper')
    expect(e).toContain('Supprimer le sujet seul')
    expect(sujet.querySelector('.notak-arbre-choix')).toBeTruthy()
  })

  it('un clic droit sur le fond ouvre le menu du fond', () => {
    ouvrir(base())
    menuContextuel(document.querySelector('.notak-arbre-surface')!)
    expect(entrees().filter((x) => x !== '—').slice(0, 4)).toEqual(['Coller', 'Créer une zone', 'Insérer le sujet flottant', 'Insérer la relation'])
    expect(entrees()).toContain('Créer une zone')
    expect(entrees()).toContain('Se rendre sur le sujet central')
  })

  it('Copier puis Coller depuis le menu duplique la branche sous le sujet', () => {
    const c = ouvrir(base())
    const sujet = () => [...document.querySelectorAll('.notak-arbre-surface [data-sujet]')].find((s) => s.textContent === 'Idées')!
    menuContextuel(sujet())
    clic([...document.querySelectorAll('.notak-arbre-ctx > button')].find((b) => b.textContent!.startsWith('Copier'))!)
    expect(document.querySelector('.notak-arbre-ctx')).toBeNull()
    menuContextuel(sujet())
    clic([...document.querySelectorAll('.notak-arbre-ctx > button')].find((b) => b.textContent!.startsWith('Coller'))!)
    const l = lire(c.courant())
    expect(l.enfants.get([...l.sujets].find(([, s]) => s.titre === 'Idées')![0])).toHaveLength(1)
  })

  it('« Marquer comme terminé » et la zone créée depuis le fond passent dans la carte', () => {
    const c = ouvrir(base())
    const sujet = [...document.querySelectorAll('.notak-arbre-surface [data-sujet]')].find((s) => s.textContent === 'Idées')!
    menuContextuel(sujet)
    clic([...document.querySelectorAll('.notak-arbre-ctx > .notak-arbre-menu-hote > button')].find((b) => b.textContent!.startsWith('Insérer'))!)
    expect([...document.querySelectorAll('.notak-arbre-sous-menu > button, .notak-arbre-sous-menu > .notak-arbre-menu-hote > button')].map((b) => b.querySelector('.notak-arbre-entree-libelle')!.textContent)).toContain('Équation')
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(document.querySelector('.notak-arbre-ctx')).toBeNull()
    // Le bouton Zone, sans flottant choisi, arme le tracé ; Échap le désarme.
    clic([...document.querySelectorAll('.notak-arbre-outils .notak-arbre-bouton')].find((b) => b.getAttribute('aria-label')!.includes('zone'))!)
    expect(document.querySelector('.notak-arbre-surface')!.hasAttribute('data-trace')).toBe(true)
    expect(Object.keys(c.courant().zones ?? {})).toHaveLength(0)
  })

  it('le panneau d’icônes s’ouvre par le smiley, sur le marqueur ; « Autocollant » du menu + l’ouvre sur son onglet', () => {
    ouvrir(base())
    clic(document.querySelector('[aria-label="Icônes"]')!)
    expect(document.querySelector('.notak-arbre-icones')).toBeTruthy()
    expect(document.querySelectorAll('.notak-arbre-icones-marqueur')).toHaveLength(58)
    const onglets = [...document.querySelectorAll('[role=tab]')].map((t) => t.textContent)
    expect(onglets).toEqual(['Marqueur', 'Autocollant', 'Illustration'])
    clic(document.querySelectorAll('[role=tab]')[1]!)
    expect(document.querySelectorAll('.notak-arbre-icones-autocollant').length).toBeGreaterThan(100)
  })
})

describe('les zones et les raccourcis', () => {
  const pointeur = (e: Element, type: string, x: number, y: number) => act(() => void e.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1 })))
  Object.assign(HTMLElement.prototype, { setPointerCapture() {}, releasePointerCapture() {} })

  it('le bouton Zone, puis un rectangle tracé au glisser, crée une zone ; un tracé trop petit n’en crée pas', () => {
    const c = ouvrir(base())
    const surface = document.querySelector('.notak-arbre-surface')!
    clic([...document.querySelectorAll('.notak-arbre-outils .notak-arbre-bouton')].find((b) => b.getAttribute('aria-label')!.includes('zone'))!)
    pointeur(surface, 'pointerdown', 100, 100)
    pointeur(surface, 'pointermove', 104, 104)
    pointeur(surface, 'pointerup', 104, 104)
    expect(Object.keys(c.courant().zones ?? {})).toHaveLength(0)
    expect(surface.hasAttribute('data-trace')).toBe(true)
    pointeur(surface, 'pointerdown', 100, 100)
    pointeur(surface, 'pointermove', 260, 220)
    pointeur(surface, 'pointerup', 260, 220)
    const zones = Object.values(c.courant().zones ?? {})
    expect(zones).toHaveLength(1)
    expect(zones[0]).toMatchObject({ l: 160, h: 120, titre: 'Zone' })
    expect(surface.hasAttribute('data-trace')).toBe(false)
    // La zone se dessine, sous la carte.
    expect(document.querySelectorAll('.notak-arbre-surface [data-zone]')).toHaveLength(1)
  })

  it('Cmd+C puis Cmd+V sur un sujet choisi copie sa branche dessous ; Échap annule un tracé de zone', () => {
    const c = ouvrir(base())
    const surface = document.querySelector('.notak-arbre-surface')!
    const sujet = [...document.querySelectorAll('.notak-arbre-surface [data-sujet]')].find((s) => s.textContent === 'Idées')!
    pointeur(sujet, 'pointerdown', 10, 10)
    pointeur(surface, 'pointerup', 10, 10)
    const touche = (key: string, init: KeyboardEventInit = {}) => act(() => void racineGrande().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, metaKey: true, ...init })))
    touche('c')
    touche('v')
    const l = lire(c.courant())
    const idees = [...l.sujets].find(([, s]) => s.titre === 'Idées')![0]
    expect(l.enfants.get(idees)!.map((x) => l.sujets.get(x)!.titre)).toEqual(['Idées'])
    // Alt+Cmd+Z arme le tracé, Échap le désarme.
    touche('Ω', { altKey: true, code: 'KeyZ' } as KeyboardEventInit)
    expect(surface.hasAttribute('data-trace')).toBe(true)
    act(() => void racineGrande().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(surface.hasAttribute('data-trace')).toBe(false)
  })
})
