import { describe, expect, it } from 'vitest'
import { largeurMinDe } from './coeur/largeur'
import type { Contenu, TypeContenu } from './coeur/tableau'
import './elements'
import { definition } from './elements/registre'

const min = (type: TypeContenu, contenu: object) => largeurMinDe(definition(type)?.largeurMin, { type, ...contenu } as unknown as Contenu)

describe('largeurs minimales, en unités de grille, comme Milanote', () => {
  it('les types à plancher bas descendent à 4', () => {
    for (const type of ['image', 'fichier', 'nuancier', 'croquis', 'dessin'] as const) expect(min(type, {}), type).toBe(4)
  })

  it('la note et le lien sans aperçu gardent 17, la table 12, la colonne 34', () => {
    expect(min('note', {})).toBe(17)
    expect(min('lien', { url: 'https://exemple.fr', statut: 'attente' })).toBe(17)
    expect(min('table', {})).toBe(12)
    expect(min('colonne', {})).toBe(34)
  })

  it('un lieu sans carte garde 17, avec sa carte intégrée il descend à 4', () => {
    expect(min('lieu', { adresse: '1 rue X' })).toBe(17)
    expect(min('lieu', { adresse: '1 rue X', position: { lat: 1, lon: 2, pour: '1 rue X' } })).toBe(4)
  })
})
