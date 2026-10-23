import { describe, expect, it } from 'vitest'
import { CAMERA_DEPART } from './camera'
import { point } from './geometrie'
import { type CibleBord, MARGE_POINTEUR, pointeursDeBord } from './pointeurs'

const vue = { largeur: 1000, hauteur: 600 }
const personne = (id: string, x: number, y: number): CibleBord => ({ id, ou: point(x, y), genre: 'personne', nom: id, couleur: '#3366ff' })
const activite = (id: string, x: number, y: number): CibleBord => ({ id, ou: point(x, y), genre: 'activite', nom: 'Léa' })

describe('pointeurs de bord de vue', () => {
  it('ne dit rien de ce qui est dans la vue', () => {
    expect(pointeursDeBord([personne('a', 50, 30)], CAMERA_DEPART, vue)).toEqual([])
  })

  it('pose contre le bord, flèche vers la cible', () => {
    const [p] = pointeursDeBord([personne('a', 500, 50)], CAMERA_DEPART, vue)
    expect(p!.x).toBeCloseTo(1000 - MARGE_POINTEUR)
    expect(p!.angle).toBeGreaterThan(0)
    expect(p!.angle).toBeLessThan(90)
    const [bas] = pointeursDeBord([personne('b', 50, 400)], CAMERA_DEPART, vue)
    expect(bas!.y).toBeCloseTo(600 - MARGE_POINTEUR)
    expect(bas!.angle).toBeGreaterThan(45)
    const [gauche] = pointeursDeBord([personne('c', -200, 30)], CAMERA_DEPART, vue)
    expect(gauche!.x).toBeCloseTo(MARGE_POINTEUR)
    expect(Math.abs(gauche!.angle)).toBeGreaterThan(90)
  })

  it('la barre de gauche réserve sa place', () => {
    const [p] = pointeursDeBord([personne('a', -50, 30)], CAMERA_DEPART, vue, 72)
    expect(p!.x).toBeCloseTo(72 + MARGE_POINTEUR)
  })

  it('regroupe l’activité d’une même direction et garde chaque personne à part', () => {
    const liste = pointeursDeBord([activite('1', 200, 20), activite('2', 210, 30), activite('3', -300, 30), personne('p', 220, 25), personne('q', 230, 20)], CAMERA_DEPART, vue)
    const groupes = liste.filter((p) => p.genre === 'activite')
    expect(groupes.map((g) => g.nombre).sort()).toEqual([1, 2])
    expect(liste.filter((p) => p.genre === 'personne')).toHaveLength(2)
  })

  it('suit le zoom de la caméra', () => {
    const zoom = { origine: point(0, 0), echelle: 3 }
    expect(pointeursDeBord([personne('a', 50, 30)], zoom, vue)).toHaveLength(1)
  })
})
