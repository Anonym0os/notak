// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { retirerAvis } from './avis'
import { type Magasin, creerMagasin } from './coeur/magasin'
import { TYPE_PAQUET } from './coeur/pressePapiers'
import { type Element, type Tableau, nouvelleNote } from './coeur/tableau'
import './elements'
import type { Services } from './elements/types'
import { fermerMenus } from './menuUnique'
import { Toile } from './Toile'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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

const pointeur = (cible: globalThis.Element, type: string, x: number, y: number, o: { shiftKey?: boolean } = {}) =>
  act(() => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, ...o })
    Object.assign(e, { pointerId: 1, pointerType: 'mouse' })
    cible.dispatchEvent(e)
  })
const touche = (cible: globalThis.Element, key: string, o: KeyboardEventInit = {}) =>
  act(() => void cible.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...o })))

const carte = (id: string, cible: string, x: number): Element => ({ id, x, y: 0, largeur: 10, contenu: { type: 'tableau', cible } })

/** L'accueil : la carte de « Clients », que Silak a généré, celle d'une autre toile, et une note. */
async function accueil() {
  const note = nouvelleNote(0, 30, 'Une idée')
  const magasin: Magasin = creerMagasin({ titre: 'Accueil', etiquettes: [], elements: [carte('c-clients', 'clients', 0), carte('c-projets', 'projets', 40), note] })
  const deposes: { cible: string; ids: string[] }[] = []
  const titres: Record<string, string> = { clients: 'Clients', projets: 'Projets' }
  const services: Services = {
    droits: { role: 'proprietaire', elements: {}, generes: { clients: 'Silak' } },
    tableau: (id) => ({ titre: titres[id] ?? '', elements: [] }) as Tableau,
    deposerDans: (cible, elements) => {
      deposes.push({ cible, ids: elements.map((e) => e.id) })
      return elements.map((e) => ({ ...e, id: `${e.id}-la` }))
    },
    colorerTableau: vi.fn(),
    renommerTableau: vi.fn(),
    ouvrirTableau: vi.fn(),
  }
  act(() => racine.render(<Toile magasin={magasin} services={services} />))
  await act(async () => {})
  const noeud = (id: string) => hote.querySelector(`.notak-carte[data-id="${id}"]`)!
  const choisir = (id: string, o: { shiftKey?: boolean } = {}) => {
    pointeur(noeud(id), 'pointerdown', 10, 10, o)
    pointeur(noeud(id), 'pointerup', 10, 10, o)
  }
  const element = (id: string) => magasin.lire().elements.find((e) => e.id === id)
  const avis = () => hote.querySelector('.notak-avis span')?.textContent ?? ''
  return { magasin, services, deposes, note, noeud, choisir, element, avis, toile: hote.querySelector<HTMLElement>('.notak-toile')! }
}

const AVIS = '« Clients » est généré par Silak : il reste tel quel.'

describe('la carte d’un dossier généré, sur la toile qui la porte', () => {
  it('ne part pas à la corbeille ; choisie avec une note, la note y va seule, et l’avis le dit', async () => {
    const { toile, choisir, element, avis, note } = await accueil()
    choisir('c-clients')
    touche(toile, 'Backspace')
    expect(element('c-clients')?.corbeille).toBeUndefined()
    expect(avis()).toBe(AVIS)
    choisir(note.id, { shiftKey: true })
    touche(toile, 'Backspace')
    expect(element(note.id)?.corbeille).toBeTypeOf('number')
    expect(element('c-clients')?.corbeille).toBeUndefined()
    expect(avis()).toBe(`Mis à la corbeille. ${AVIS}`)
  })

  it('ne se duplique pas', async () => {
    const { toile, choisir, magasin, avis } = await accueil()
    choisir('c-clients')
    touche(toile, 'd', { metaKey: true, ctrlKey: true })
    expect(magasin.lire().elements).toHaveLength(3)
    expect(avis()).toBe(AVIS)
  })

  it('bouge sur sa toile ; lâchée sur une autre toile, elle n’y va pas et revient à sa place', async () => {
    const { noeud, element, deposes, avis } = await accueil()
    pointeur(noeud('c-clients'), 'pointerdown', 10, 10)
    pointeur(noeud('c-clients'), 'pointermove', 60, 10)
    pointeur(noeud('c-clients'), 'pointermove', 110, 50)
    pointeur(noeud('c-clients'), 'pointerup', 110, 50)
    await act(async () => {})
    expect(element('c-clients')?.x).not.toBe(0)
    const x = element('c-clients')!.x

    sousLePointeur.noeuds = [noeud('c-projets')]
    pointeur(noeud('c-clients'), 'pointerdown', 10, 10)
    pointeur(noeud('c-clients'), 'pointermove', 60, 10)
    pointeur(noeud('c-clients'), 'pointermove', 200, 10)
    pointeur(noeud('c-clients'), 'pointerup', 200, 10)
    await act(async () => {})
    expect(deposes).toEqual([])
    expect(element('c-clients')).toMatchObject({ x, contenu: { cible: 'clients' } })
    expect(avis()).toBe(AVIS)
  })

  it('lâchée sur une autre toile avec une note, la note y part seule', async () => {
    const { noeud, choisir, element, deposes, avis, note } = await accueil()
    choisir('c-clients')
    choisir(note.id, { shiftKey: true })
    sousLePointeur.noeuds = [noeud('c-projets')]
    pointeur(noeud(note.id), 'pointerdown', 10, 10)
    pointeur(noeud(note.id), 'pointermove', 60, 10)
    pointeur(noeud(note.id), 'pointermove', 200, 10)
    pointeur(noeud(note.id), 'pointerup', 200, 10)
    await act(async () => {})
    expect(deposes).toEqual([{ cible: 'projets', ids: [note.id] }])
    expect(element(note.id)).toBeUndefined()
    expect(element('c-clients')).toBeDefined()
    expect(avis()).toBe(`Déplacé dans « Projets ». ${AVIS}`)
  })

  it('ne se renomme ni ne se recolore : le champ ne s’ouvre pas, la couleur ne part pas', async () => {
    const { toile, choisir, services, avis } = await accueil()
    choisir('c-clients')
    touche(toile, 'Enter')
    await act(async () => {})
    expect(hote.querySelector('.notak-renvoi-saisie')).toBeNull()
    expect(avis()).toBe(AVIS)
    act(() => retirerAvis())
    const palette = hote.querySelector<HTMLButtonElement>('button[aria-label="Couleur de la toile"]')
    expect(palette).not.toBeNull()
    act(() => palette!.click())
    const pastille = hote.querySelector<HTMLButtonElement>('.notak-panneau-couleur button')
    expect(pastille).not.toBeNull()
    act(() => pastille!.click())
    expect(services.colorerTableau).not.toHaveBeenCalled()
    expect(avis()).toBe(AVIS)
  })

  it('coupée avec une note, elle reste là ; la note part dans le presse-papiers', async () => {
    const { toile, choisir, avis, note, noeud } = await accueil()
    choisir('c-clients')
    choisir(note.id, { shiftKey: true })
    act(() => toile.focus())
    const donnees = new Map<string, string>()
    const e = Object.assign(new Event('cut', { cancelable: true }), { clipboardData: { setData: (type: string, v: string) => void donnees.set(type, v), getData: () => '' } })
    act(() => void document.dispatchEvent(e))
    const paquet = JSON.parse(donnees.get(TYPE_PAQUET) ?? '{}') as { elements?: { id: string }[] }
    expect(paquet.elements?.map((x) => x.id)).toEqual([note.id])
    expect(avis()).toBe(AVIS)
    // Ce qui est coupé se masque jusqu'au collage ; la carte, elle, est toujours là.
    expect(noeud('c-clients')).not.toBeNull()
  })
})

describe('sans dossier généré', () => {
  it('une carte de toile se jette comme avant', async () => {
    const { toile, choisir, element, avis } = await accueil()
    choisir('c-projets')
    touche(toile, 'Backspace')
    expect(element('c-projets')?.corbeille).toBeTypeOf('number')
    expect(avis()).toBe('Mis à la corbeille')
  })
})

describe('lâcher sur la carte d’une toile', () => {
  it('une toile qu’on ne peut pas écrire d’ici refuse ce qu’on y lâche : la note reste, et l’avis le dit', async () => {
    const { noeud, element, services, avis, note } = await accueil()
    // L'espace refuse le dépôt dans une toile en lecture seule (`deposerDans`, dans `EspaceNotak`).
    services.deposerDans = () => undefined
    sousLePointeur.noeuds = [noeud('c-projets')]
    pointeur(noeud(note.id), 'pointerdown', 10, 10)
    pointeur(noeud(note.id), 'pointermove', 60, 10)
    pointeur(noeud(note.id), 'pointermove', 200, 10)
    pointeur(noeud(note.id), 'pointerup', 200, 10)
    await act(async () => {})
    expect(element(note.id)).toMatchObject({ x: note.x, y: note.y })
    expect(avis()).toBe('« Projets » ne se modifie pas d’ici : rien n’y est parti')
  })
})
