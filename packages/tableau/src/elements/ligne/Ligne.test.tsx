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
    // Le trait s'arrête 1 px avant le bord (x = 200).
    expect(x0).toBeCloseTo(201, 3)
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
    // M x0 y0 L x1 y1 : les deux hauteurs sont à 3,2 UG sous le plus bas des deux hauts (12 + 3,2 UG).
    expect(n[1]).toBeCloseTo(152, 3)
    expect(n[3]).toBeCloseTo(152, 3)
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

/** Rend une ligne libre et rend le conteneur. */
function monter(ligne: Partial<ContenuLigne>, choisie = false, verrou = false) {
  const l = { ...nouvelleLigne({ x: 0, y: 0 }, { x: 20, y: 0 }, ligne), ...(verrou ? { verrou: true } : {}) }
  const tableau: Tableau = { titre: '', elements: [l] }
  const contexte = {
    magasin: { lire: () => tableau, appliquerSeulement() {}, inscrire() {} },
    rect: () => null,
    versTableau: (p: { x: number; y: number }) => p,
    camera: { origine: point(0, 0), echelle: 1 },
  } as unknown as ContexteToile
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
  act(() => {
    racine!.render(
      <svg>
        <RenduLigne element={l} choisie={choisie} enEdition={false} contexte={contexte} brouillon={() => {}} changer={() => {}} />
      </svg>,
    )
  })
  return hote
}

describe('RenduLigne, rendu', () => {
  it('la flèche dépasse le point d’arrivée de l’épaisseur du trait et le trait n’est pas raccourci', () => {
    const h = monter({ epaisseur: 2 })
    // Le trait va jusqu’au bout (200 px), la pointe est à 2 px au-delà.
    expect(nombres(h.querySelector('.notak-ligne-trait')!.getAttribute('d')!).slice(-2)).toEqual([200, 0])
    const pts = nombres(h.querySelector('polygon')!.getAttribute('points')!)
    expect(pts[0]).toBeCloseTo(202, 3)
    // Aussi large que long : base à 10 px en arrière, 5 px de part et d’autre.
    expect(pts[2]).toBeCloseTo(192, 3)
    expect(Math.abs(pts[3]! - pts[5]!)).toBeCloseTo(10, 3)
  })

  it('un bout sans pointe est arrondi (un petit rond au diamètre du trait)', () => {
    const h = monter({ pointeDepart: 'rien', pointeArrivee: 'rien', epaisseur: 4 })
    const ronds = [...h.querySelectorAll('circle')]
    expect(ronds).toHaveLength(2)
    expect(ronds[0]!.getAttribute('r')).toBe('2')
  })

  it('choisie : ni halo, trois poignées de 8 px', () => {
    const h = monter({}, true)
    expect(h.querySelector('.notak-ligne-halo')).toBeNull()
    const poignees = [...h.querySelectorAll('.notak-ligne-poignee')]
    expect(poignees.map((p) => p.getAttribute('data-extremite'))).toEqual(['depart', 'arrivee', 'courbe'])
    expect(h.querySelector('.notak-ligne-poignee-disque')!.getAttribute('r')).toBe('4')
  })

  it('verrouillée, ses poignées sont inertes', () => {
    const h = monter({}, true, true)
    expect([...h.querySelectorAll('.notak-ligne-poignee')].every((p) => p.hasAttribute('data-inerte'))).toBe(true)
  })

  it('le libellé masqué ne se montre pas ; la poignée de courbe reparaît', () => {
    const visible = monter({ libelle: 'Oui' }, true)
    expect(visible.querySelector('.notak-ligne-libelle')!.textContent).toBe('Oui')
    expect(visible.querySelector('[data-extremite="courbe"]')).toBeNull()
    act(() => racine!.unmount())
    visible.remove()
    const masque = monter({ libelle: 'Oui', libelleMasque: true }, true)
    expect(masque.querySelector('.notak-ligne-libelle')).toBeNull()
    expect(masque.querySelector('[data-extremite="courbe"]')).not.toBeNull()
  })

  it('le trait fantôme n’existe que pour une ligne reliée à un élément', () => {
    expect(monter({}, true).querySelector('.notak-ligne-fantome')).toBeNull()
  })
})

/** Une ligne entre deux éléments d'un tableau donné, dans une toile qui a son calque de poignées. */
function monterReliee(autre: Element, services: object, contexteEn: object = {}) {
  // jsdom n'a pas CSS.escape.
  ;(globalThis as { CSS?: { escape(s: string): string } }).CSS ??= { escape: (x: string) => x }
  const note = nouvelleNote(0, 0)
  const l = nouvelleLigne({ element: note.id }, { element: autre.id })
  const tableau: Tableau = { titre: '', elements: [note, autre, l] }
  const rects = { [note.id]: depuisTaille(point(0, 0), 20, 10), [autre.id]: depuisTaille(point(40, 0), 20, 10) }
  const contexte = {
    magasin: { lire: () => tableau, appliquerSeulement() {}, inscrire() {} },
    rect: (id: string) => (rects as Record<string, Rect>)[id] ?? null,
    versTableau: (p: { x: number; y: number }) => p,
    camera: { origine: point(0, 0), echelle: 1 },
    services,
    ...contexteEn,
  } as unknown as ContexteToile
  hote = document.createElement('div')
  document.body.append(hote)
  racine = createRoot(hote)
  act(() => {
    racine!.render(
      <div className="notak-toile">
        <div className="notak-plan">
          <svg className="notak-calque-lignes">
            <RenduLigne element={l} choisie enEdition={false} contexte={contexte} brouillon={() => {}} changer={() => {}} />
          </svg>
          <svg className="notak-calque-poignees" />
        </div>
      </div>,
    )
  })
  return hote
}

describe('RenduLigne, empilement et présentation', () => {
  it('les poignées vont dans le calque du dessus, le trait reste dans celui de la ligne', () => {
    const h = monterReliee(nouvelleNote(40, 0), {})
    expect(h.querySelectorAll('.notak-calque-poignees .notak-ligne-poignee')).toHaveLength(3)
    expect(h.querySelectorAll('.notak-calque-lignes:not(.notak-calque-poignees) .notak-ligne-poignee')).toHaveLength(0)
    expect(h.querySelector('.notak-calque-lignes .notak-ligne-trait')).not.toBeNull()
  })

  const commentaire = (): Element => ({ id: 'com', x: 40, y: 0, contenu: { type: 'commentaire', messages: [] } }) as unknown as Element

  it('en présentation, une ligne reliée à un commentaire disparaît', () => {
    expect(monterReliee(commentaire(), { presentation: true }).querySelector('.notak-ligne-trait')).toBeNull()
  })

  it('hors présentation, elle se montre', () => {
    expect(monterReliee(commentaire(), {}).querySelector('.notak-ligne-trait')).not.toBeNull()
  })
})

describe('RenduLigne, défilement au bord', () => {
  it('tirer un bout prévient la toile à chaque mouvement, et la prévient de la fin', () => {
    const appels: string[] = []
    ;(document as unknown as { elementsFromPoint: () => Element[] }).elementsFromPoint = () => []
    const h = monterReliee(nouvelleNote(40, 0), {}, { suivreBord: () => appels.push('suivre'), arreterBord: () => appels.push('arreter') })
    const prise = h.querySelector('[data-extremite="arrivee"]')!
    const evt = (type: string, x: number, y: number) =>
      act(() => void prise.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })))
    evt('pointerdown', 100, 100)
    evt('pointermove', 160, 100)
    evt('pointerup', 160, 100)
    expect(appels).toContain('suivre')
    expect(appels.at(-1)).toBe('arreter')
  })
})
