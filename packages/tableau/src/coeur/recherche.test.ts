import { describe, expect, it } from 'vitest'
import { chercher, normaliser } from './recherche'
import { type Element, nouvelleColonne, nouvelleNote } from './tableau'

describe('recherche', () => {
  const colonne = nouvelleColonne(0, 0, 'Été 2026')
  const dedans: Element = { ...nouvelleNote(0, 0, 'Réserver le gîte'), parent: colonne.id, ordre: 'V' }
  const haut = nouvelleNote(40, -10, 'Gîte à Biarritz, réserver vite')
  const renvoi: Element = { id: 'R', x: 0, y: 30, largeur: 10, contenu: { type: 'tableau', cible: 'T' } }
  const tout = [colonne, dedans, haut, renvoi]
  const titre = (id: string) => (id === 'T' ? 'Vacances' : undefined)

  it('ignore accents et majuscules', () => {
    expect(normaliser('ÉTÉ')).toBe('ete')
  })

  it('trouve tous les mots, dans l’ordre de lecture', () => {
    expect(chercher(tout, 'gite reserver', titre).map((e) => e.id)).toEqual([haut.id, dedans.id])
  })

  it('cherche le titre d’un tableau imbriqué et d’une colonne', () => {
    expect(chercher(tout, 'vacances', titre).map((e) => e.id)).toEqual(['R'])
    expect(chercher(tout, 'ete', titre).map((e) => e.id)).toEqual([colonne.id])
  })

  it('ne trouve rien sans requête', () => {
    expect(chercher(tout, '  ', titre)).toEqual([])
  })
})
