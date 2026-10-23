import { describe, expect, it, vi } from 'vitest'
import { nouvelleNote } from '../coeur/tableau'
import { definition } from './registre'
import './note'
import type { ContexteToile } from './types'

describe('Suggestion sous une note', () => {
  const note = nouvelleNote(0, 0)
  const faire = vi.fn()
  const contexte = { magasin: { faire } } as unknown as ContexteToile
  const def = definition('note')!

  it('ne propose rien tant que la note tient dans une page', () => {
    expect(def.suggestionSous?.(note, contexte, 48)).toBeNull()
    expect(def.suggestionSous?.(note, contexte, 10)).toBeNull()
  })

  it('propose de la convertir en document au-delà de 48 UG, et « Oui » la convertit', () => {
    const s = def.suggestionSous?.(note, contexte, 49)
    expect(s?.cle).toBe('noteEnDocument')
    s?.oui()
    expect(faire).toHaveBeenCalledTimes(1)
    expect(faire.mock.calls[0]![0][0]).toMatchObject({ type: 'contenu', id: note.id, apres: { type: 'document' } })
  })
})
