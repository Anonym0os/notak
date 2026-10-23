import { describe, expect, it } from 'vitest'
import { aligner } from '../../coeur/arrangement'
import { depuisTaille, point } from '../../coeur/geometrie'
import { nouvelleNote } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import './index'
import '../ligne'
import { nouvelleLigne } from '../ligne/creation'
import { disposables } from './disposables'
import { enOperations } from './raccourcis'

describe('aligner une ligne libre', () => {
  const libre = nouvelleLigne({ x: 30, y: 40 }, { x: 50, y: 60 })
  const accrochee = nouvelleLigne({ x: 0, y: 0 }, { element: 'n' })
  const note = nouvelleNote(0, 0)
  const contexte = { rect: (id: string) => (id === note.id ? depuisTaille(point(0, 0), 20, 10) : null) } as unknown as ContexteToile

  it('une ligne libre se mesure par la boîte de son trait ; une ligne accrochée est ignorée', () => {
    const items = disposables([libre, accrochee, note], contexte)
    expect(items.map((i) => i.id).sort()).toEqual([libre.id, note.id].sort())
    expect(items.find((i) => i.id === libre.id)!.rect).toEqual({ min: point(30, 40), max: point(50, 60) })
  })

  it('l’alignement décale les deux bouts du même écart', () => {
    const items = disposables([libre, note], contexte)
    const pas = enOperations(aligner(items, 'gauche'), [libre, note])
    const op = pas.find((p) => p.type === 'contenu' && p.id === libre.id)!
    expect(op).toMatchObject({ apres: { depart: { x: 0, y: 40 }, arrivee: { x: 20, y: 60 } } })
  })
})
