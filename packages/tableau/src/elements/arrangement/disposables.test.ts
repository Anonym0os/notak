import { describe, expect, it } from 'vitest'
import { depuisTaille, point } from '../../coeur/geometrie'
import { nouvelleNote } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import './index'
import { disposables } from './disposables'

describe('ce que l’arrangement déplace', () => {
  const contexte = { rect: () => depuisTaille(point(0, 0), 10, 10) } as unknown as ContexteToile

  it('ni un élément verrouillé, ni un élément rangé dans une colonne', () => {
    const libre = nouvelleNote(0, 0, 'libre')
    const verrouille = { ...nouvelleNote(20, 0, 'verrouillé'), verrou: true }
    const range = { ...nouvelleNote(0, 0, 'rangé'), parent: 'colonne' }
    expect(disposables([libre, verrouille, range], contexte).map((d) => d.id)).toEqual([libre.id])
  })
})
