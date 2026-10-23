import { describe, expect, it } from 'vitest'
import { MODELES } from './catalogue'
import { formesApercu } from './apercu'

describe('aperçu d’un modèle', () => {
  it('part du coin haut gauche et contient toutes les formes', () => {
    for (const m of MODELES) {
      const { formes, largeur, hauteur } = formesApercu(m)
      expect(Math.min(...formes.map((f) => f.x))).toBe(0)
      expect(Math.min(...formes.map((f) => f.y))).toBe(0)
      for (const f of formes) {
        expect(f.x + f.largeur).toBeLessThanOrEqual(largeur)
        expect(f.y + f.hauteur).toBeLessThanOrEqual(hauteur)
      }
    }
  })

  it('range les feuilles d’une colonne dans la colonne', () => {
    const planning = MODELES.find((m) => m.id === 'planning')!
    const { formes } = formesApercu(planning)
    const colonne = formes.find((f) => f.genre === 'colonne')!
    const feuille = formes.find((f) => f.genre === 'feuille')!
    expect(feuille.x).toBeGreaterThan(colonne.x)
    expect(feuille.y).toBeGreaterThan(colonne.y)
  })
})
