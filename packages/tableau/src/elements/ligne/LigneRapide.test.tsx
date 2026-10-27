// @vitest-environment jsdom
import { act } from 'react'
import { type Root, createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CAMERA_DEPART } from '../../coeur/camera'
import { depuisTaille, point } from '../../coeur/geometrie'
import { type Id, type Operation, nouvelleNote } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import './index'
import { LigneRapide } from './LigneRapide'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let racine: Root
let toile: HTMLElement
beforeEach(() => {
  toile = document.createElement('div')
  toile.className = 'notak-toile'
  document.body.append(toile)
  racine = createRoot(toile)
  document.elementsFromPoint = () => []
})
afterEach(() => {
  act(() => racine.unmount())
  toile.remove()
})

const a = nouvelleNote(10, 10)
const b = nouvelleNote(50, 10)
const rects = { [a.id]: depuisTaille(point(10, 10), 20, 10), [b.id]: depuisTaille(point(50, 10), 20, 10) }

function monter(elements = [a]) {
  const faits: Operation[][] = []
  const choisis: Id[][] = []
  const contexte = {
    magasin: { faire: (p: Operation[]) => faits.push(p), lire: () => ({ titre: '', elements: [a, b] }) },
    camera: CAMERA_DEPART,
    rect: (id: string) => rects[id as keyof typeof rects] ?? null,
    versTableau: (p: { x: number; y: number }) => point(p.x / 10, p.y / 10),
    choisir: (ids: Iterable<Id>) => choisis.push([...ids]),
  } as unknown as ContexteToile
  act(() => racine.render(<LigneRapide elements={elements} contexte={contexte} />))
  return { faits, choisis }
}

const souris = (type: string, x: number, y: number, extra: MouseEventInit = {}) =>
  act(() => void document.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, ...extra })))
const poignee = () => toile.querySelector<HTMLElement>('.notak-ligne-rapide')

function prendre() {
  act(() => void poignee()!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 300, clientY: 90 })))
}

describe('ligne rapide', () => {
  it('pose sa poignée au coin haut droit de l’élément seul choisi, sur la toile', () => {
    monter()
    expect(poignee()).not.toBeNull()
    expect(poignee()!.parentElement).toBe(toile)
    // Le coin haut droit (30, 10) UG, posé sur la caméra que publie la toile : il suit un geste sans rendu.
    expect(poignee()!.style.left).toBe('calc((30 - var(--notak-cam-ox)) * var(--notak-cam-k) * 1px)')
    expect(poignee()!.style.top).toBe('calc((10 - var(--notak-cam-oy)) * var(--notak-cam-k) * 1px)')
  })

  it('n’en pose pas pour deux éléments, ni pour une ligne', () => {
    monter([a, b])
    expect(poignee()).toBeNull()
  })

  it('tirée dans le vide, crée une ligne de l’élément au point lâché, et la choisit', () => {
    const { faits, choisis } = monter()
    prendre()
    souris('pointermove', 400, 300)
    expect(toile.querySelector('.notak-ligne-rapide-apercu path')).not.toBeNull()
    souris('pointerup', 400, 300)
    expect(faits).toHaveLength(1)
    const op = faits[0]![0]!
    expect(op.type).toBe('creer')
    const l = (op as Extract<Operation, { type: 'creer' }>).element.contenu
    expect(l).toMatchObject({ type: 'ligne', depart: { element: a.id }, arrivee: { x: 40, y: 30 }, pointeArrivee: 'fleche' })
    expect(choisis).toEqual([[(op as Extract<Operation, { type: 'creer' }>).element.id]])
    expect(toile.querySelector('.notak-ligne-rapide-apercu')).toBeNull()
  })

  it('tirée sur un autre élément, s’y accroche', () => {
    const { faits } = monter()
    document.elementsFromPoint = () => {
      const n = document.createElement('div')
      n.setAttribute('data-id', b.id)
      toile.append(n)
      return [n]
    }
    prendre()
    souris('pointermove', 600, 150)
    souris('pointerup', 600, 150)
    const l = (faits[0]![0] as Extract<Operation, { type: 'creer' }>).element.contenu
    expect(l).toMatchObject({ depart: { element: a.id }, arrivee: { element: b.id } })
  })

  it('un simple clic sur la poignée ne crée rien', () => {
    const { faits } = monter()
    prendre()
    souris('pointermove', 301, 91)
    souris('pointerup', 301, 91)
    expect(faits).toEqual([])
  })

  it('Échap abandonne le tirage', () => {
    const { faits } = monter()
    prendre()
    souris('pointermove', 400, 300)
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    souris('pointerup', 400, 300)
    expect(faits).toEqual([])
    expect(toile.querySelector('.notak-ligne-rapide-apercu')).toBeNull()
  })

  it('lâchée sur l’élément d’où elle part, ne crée rien', () => {
    const { faits } = monter()
    prendre()
    souris('pointermove', 200, 150)
    souris('pointerup', 200, 150)
    expect(faits).toEqual([])
  })
})
