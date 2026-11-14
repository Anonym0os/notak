// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { creerMagasin } from './coeur/magasin'
import { type Element as ElementToile, nouvelleNote } from './coeur/tableau'
import './elements'
import { ouvrirFenetreFichier } from './elements/fichier/ouverture'
import { imageOuverte, ouvrirImage } from './elements/image/visionneuse'
import { fermerMenus } from './menuUnique'
import { Toile } from './Toile'
import type { Services } from './elements/types'

/**
 * Le double-clic sur un élément qui porte une légende l'ouvre, toujours, légende comprise ; seul le champ où l'on écrit
 * déjà garde le double-clic. Les gestes sont ceux d'une souris : appui, relâchement, clic (son rang dans `detail`), et
 * le double-clic après le second clic. jsdom ne calcule pas la mise en page : `elementFromPoint` rend le nœud visé.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

class ObservateurMuet {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let racine: Root
let hote: HTMLElement
let vise: Element | null = null
/** Le nœud qui a pris le pointeur à l'appui : le relâchement et le clic lui reviennent, comme dans Chrome. */
let capture: Element | null = null
beforeEach(() => {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ObservateurMuet
  document.elementFromPoint = () => vise
  document.elementsFromPoint = () => (vise ? [vise] : [])
  HTMLElement.prototype.setPointerCapture ??= () => {}
  vi.spyOn(HTMLElement.prototype, 'setPointerCapture').mockImplementation(function (this: HTMLElement) {
    capture = this
  })
  HTMLElement.prototype.releasePointerCapture ??= () => {}
  HTMLElement.prototype.hasPointerCapture ??= () => false
  ;(globalThis as { CSS?: { escape(s: string): string } }).CSS ??= { escape: (s) => s }
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  fermerMenus()
  // L'ouverture d'un fichier ou d'une image est un état du module : un essai ne la laisse pas au suivant.
  act(() => {
    ouvrirFenetreFichier(null)
    ouvrirImage(null)
  })
  vise = null
  for (const n of document.querySelectorAll('input[type="color"]')) n.remove()
  vi.restoreAllMocks()
})

let instant = 1000
/** Un évènement de souris (jsdom n'a pas de PointerEvent : un MouseEvent qui en a les champs). */
function souris(cible: Node, type: string, detail = 0, pointeur: 'mouse' | 'touch' = 'mouse') {
  instant += 40
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerdown' ? 1 : 0, clientX: 100, clientY: 100, detail })
  Object.defineProperties(e, { pointerType: { value: pointeur }, pointerId: { value: 1 }, isPrimary: { value: true }, timeStamp: { value: instant } })
  act(() => void cible.dispatchEvent(e))
}

/**
 * Un toucher du doigt sur ce nœud : posé, relevé, puis le clic que la webview en tire (rang 1 : celle d'iOS n'envoie
 * pas de double-clic fiable, ni de rang sûr). `sansClic` : le toucher seul.
 */
function toucher(cible: () => Node, sansClic = false) {
  vise = cible() as Element
  capture = null
  souris(vise, 'pointerdown', 0, 'touch')
  const recoit = capture ?? vise
  souris(recoit, 'pointerup', 0, 'touch')
  if (!sansClic && vise.isConnected) souris(recoit, 'click', 1, 'touch')
}

/** Un clic de souris sur ce nœud, de rang `rang` (1 : un clic seul, 2 : le second d'un double-clic). */
function clic(cible: () => Node, rang: number) {
  vise = cible() as Element
  capture = null
  souris(vise, 'pointerdown')
  const recoit = capture ?? vise
  souris(recoit, 'pointerup')
  // Le nœud de l'appui remplacé au relâchement (une légende devenue champ), Chrome n'envoie ni clic ni double-clic.
  if (!vise.isConnected) return
  souris(recoit, 'click', rang)
}

/** Un double-clic : deux clics, puis le double-clic où le second clic est arrivé. */
function doubleClic(cible: () => Node) {
  clic(cible, 1)
  clic(cible, 2)
  if (!vise?.isConnected) return
  souris(capture ?? vise, 'dblclick', 2)
}

const fichier: ElementToile = {
  id: 'F',
  x: 0,
  y: 0,
  largeur: 34,
  contenu: { type: 'fichier', fichier: 'f1', nom: 'budget.xlsx', typeMime: '', taille: 111_000, legende: 'Version signée' },
}
const image: ElementToile = {
  id: 'I',
  x: 40,
  y: 0,
  largeur: 30,
  contenu: { type: 'image', fichier: 'i1', largeurOrigine: 300, hauteurOrigine: 200, typeMime: 'image/jpeg', legende: 'Façade sud' },
}

function monter(elements: ElementToile[]) {
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements })
  const pleinEcran = vi.fn()
  const services: Services = { pleinEcran, fichiers: { enregistrer: async () => 'x', adresse: async () => '/api/fichiers/ab' } }
  act(() => racine.render(<Toile magasin={magasin} services={services} />))
  const carte = (id: string) => hote.querySelector<HTMLElement>(`.notak-carte[data-id="${id}"]`)!
  const enEdition = () => [...hote.querySelectorAll<HTMLElement>('.notak-carte[data-edition]')].map((n) => n.dataset.id)
  return { magasin, pleinEcran, carte, enEdition }
}

describe('le double-clic sur un fichier', () => {
  const legende = () => hote.querySelector('[data-id="F"] .notak-fichier-legende')!
  const apercu = () => hote.querySelector('[data-id="F"] .notak-fichier-sans-apercu')!

  it('l’ouvre quand il n’était pas choisi, même sur sa légende, sans rien laisser à écrire', () => {
    const m = monter([fichier])
    doubleClic(legende)
    expect(m.pleinEcran).toHaveBeenLastCalledWith('F')
    expect(m.enEdition()).toEqual([])
  })

  it('l’ouvre aussi quand il l’était déjà : le premier clic sur la légende l’ouvre à l’écriture, le double-clic l’emporte', () => {
    const m = monter([fichier])
    clic(apercu, 1)
    expect(m.carte('F').hasAttribute('data-choisie')).toBe(true)
    doubleClic(legende)
    expect(m.pleinEcran).toHaveBeenLastCalledWith('F')
    expect(m.enEdition()).toEqual([])
  })

  it('choisi, un clic hors de ses champs le laisse choisi, sans ouvrir de légende ; le double-clic l’ouvre', () => {
    const m = monter([fichier])
    clic(apercu, 1)
    clic(apercu, 1)
    expect(m.enEdition()).toEqual([])
    expect(hote.querySelector('[data-id="F"] input')).toBeNull()
    doubleClic(apercu)
    expect(m.pleinEcran).toHaveBeenLastCalledWith('F')
  })

  it('choisi, un clic sur sa légende l’écrit, curseur dans la légende ; le double-clic y choisit alors un mot', () => {
    const m = monter([fichier])
    clic(apercu, 1)
    clic(legende, 1)
    expect(m.enEdition()).toEqual(['F'])
    const champ = hote.querySelector<HTMLInputElement>('[data-id="F"] input.notak-fichier-legende')!
    expect(document.activeElement).toBe(champ)
    // Le curseur est dans la légende : un double-clic sur un de ses mots ne quitte pas l'écriture.
    doubleClic(() => champ)
    expect(m.pleinEcran).not.toHaveBeenCalledWith('F')
    expect(m.enEdition()).toEqual(['F'])
  })

  it('au doigt, choisi, deux touchers sur la légende l’ouvrent aussi, même si le premier a ouvert le champ', () => {
    const m = monter([fichier])
    clic(apercu, 1)
    instant += 1000
    toucher(legende, true)
    expect(m.enEdition()).toEqual(['F'])
    toucher(legende, true)
    expect(m.pleinEcran).toHaveBeenLastCalledWith('F')
    expect(m.enEdition()).toEqual([])
  })

  it('pendant qu’on écrit sa légende, un double-clic ailleurs sur lui l’ouvre et referme l’écriture', () => {
    const m = monter([fichier])
    clic(apercu, 1)
    clic(legende, 1)
    clic(() => hote.querySelector('[data-id="F"] input.notak-fichier-legende')!, 1)
    doubleClic(apercu)
    expect(m.pleinEcran).toHaveBeenLastCalledWith('F')
    expect(m.enEdition()).toEqual([])
  })
})

describe('le double-clic sur une image', () => {
  const legende = () => hote.querySelector('[data-id="I"] .notak-legende')!
  const cadre = () => hote.querySelector('[data-id="I"] .notak-image-cadre')!

  it('l’ouvre en grand depuis sa légende, choisie ou non', () => {
    monter([image])
    doubleClic(legende)
    expect(imageOuverte()).toBe('I')
    act(() => ouvrirImage(null))
    // Choisie : le premier clic sur la légende ouvre son champ, le second clic y tombe, le double-clic ouvre l'image.
    doubleClic(legende)
    expect(imageOuverte()).toBe('I')
  })

  it('choisie, un clic sur l’image ne l’ouvre plus à l’écriture de sa légende', () => {
    const m = monter([image])
    clic(cadre, 1)
    clic(cadre, 1)
    expect(m.enEdition()).toEqual([])
  })
})

describe('le double-clic sur un lien', () => {
  const lien: ElementToile = {
    id: 'L',
    x: 0,
    y: 40,
    largeur: 34,
    contenu: { type: 'lien', url: 'https://exemple.fr/page', statut: 'pret', apercu: { titre: 'Une page', description: 'Ce que la page raconte' } },
  }
  const legende = () => hote.querySelector('[data-id="L"] .notak-lien-description')!
  const titre = () => hote.querySelector('[data-id="L"] .notak-lien-titre')!

  it('ouvre sa page, légende comprise, choisi ou non', () => {
    const onglet = vi.spyOn(window, 'open').mockReturnValue(null)
    const m = monter([lien])
    doubleClic(legende)
    expect(onglet).toHaveBeenLastCalledWith('https://exemple.fr/page', '_blank', 'noopener,noreferrer')
    doubleClic(legende)
    expect(onglet).toHaveBeenCalledTimes(2)
    expect(m.enEdition()).toEqual([])
  })

  it('choisi seul, un clic sur son titre le renomme encore', () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    const m = monter([lien])
    clic(legende, 1)
    clic(titre, 1)
    expect(m.enEdition()).toEqual(['L'])
    expect(document.activeElement?.classList.contains('notak-lien-titre')).toBe(true)
  })
})

describe('le double-clic sur la légende d’un croquis ou d’un nuancier', () => {
  it('ouvre le croquis, que la légende soit choisie ou non', () => {
    const croquis: ElementToile = { id: 'C', x: 0, y: 0, largeur: 20, contenu: { type: 'croquis', traits: [], avecLegende: true, legende: 'Plan du rez' } }
    const m = monter([croquis])
    const legende = () => hote.querySelector('[data-id="C"] .notak-croquis-legende')!
    doubleClic(legende)
    expect(m.enEdition()).toEqual(['C'])
  })

  it('choisi, le premier clic écrit la légende du croquis, le double-clic ouvre quand même le croquis', () => {
    const croquis: ElementToile = { id: 'C', x: 0, y: 0, largeur: 20, contenu: { type: 'croquis', traits: [], avecLegende: true, legende: 'Plan du rez' } }
    const m = monter([croquis])
    const legende = () => hote.querySelector('[data-id="C"] .notak-croquis-legende')!
    clic(() => hote.querySelector('[data-id="C"] svg')!, 1)
    doubleClic(legende)
    expect(m.enEdition()).toEqual(['C'])
    expect(hote.querySelector('textarea.notak-croquis-legende-champ')).toBeNull()
  })

  it('ouvre le sélecteur d’un nuancier choisi depuis sa légende', () => {
    const nuancier: ElementToile = { id: 'U', x: 0, y: 0, largeur: 17, contenu: { type: 'nuancier', couleur: '#4f8cff', avecLegende: true, legende: 'Bleu' } }
    monter([nuancier])
    const legende = () => hote.querySelector('[data-id="U"] .notak-nuancier-legende')!
    clic(() => hote.querySelector('[data-id="U"] .notak-nuancier')!, 1)
    doubleClic(legende)
    expect(document.querySelector('input[type="color"]')).not.toBeNull()
  })
})

describe('au doigt, deux touchers sur une légende', () => {
  it('ouvrent une image qui n’était pas choisie, sans rouvrir sa légende ensuite', () => {
    const m = monter([image])
    const legende = () => hote.querySelector('[data-id="I"] .notak-legende')!
    toucher(legende)
    toucher(legende)
    expect(imageOuverte()).toBe('I')
    expect(m.enEdition()).toEqual([])
  })

  it('ouvrent une image qui n’était pas choisie, même quand le premier toucher n’a pas ouvert sa légende', () => {
    const m = monter([image])
    const legende = () => hote.querySelector('[data-id="I"] .notak-legende')!
    // La webview n'a pas tiré de clic du premier toucher : la légende, désormais choisie, arrête l'appui du second.
    toucher(legende, true)
    toucher(legende)
    expect(imageOuverte()).toBe('I')
    expect(m.enEdition()).toEqual([])
  })

  it('ouvrent une image déjà choisie', () => {
    const m = monter([image])
    toucher(() => hote.querySelector('[data-id="I"] .notak-image-cadre')!)
    instant += 1000
    const legende = () => hote.querySelector('[data-id="I"] .notak-legende')!
    toucher(legende)
    toucher(legende)
    expect(imageOuverte()).toBe('I')
    expect(m.enEdition()).toEqual([])
  })

  it('ouvrent un croquis, choisi ou non, et referment le champ que le premier toucher a ouvert', () => {
    const croquis: ElementToile = { id: 'C', x: 0, y: 0, largeur: 20, contenu: { type: 'croquis', traits: [], avecLegende: true, legende: 'Plan du rez' } }
    const legende = () => hote.querySelector('[data-id="C"] .notak-croquis-legende')!
    const m = monter([croquis])
    toucher(legende)
    toucher(legende)
    expect(m.enEdition()).toEqual(['C'])
    expect(hote.querySelector('textarea.notak-croquis-legende-champ')).toBeNull()
  })

  it('choisi, le croquis s’ouvre aussi quand le premier toucher a ouvert sa légende', () => {
    const croquis: ElementToile = { id: 'C', x: 0, y: 0, largeur: 20, contenu: { type: 'croquis', traits: [], avecLegende: true, legende: 'Plan du rez' } }
    const legende = () => hote.querySelector('[data-id="C"] .notak-croquis-legende')!
    const m = monter([croquis])
    toucher(() => hote.querySelector('[data-id="C"] svg')!)
    instant += 1000
    toucher(legende)
    expect(hote.querySelector('textarea.notak-croquis-legende-champ')).not.toBeNull()
    toucher(legende)
    expect(m.enEdition()).toEqual(['C'])
    expect(hote.querySelector('textarea.notak-croquis-legende-champ')).toBeNull()
  })

  it('dans le champ où l’on écrivait déjà, ils n’ouvrent rien : le mot reste à choisir', () => {
    const croquis: ElementToile = { id: 'C', x: 0, y: 0, largeur: 20, contenu: { type: 'croquis', traits: [], avecLegende: true, legende: 'Plan du rez' } }
    const m = monter([croquis])
    toucher(() => hote.querySelector('[data-id="C"] svg')!)
    instant += 1000
    toucher(() => hote.querySelector('[data-id="C"] .notak-croquis-legende')!)
    instant += 1000
    const champ = () => hote.querySelector('textarea.notak-croquis-legende-champ')!
    toucher(champ)
    instant += 1000
    toucher(champ)
    toucher(champ)
    expect(m.enEdition()).toEqual([])
    expect(hote.querySelector('textarea.notak-croquis-legende-champ')).not.toBeNull()
  })
})

describe('le double-clic sur une note', () => {
  it('l’écrit toujours : pour elle, ouvrir, c’est écrire', () => {
    const note = { ...nouvelleNote(0, 30, 'Bonjour'), id: 'N' }
    const m = monter([note])
    doubleClic(() => hote.querySelector('[data-id="N"]')!)
    expect(m.enEdition()).toEqual(['N'])
    expect(m.pleinEcran).not.toHaveBeenCalledWith('N')
  })
})
