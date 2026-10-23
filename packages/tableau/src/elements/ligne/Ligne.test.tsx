// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { type Rect, depuisTaille, point } from '../../coeur/geometrie'
import type { Element, Extremite, Ligne as ContenuLigne, Tableau } from '../../coeur/tableau'
import { nouvelleColonne, nouvelleNote } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import './index'
import { RenduLigne } from './Ligne'
import { nouvelleLigne } from './creation'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root | null = null
let hote: HTMLElement | null = null
afterEach(() => {
  act(() => racine?.unmount())
  hote?.remove()
  racine = null
})

/** Dessine une ligne entre deux éléments aux rectangles donnés, et rend le `d` de son trait. */
function trait(elements: Element[], rects: Record<string, Rect>, depart: Extremite, arrivee: Extremite, ligne?: Partial<ContenuLigne>): string {
  const l = nouvelleLigne(depart, arrivee, ligne)
  const tableau: Tableau = { titre: '', elements: [...elements, l] }
  const contexte = {
    magasin: { lire: () => tableau, appliquerSeulement() {}, inscrire() {} },
    rect: (id: string) => rects[id] ?? null,
    versTableau: (p: { x: number; y: number }) => p,
  } as unknown as ContexteToile
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
  act(() => {
    racine!.render(
      <svg>
        <RenduLigne element={l} choisie={false} enEdition={false} contexte={contexte} brouillon={() => {}} changer={() => {}} />
      </svg>,
    )
  })
  return hote.querySelector('.notak-ligne-trait')!.getAttribute('d')!
}

const nombres = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)

describe('RenduLigne, accroche à un point précis', () => {
  const a = nouvelleNote(0, 0)
  const b = nouvelleNote(40, 0)
  const rects = { [a.id]: depuisTaille(point(0, 0), 20, 10), [b.id]: depuisTaille(point(40, 0), 20, 10) }

  it('sans ancre, le trait part du bord de l’élément, vers le centre de l’autre', () => {
    const [x0, y0] = nombres(trait([a, b], rects, { element: a.id }, { element: b.id }, { pointeArrivee: 'rien' }))
    expect(x0).toBeCloseTo(200, 3)
    expect(y0).toBeCloseTo(50, 3)
  })

  it('avec une ancre, le trait part de ce point précis', () => {
    const d = trait([a, b], rects, { element: a.id, ancre: { x: 0.5, y: 0 } }, { element: b.id }, { pointeArrivee: 'rien' })
    expect(nombres(d).slice(0, 2)).toEqual([100, 0])
  })

  it('l’ancre de l’arrivée est le point où le trait s’arrête', () => {
    const d = trait([a, b], rects, { element: a.id }, { element: b.id, ancre: { x: 0.5, y: 1 } }, { pointeArrivee: 'rien' })
    expect(nombres(d).slice(-2)).toEqual([500, 100])
  })

  it('l’ancre suit l’élément quand il a une autre taille', () => {
    const grand = { [a.id]: depuisTaille(point(0, 0), 40, 20), [b.id]: rects[b.id]! }
    const d = trait([a, b], grand, { element: a.id, ancre: { x: 0.5, y: 0 } }, { element: b.id }, { pointeArrivee: 'rien' })
    expect(nombres(d).slice(0, 2)).toEqual([200, 0])
  })
})

describe('RenduLigne, deux colonnes alignées', () => {
  const c1 = nouvelleColonne(0, 10)
  const c2 = nouvelleColonne(50, 12)
  const note = nouvelleNote(50, 60)

  it('le trait est horizontal, à la hauteur des titres', () => {
    const rects = { [c1.id]: depuisTaille(point(0, 10), 34, 40), [c2.id]: depuisTaille(point(50, 12), 34, 90) }
    const n = nombres(trait([c1, c2], rects, { element: c1.id }, { element: c2.id }, { pointeArrivee: 'rien' }))
    // M x0 y0 L x1 y1 : les deux hauteurs sont celles du titre de la plus basse (12 + 2,3 UG).
    expect(n[1]).toBe(143)
    expect(n[3]).toBe(143)
  })

  it('des colonnes de hauteurs de départ éloignées gardent le trait de centre à centre', () => {
    const rects = { [c1.id]: depuisTaille(point(0, 10), 34, 40), [c2.id]: depuisTaille(point(50, 40), 34, 40) }
    const n = nombres(trait([c1, c2], rects, { element: c1.id }, { element: c2.id }, { pointeArrivee: 'rien' }))
    expect(n[1]).not.toBe(n[3])
  })

  it('une colonne et une note ne se redressent pas', () => {
    const rects = { [c1.id]: depuisTaille(point(0, 10), 34, 40), [note.id]: depuisTaille(point(50, 12), 20, 10) }
    const n = nombres(trait([c1, note], rects, { element: c1.id }, { element: note.id }, { pointeArrivee: 'rien' }))
    expect(n[1]).not.toBe(n[3])
  })
})
