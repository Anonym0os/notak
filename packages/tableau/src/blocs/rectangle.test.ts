import { describe, expect, it } from 'vitest'
import type { Ligne } from './glisser'
import { blocsTouches, departPermis, entreDeuxPoints, ouExclusif, touche } from './rectangle'

const L = (id: string, haut: number, plus: Partial<Ligne> = {}): Ligne => ({
  id,
  type: 'texte',
  pos: 0,
  fin: 0,
  niveau: 0,
  parent: null,
  conteneur: null,
  gauche: 100,
  droite: 820,
  haut,
  bas: haut + 40,
  cadre: { gauche: 100, droite: 820 },
  ferme: false,
  aEnfants: false,
  ...plus,
})

// P (avec C1 et C2), puis Q et R.
const page = [L('P', 0), L('C1', 40, { niveau: 1, parent: 'P' }), L('C2', 80, { niveau: 1, parent: 'P' }), L('Q', 120), L('R', 160)]
const rect = (haut: number, bas: number) => ({ gauche: 0, droite: 50, haut, bas })

describe('NOTION.md § 7 : le rectangle de sélection', () => {
  it('le rectangle entre deux points, quel que soit le sens', () => {
    expect(entreDeuxPoints(50, 80, 10, 20)).toEqual({ gauche: 10, haut: 20, droite: 50, bas: 80 })
  })

  it('les bords comptent comme un contact', () => {
    expect(touche({ gauche: 0, haut: 0, droite: 10, bas: 10 }, { gauche: 10, haut: 10, droite: 20, bas: 20 })).toBe(true)
    expect(touche({ gauche: 0, haut: 0, droite: 10, bas: 10 }, { gauche: 11, haut: 0, droite: 20, bas: 10 })).toBe(false)
  })

  it('il touche les blocs de son passage : des frères', () => {
    expect(blocsTouches(page, { gauche: 0, droite: 150, haut: 130, bas: 170 })).toEqual(['Q', 'R'])
  })

  it('deux éléments d’une sous-liste donnent les deux éléments, pas leur parent', () => {
    expect(blocsTouches(page, { gauche: 0, droite: 150, haut: 50, bas: 90 })).toEqual(['C1', 'C2'])
  })

  it('un élément de la sous-liste et un frère du parent donnent le parent et le frère', () => {
    expect(blocsTouches(page, { gauche: 0, droite: 150, haut: 90, bas: 130 })).toEqual(['P', 'Q'])
  })

  it('un enfant seul reste un enfant ; un parent et son premier enfant donnent le parent', () => {
    expect(blocsTouches(page, { gauche: 0, droite: 150, haut: 50, bas: 60 })).toEqual(['C1'])
    expect(blocsTouches(page, { gauche: 0, droite: 150, haut: 30, bas: 45 })).toEqual(['P'])
  })

  it('un rectangle dans le vide ne choisit rien', () => {
    expect(blocsTouches(page, { gauche: 0, droite: 50, haut: 500, bas: 600 })).toEqual([])
    expect(blocsTouches(page, rect(500, 600))).toEqual([])
  })

  it('les blocs d’une colonne forment leur groupe ; la rangée elle-même n’est pas choisie', () => {
    const colonnes = [L('R1', 0, { type: 'colonnes', bas: 80 }), L('A', 0, { parent: 'c1', conteneur: 'c1' }), L('B', 40, { parent: 'c1', conteneur: 'c1' }), L('Z', 90)]
    expect(blocsTouches(colonnes, { gauche: 0, droite: 150, haut: 0, bas: 70 })).toEqual(['A', 'B'])
  })

  it('Maj tenue : ce que touche le rectangle bascule par rapport à la sélection de départ', () => {
    const ordre = ['P', 'C1', 'C2', 'Q', 'R']
    expect(ouExclusif(ordre, ['Q'], ['Q', 'R'])).toEqual(['R'])
    expect(ouExclusif(ordre, ['P'], ['Q'])).toEqual(['P', 'Q'])
    expect(ouExclusif(ordre, [], [])).toEqual([])
  })

  it('un appui ne lance pas de rectangle avec le bouton droit, sur un bouton, ni sur la barre de défilement', () => {
    const ok = { bouton: 0, refuse: false, x: 100, gaucheZone: 0, largeurUtile: 500 }
    expect(departPermis(ok)).toBe(true)
    expect(departPermis({ ...ok, bouton: 2 })).toBe(false)
    expect(departPermis({ ...ok, refuse: true })).toBe(false)
    expect(departPermis({ ...ok, x: 505 })).toBe(false)
  })
})
