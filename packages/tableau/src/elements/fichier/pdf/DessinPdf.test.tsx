// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Magasin, creerMagasin } from '../../../coeur/magasin'
import type { Element, Fichier, TraitPage } from '../../../coeur/tableau'
import type { ContexteToile } from '../../types'
import { ModaleFichier } from '../ModaleFichier'
import { mesuresFausses } from './fauxPdf'

vi.mock('../apercuPdf', async () => (await import('./fauxPdf')).moduleFaux)

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let rendre: () => void
beforeAll(() => {
  rendre = mesuresFausses()
})
afterAll(() => rendre())

let racine: Root
let hote: HTMLElement
beforeEach(() => {
  vi.stubGlobal('fetch', async () => new Response(new Uint8Array([37, 80, 68, 70])))
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  vi.unstubAllGlobals()
})

const trait = (id: string): TraitPage => ({ id, couleur: '#ff5757', epaisseur: 0.01, points: [[0.1, 0.1], [0.4, 0.1]] })
const pdf = (plus: Partial<Fichier> = {}): Element<Fichier> => ({
  id: 'p1',
  x: 0,
  y: 0,
  largeur: 34,
  contenu: { type: 'fichier', fichier: 'f1', nom: 'devis.pdf', typeMime: 'application/pdf', taille: 1000, ...plus },
})
const attendre = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))))

/** La visionneuse sur une toile dont le magasin porte ce PDF ; elle suit le contenu comme la carte le lui passe. */
async function ouvrir(element = pdf(), services: Partial<ContexteToile['services']> = {}, plus: Partial<Element<Fichier>> = {}) {
  const magasin: Magasin = creerMagasin({ titre: '', etiquettes: [], elements: [{ ...element, ...plus }] })
  const contexte = { magasin, services } as unknown as ContexteToile
  const montrer = () => {
    const el = magasin.lire().elements.find((e) => e.id === element.id) as Element<Fichier>
    racine.render(<ModaleFichier contenu={el.contenu} adresse="/api/fichiers/f1" element={el} contexte={contexte} fermer={() => {}} />)
  }
  magasin.ecouter(() => act(montrer))
  await act(async () => montrer())
  await attendre()
  await attendre()
  return magasin
}

const bouton = (nom: string) => [...document.querySelectorAll<HTMLButtonElement>('.notak-pdf button')].find((b) => b.getAttribute('aria-label') === nom || b.textContent === nom)
const pointeur = (cible: EventTarget, type: string, x: number, y: number, pointerId = 1, pointerType = 'mouse') =>
  act(() => void cible.dispatchEvent(new PointerEvent(type, { pointerId, pointerType, button: 0, clientX: x, clientY: y, bubbles: true, cancelable: true })))
const touche = (key: string, plus: KeyboardEventInit = {}) =>
  act(() => void document.querySelector('.notak-pdf')!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...plus })))
const traitsMontres = (page = 1) => document.querySelectorAll(`.notak-pdf-page[data-page="${page}"] .notak-pdf-traits g`).length
const annotations = (m: Magasin) => (m.lire().elements[0]!.contenu as Fichier).annotations

describe('dessiner sur un PDF', () => {
  it('un trait sur la page 1, enregistré, se range dans l’élément en fractions de la page', async () => {
    const m = await ouvrir()
    act(() => bouton('Dessiner sur les pages (⇧D)')!.click())
    const couche = document.querySelector('.notak-pdf-page[data-page="1"] .notak-pdf-saisie')!
    expect(document.querySelector('.notak-pdf-barre-dessin')).not.toBeNull()
    pointeur(couche, 'pointerdown', 40, 56.6)
    pointeur(couche, 'pointermove', 200, 283)
    pointeur(couche, 'pointerup', 200, 283)
    expect(traitsMontres()).toBe(1)
    expect(annotations(m)).toBeUndefined()
    act(() => bouton('Enregistrer')!.click())
    const ranges = annotations(m)!['1']!
    expect(ranges).toHaveLength(1)
    expect(ranges[0]!.points).toEqual([
      [0.1, 0.1],
      [0.5, 0.5],
    ])
    expect(document.querySelector('.notak-pdf-barre-dessin')).toBeNull()
    expect(traitsMontres()).toBe(1)
  })

  it('en dessin, ⌘Z défait le dernier trait du brouillon, et rien d’autre', async () => {
    const m = await ouvrir()
    await touche('D', { shiftKey: true })
    const couche = document.querySelector('.notak-pdf-page[data-page="1"] .notak-pdf-saisie')!
    pointeur(couche, 'pointerdown', 40, 40)
    pointeur(couche, 'pointerup', 80, 40)
    pointeur(couche, 'pointerdown', 40, 200)
    pointeur(couche, 'pointerup', 80, 200)
    expect(traitsMontres()).toBe(2)
    await touche('z', { metaKey: true })
    expect(traitsMontres()).toBe(1)
    expect(m.peutAnnuler()).toBe(false)
    await touche('z', { metaKey: true, shiftKey: true })
    expect(traitsMontres()).toBe(2)
    // Abandonné, le brouillon ne s'écrit pas en partant.
    await touche('Escape')
    expect(annotations(m)).toBeUndefined()
  })

  it('l’enregistrement est un pas de l’historique de la toile ; ⌘Z dans la visionneuse, lui, n’y défait rien', async () => {
    const m = await ouvrir()
    await touche('D', { shiftKey: true })
    const couche = document.querySelector('.notak-pdf-page[data-page="1"] .notak-pdf-saisie')!
    pointeur(couche, 'pointerdown', 40, 40)
    pointeur(couche, 'pointerup', 80, 40)
    await touche('s', { metaKey: true })
    expect(annotations(m)?.['1']).toHaveLength(1)
    await touche('z', { metaKey: true })
    expect(annotations(m)?.['1']).toHaveLength(1)
    // Revenu sur la toile, son annuler le défait d'un pas, son rétablir le refait.
    act(() => void m.annuler())
    expect(annotations(m)).toBeUndefined()
    expect(traitsMontres()).toBe(0)
    act(() => void m.retablir())
    expect(annotations(m)?.['1']).toHaveLength(1)
  })

  it('le surligneur, la gomme, et l’annuler du brouillon', async () => {
    const m = await ouvrir(pdf({ annotations: { '1': [trait('a')] } }))
    await touche('D', { shiftKey: true })
    await touche('h')
    const couche = document.querySelector('.notak-pdf-page[data-page="1"] .notak-pdf-saisie')!
    pointeur(couche, 'pointerdown', 40, 300)
    pointeur(couche, 'pointerup', 200, 300)
    expect(document.querySelectorAll('.notak-pdf-traits [data-surligneur]')).toHaveLength(1)
    // La gomme passe sur le trait rouge de départ (de 40 à 160 px, à 56,6 px du haut).
    await touche('e')
    pointeur(couche, 'pointerdown', 100, 56.6)
    pointeur(couche, 'pointerup', 100, 56.6)
    expect(traitsMontres()).toBe(1)
    await touche('z', { metaKey: true })
    expect(traitsMontres()).toBe(2)
    act(() => bouton('Enregistrer')!.click())
    const ranges = annotations(m)!['1']!
    expect(ranges.map((t) => !!t.surligneur)).toEqual([false, true])
  })

  it('Échap abandonne le brouillon : rien n’est écrit', async () => {
    const m = await ouvrir()
    await touche('D', { shiftKey: true })
    const couche = document.querySelector('.notak-pdf-page[data-page="1"] .notak-pdf-saisie')!
    pointeur(couche, 'pointerdown', 40, 40)
    pointeur(couche, 'pointerup', 80, 40)
    await touche('Escape')
    expect(document.querySelector('.notak-pdf-barre-dessin')).toBeNull()
    expect(annotations(m)).toBeUndefined()
    expect(traitsMontres()).toBe(0)
  })

  it('ce qu’un autre a dessiné pendant ce temps reste quand on enregistre', async () => {
    const m = await ouvrir(pdf({ annotations: { '1': [trait('a')] } }))
    await touche('D', { shiftKey: true })
    const couche = document.querySelector('.notak-pdf-page[data-page="1"] .notak-pdf-saisie')!
    pointeur(couche, 'pointerdown', 40, 400)
    pointeur(couche, 'pointerup', 80, 400)
    // Un collaborateur pose un trait sur la même page, et la synchro l'apporte.
    const avant = m.lire().elements[0]!.contenu as Fichier
    act(() => m.faire([{ type: 'contenu', id: 'p1', avant, apres: { ...avant, annotations: { '1': [trait('a'), trait('autre')] } } }]))
    act(() => bouton('Enregistrer')!.click())
    expect(annotations(m)!['1']!.map((t) => t.id).slice(0, 2)).toEqual(['a', 'autre'])
    expect(annotations(m)!['1']).toHaveLength(3)
  })

  it('en lecture seule, on voit les traits sans pouvoir en tracer', async () => {
    await ouvrir(pdf({ annotations: { '1': [trait('a')] } }), { lectureSeule: true })
    expect(traitsMontres()).toBe(1)
    expect(bouton('Dessiner sur les pages (⇧D)')).toBeUndefined()
    await touche('D', { shiftKey: true })
    expect(document.querySelector('.notak-pdf-saisie')).toBeNull()
  })

  it('un élément figé ne se dessine pas', async () => {
    await ouvrir(pdf(), {}, { verrou: true })
    expect(bouton('Dessiner sur les pages (⇧D)')).toBeUndefined()
  })
})
