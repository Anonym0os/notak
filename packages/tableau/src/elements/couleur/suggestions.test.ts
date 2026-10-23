import { describe, expect, it } from 'vitest'
import type { Contenu, Element } from '../../coeur/tableau'
import { couleursDuTableau } from './suggestions'

let n = 0
const el = (contenu: Contenu, plus: Partial<Element> = {}): Element => ({ id: `e${n++}`, x: 0, y: 0, largeur: 10, contenu, ...plus })
const trait = (couleur: string) => ({ points: [0, 0, 1, 1], couleur, epaisseur: 2 })

describe('les couleurs suggérées du tableau', () => {
  it('les plus utilisées d’abord, traits, nuanciers et notes ensemble', () => {
    const elements = [
      el({ type: 'nuancier', couleur: '#aa0000' }),
      el({ type: 'croquis', traits: [trait('#00aa00'), trait('#00AA00'), trait('#aa0000')] }),
      el({ type: 'dessin', traits: [trait('#00aa00')], largeurOrigine: 10, hauteurOrigine: 10 }),
    ]
    expect(couleursDuTableau(elements)).toEqual(['#00aa00', '#aa0000'])
  })

  it('ce que la palette montre déjà, la corbeille et les noms de couleur sont écartés', () => {
    const elements = [
      el({ type: 'croquis', traits: [trait('#323b4a'), trait('#123456')] }),
      el({ type: 'nuancier', couleur: '#654321' }, { corbeille: 1 }),
      el({ type: 'note', texte: { type: 'doc' }, couleur: 'rouge' }),
    ]
    expect(couleursDuTableau(elements, { exclure: ['#323B4A'] })).toEqual(['#123456', expect.stringMatching(/^#/)])
  })

  it('au plus dix, et un tableau sans couleur n’en propose aucune', () => {
    const traits = Array.from({ length: 14 }, (_, i) => trait(`#0000${(16 + i).toString(16)}`))
    expect(couleursDuTableau([el({ type: 'croquis', traits })])).toHaveLength(10)
    expect(couleursDuTableau([])).toEqual([])
  })

  it('les fonds et couleurs libres des cellules d’une table comptent', () => {
    const table = el({ type: 'table', cellules: [['a', 'b']], formats: [[{ fond: '#ff00ff' }, { fond: 'entete', couleur: 'rouge' }]] })
    expect(couleursDuTableau([table])).toEqual(['#ff00ff'])
  })
})
