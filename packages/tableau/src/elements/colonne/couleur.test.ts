import { describe, expect, test } from 'vitest'
import { nouvelleColonne } from '../../coeur/tableau'
import { colonneColoree, fondsDeColonnes } from './Colonne'

describe('la couleur d’une colonne', () => {
  const grise = { ...nouvelleColonne(0, 0, 'A').contenu, couleur: 'gris' as const }

  test('une teinte nommée chasse le fond libre, et inversement', () => {
    const libre = colonneColoree(grise, { fond: '#123456' })
    expect(libre).toEqual({ type: 'colonne', titre: 'A', fond: '#123456' })
    expect(colonneColoree(libre, { couleur: 'rouge' })).toEqual({ type: 'colonne', titre: 'A', couleur: 'rouge' })
  })

  test('« Aucune » retire les deux', () => {
    expect(colonneColoree({ ...grise, fond: '#123456' }, null)).toEqual({ type: 'colonne', titre: 'A' })
  })

  test('les fonds libres du tableau, les plus employés d’abord', () => {
    const avec = (fond?: string) => ({ ...nouvelleColonne(0, 0), contenu: { ...nouvelleColonne(0, 0).contenu, ...(fond ? { fond } : {}) } })
    expect(fondsDeColonnes([avec('#111111'), avec('#222222'), avec('#222222'), avec()])).toEqual(['#222222', '#111111'])
  })
})
