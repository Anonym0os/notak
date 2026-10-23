// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { creerMagasin } from '../../coeur/magasin'
import type { Croquis, Element } from '../../coeur/tableau'
import { definirLangue } from '../../langue'
import type { ContexteToile } from '../types'
import './index'
import { definition } from '../registre'
import { RenduCroquis } from './Croquis'
import { couleurAffichee } from './trace'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let hote: HTMLElement
const rect = SVGElement.prototype.getBoundingClientRect
beforeEach(() => {
  definirLangue('fr')
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
  // Une feuille de 640 px de large : un pixel d'écran vaut une unité de feuille.
  SVGElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 393, right: 640, bottom: 393, x: 0, y: 0, toJSON: () => ({}) })
})
afterEach(() => {
  act(() => racine.unmount())
  hote.remove()
  SVGElement.prototype.getBoundingClientRect = rect
})

const croquis = (plus: Partial<Croquis> = {}): Element<Croquis> => ({
  id: 'C',
  x: 0,
  y: 0,
  largeur: 34,
  contenu: { type: 'croquis', traits: [], hauteur: 393, ...plus } as Croquis,
})

function monter(elements: Element[] = [croquis()]) {
  const magasin = creerMagasin({ titre: '', elements })
  const contexte = { magasin, services: {}, finirEdition: () => {}, choisir: () => {}, selection: new Set(['C']) } as unknown as ContexteToile
  const ecrits: Croquis[] = []
  act(() =>
    racine.render(
      <RenduCroquis element={elements[0] as Element<Croquis>} choisie enEdition contexte={contexte} brouillon={(c) => void ecrits.push(c)} changer={() => {}} />,
    ),
  )
  return { ecrits }
}

const surface = () => document.querySelector<SVGSVGElement>('.notak-croquis-surface')!
const barre = () => document.querySelector<HTMLElement>('.notak-croquis-barre')!
function pointeur(type: string, id: number, x = 100, y = 100) {
  const e = Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y }), { pointerId: id })
  act(() => void surface().dispatchEvent(e))
}

describe('la feuille du croquis ouvert', () => {
  it('la fenêtre de couleur propose les couleurs les plus utilisées du tableau, sous la palette', () => {
    const autre: Element = { id: 'N', x: 0, y: 0, largeur: 17, contenu: { type: 'nuancier', couleur: '#12ab34' } }
    monter([croquis(), autre])
    act(() => barre().querySelector<HTMLButtonElement>('button[aria-label="Couleur"]')!.click())
    const grilles = document.querySelectorAll('.notak-croquis-couleurs .notak-croquis-grille')
    expect(grilles).toHaveLength(2)
    expect([...grilles[1]!.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'))).toEqual(['#12ab34'])
  })

  it('un tableau sans couleur propre ne montre que la palette', () => {
    monter()
    act(() => barre().querySelector<HTMLButtonElement>('button[aria-label="Couleur"]')!.click())
    expect(document.querySelectorAll('.notak-croquis-couleurs .notak-croquis-grille')).toHaveLength(1)
  })

  it('un trait suivi près du bas de la fenêtre efface la barre, qui revient au lâcher', () => {
    monter()
    pointeur('pointerdown', 1, 100, 100)
    pointeur('pointermove', 1, 120, 120)
    expect(barre().hasAttribute('data-effacee')).toBe(false)
    pointeur('pointermove', 1, 120, window.innerHeight - 10)
    expect(barre().hasAttribute('data-effacee')).toBe(true)
    pointeur('pointerup', 1, 120, window.innerHeight - 10)
    expect(barre().hasAttribute('data-effacee')).toBe(false)
  })

  it('un trait se pose au lâcher ; un troisième doigt l’annule', () => {
    const { ecrits } = monter()
    pointeur('pointerdown', 1, 100, 100)
    pointeur('pointermove', 1, 140, 130)
    pointeur('pointerup', 1, 140, 130)
    expect(ecrits.at(-1)!.traits).toHaveLength(1)
    const avant = ecrits.length
    pointeur('pointerdown', 1, 100, 100)
    pointeur('pointermove', 1, 160, 150)
    pointeur('pointerdown', 2, 300, 300)
    pointeur('pointerdown', 3, 320, 320)
    pointeur('pointerup', 1, 160, 150)
    expect(ecrits).toHaveLength(avant)
  })

  it('un croquis transparent n’a plus de carte, et son encre par défaut suit le thème sur la toile', () => {
    const trait = { points: [0, 0, 5, 5], couleur: '#323b4a', epaisseur: 2 }
    const el = croquis({ couleur: 'transparent', traits: [trait, { ...trait, couleur: '#ff5757' }] })
    const def = definition('croquis')!
    expect((def.sansFond as (c: Croquis) => boolean)(el.contenu)).toBe(true)
    expect((def.sansFond as (c: Croquis) => boolean)({ ...el.contenu, avecLegende: true })).toBe(false)
    expect((def.sansFond as (c: Croquis) => boolean)({ ...el.contenu, couleur: 'jaune' })).toBe(false)
    const contexte = { magasin: creerMagasin({ titre: '', elements: [el] }), services: {}, finirEdition: () => {}, choisir: () => {}, selection: new Set(['C']) } as unknown as ContexteToile
    act(() => racine.render(<RenduCroquis element={el} choisie enEdition={false} contexte={contexte} brouillon={() => {}} changer={() => {}} />))
    expect([...hote.querySelectorAll('.notak-croquis path')].map((p) => p.getAttribute('stroke'))).toEqual(['var(--notak-trait-defaut)', '#ff5757'])
  })

  it('le fond transparent suit le thème : l’encre par défaut passe à la couleur de ligne du thème', () => {
    expect(couleurAffichee('#323b4a', true)).toBe('var(--notak-trait-defaut)')
    expect(couleurAffichee('#323B4A', true)).toBe('var(--notak-trait-defaut)')
    expect(couleurAffichee('#323b4a', false)).toBe('#323b4a')
    expect(couleurAffichee('#ff5757', true)).toBe('#ff5757')
  })
})
