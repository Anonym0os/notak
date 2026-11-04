// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import type { ContexteToile } from '../types'
import './index'
import { contactDePaume, ouvrirDessinLibre } from './Dessin'
import { dessinLibreOuvert, poserDessinLibre, toileSuspendue } from './mode'
import { surLaToile } from '../../Toile'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
const doubleClic = vi.fn()

beforeEach(() => {
  doubleClic.mockClear()
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
  // La « toile » est gérée par React, comme la vraie : son double-clic crée une note.
  act(() => racine.render(<div className="notak-toile" onDoubleClick={doubleClic} />))
})
afterEach(() => {
  poserDessinLibre(false)
  act(() => racine.unmount())
  hote.remove()
})

function ouvrir() {
  const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [] })
  const contexte = {
    magasin,
    choisir: () => {},
    services: {},
    camera: { x: 0, y: 0, echelle: 1 },
    versTableau: (p: { x: number; y: number }) => p,
  } as unknown as ContexteToile
  act(() => ouvrirDessinLibre(contexte))
  return { magasin }
}

const double = (cible: Element) => act(() => void cible.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })))
const abandon = () => document.querySelector<HTMLButtonElement>('.notak-dessin-libre-barre button[title="Esc"]')!
const bouton = (nom: string) => document.querySelector<HTMLButtonElement>(`.notak-dessin-libre-barre button[aria-label="${nom}"]`)!

describe('le double-clic pendant le dessin libre', () => {
  it('la toile reste suspendue tant que la couche est ouverte, et revient à la sortie', () => {
    ouvrir()
    expect(dessinLibreOuvert()).toBe(true)
    expect(toileSuspendue(document.querySelector('.notak-toile'))).toBe(true)
    act(() => abandon().click())
    expect(dessinLibreOuvert()).toBe(false)
    expect(document.querySelector('.notak-dessin-libre')).toBeNull()
    expect(toileSuspendue(document.querySelector('.notak-toile'))).toBe(false)
  })

  it('ne traverse jamais vers la toile : ni sur la barre, ni sur la feuille, ni sur un bouton grisé', () => {
    ouvrir()
    const grise = bouton('Rétablir')
    expect(grise.getAttribute('aria-disabled')).toBe('true')
    expect(grise.disabled).toBe(false)
    double(document.querySelector('.notak-dessin-libre-barre')!)
    double(document.querySelector('.notak-dessin-libre-feuille')!)
    double(grise)
    double(document.querySelector('.notak-dessin-libre')!)
    expect(doubleClic).not.toHaveBeenCalled()
    act(() => abandon().click())
  })

  it('sans la couche, le double-clic de la toile passe (le garde ne bloque pas à tort)', () => {
    double(document.querySelector('.notak-toile')!)
    expect(doubleClic).toHaveBeenCalledTimes(1)
  })

  it('un bouton grisé n’agit pas', () => {
    const { magasin } = ouvrir()
    act(() => document.querySelector<HTMLButtonElement>('.notak-croquis-enregistrer')!.click())
    expect(document.querySelector('.notak-dessin-libre')).not.toBeNull()
    expect(magasin.lire().elements).toHaveLength(0)
    act(() => abandon().click())
  })
})

describe('où le Pencil dessine', () => {
  const toile = () => {
    const racine = document.createElement('div')
    racine.className = 'notak-toile'
    racine.innerHTML =
      '<div class="notak-glisse"><div class="notak-plan"><div data-id="a"><p>texte</p><button>ok</button><div contenteditable="true">écrit</div></div></div></div>' +
      '<nav class="notak-barre-outils"><button>outil</button></nav>' +
      '<div class="notak-toile"><div class="notak-glisse"><p>imbriquée</p></div></div>'
    document.body.append(racine)
    return racine
  }
  it('sur le fond et sur un élément, pas sur ce qui se manie ni sur l’interface', () => {
    const r = toile()
    expect(surLaToile(r, r)).toBe(true)
    expect(surLaToile(r.querySelector('p')!, r)).toBe(true)
    expect(surLaToile(r.querySelector('[data-id] button')!, r)).toBe(false)
    expect(surLaToile(r.querySelector('[contenteditable]')!, r)).toBe(false)
    expect(surLaToile(r.querySelector('nav button')!, r)).toBe(false)
    expect(surLaToile(r.querySelector('.notak-toile .notak-toile p')!, r)).toBe(false)
    r.remove()
  })
})

describe('la paume ne valide pas le dessin', () => {
  const pointeur = (type: string, init: PointerEventInit & { pointerType: string }) =>
    new PointerEvent(type, { bubbles: true, cancelable: true, isPrimary: true, button: 0, ...init })
  const sur = (cible: EventTarget, ev: Event) => act(() => void cible.dispatchEvent(ev))

  it('un contact large est une paume, un doigt ne l’est pas', () => {
    expect(contactDePaume({ width: 90, height: 70 })).toBe(true)
    expect(contactDePaume({ width: 24, height: 24 })).toBe(false)
    expect(contactDePaume({})).toBe(false)
  })

  it('ouverte sous le Pencil : une paume, ou un doigt juste après le trait, ne referme rien ; un vrai toucher enregistre', () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance'] })
    try {
      const magasin = creerMagasin({ titre: '', etiquettes: [], elements: [] })
      const contexte = {
        magasin,
        choisir: () => {},
        services: {},
        camera: { origine: { x: 0, y: 0 }, echelle: 1 },
        poserCamera: (c: unknown) => c,
      } as unknown as ContexteToile
      const appui = pointeur('pointerdown', { pointerType: 'pen', pointerId: 1, clientX: 10, clientY: 10, pressure: 0.5 })
      act(() => ouvrirDessinLibre(contexte, undefined, appui))
      const feuille = document.querySelector('.notak-dessin-libre-feuille')!
      for (let i = 1; i <= 5; i++) sur(document, pointeur('pointermove', { pointerType: 'pen', pointerId: 1, clientX: 10 + i * 10, clientY: 10, pressure: 0.5 }))
      sur(document, pointeur('pointerup', { pointerType: 'pen', pointerId: 1, clientX: 60, clientY: 10 }))
      const toucher = (id: number, taille: number) => {
        sur(feuille, pointeur('pointerdown', { pointerType: 'touch', pointerId: id, clientX: 200, clientY: 200, width: taille, height: taille }))
        sur(feuille, pointeur('pointerup', { pointerType: 'touch', pointerId: id, clientX: 200, clientY: 200, width: taille, height: taille }))
      }
      // La main qui écrit se pose aussitôt après le trait.
      vi.advanceTimersByTime(100)
      toucher(2, 20)
      expect(dessinLibreOuvert()).toBe(true)
      // Plus tard, une paume large.
      vi.advanceTimersByTime(2000)
      toucher(3, 90)
      expect(dessinLibreOuvert()).toBe(true)
      // Un vrai toucher du doigt : le dessin s'enregistre et la couche se referme.
      toucher(4, 20)
      expect(dessinLibreOuvert()).toBe(false)
      expect(magasin.lire().elements).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
