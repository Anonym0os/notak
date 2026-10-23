import { describe, expect, it } from 'vitest'
import { couleurDuTitre, iconeDuTitre } from './initialisation'
import { ICONES_TABLEAU } from './icones'

describe('couleurDuTitre', () => {
  it('prend le nom de couleur du titre', () => {
    expect(couleurDuTitre('Les murs bleus')).toBe('bleu')
    expect(couleurDuTitre('Red team')).toBe('rouge')
  })
  it('à défaut, un mot positif donne le vert et un mot négatif le rouge', () => {
    expect(couleurDuTitre('Bonne année, merci')).toBe('vert')
    expect(couleurDuTitre('Problèmes en cours')).toBe('rouge')
  })
  it('ne dit rien du reste', () => {
    expect(couleurDuTitre('Réunions du lundi')).toBeUndefined()
  })
})

describe('iconeDuTitre', () => {
  it('trouve une icône qu’évoque un mot du titre, accents ignorés', () => {
    expect(iconeDuTitre('Idées de week-end')).toBe('idee')
    expect(iconeDuTitre('Café du matin')).toBe('cafe')
  })
  it('saute les icônes déjà prises par les voisins', () => {
    expect(iconeDuTitre('Livre et lecture', new Set(['livre']))).toBeUndefined()
  })
  it('ne propose que des icônes de la bibliothèque', () => {
    for (const mot of ['maison', 'voyage', 'argent', 'sport', 'jeu', 'science']) {
      const nom = iconeDuTitre(mot)
      expect(nom && ICONES_TABLEAU[nom]).toBeTruthy()
    }
  })
})
