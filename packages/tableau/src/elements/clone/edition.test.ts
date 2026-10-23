import { describe, expect, test } from 'vitest'
import { type Element, nouvelleColonne, nouvelleNote } from '../../coeur/tableau'
import { definition } from '../registre'
import './index'
import '../note'
import '../lien'
import { nouveauClone } from './original'

describe('écrire dans un clone', () => {
  const note: Element = { ...nouvelleNote(0, 0, 'a'), id: 'n' }
  const clone = nouveauClone(10, 10, 'n', 30)
  const edite = (elements: Element[]) => definition('clone')!.edite!(clone as never, { titre: '', elements })

  test('le clone s’édite : c’est l’original qui s’écrit', () => {
    expect(definition('clone')!.editable).toBe(true)
    expect(edite([note, clone])).toBe(note)
  })

  test('sans original, ou si l’original est une colonne, rien ne s’écrit', () => {
    expect(edite([clone])).toBeNull()
    expect(edite([{ ...nouvelleColonne(0, 0), id: 'n' }, clone])).toBeNull()
  })

  test('un original à la corbeille se laisse écrire : le clone qu’on en rapporte montre encore son contenu', () => {
    expect(edite([{ ...note, corbeille: 1 }, clone])).toMatchObject({ id: 'n' })
  })
})
