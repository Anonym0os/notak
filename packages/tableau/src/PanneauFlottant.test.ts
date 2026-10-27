import { describe, expect, it } from 'vitest'
import { placer } from './PanneauFlottant'

const FENETRE = { largeur: 1000, hauteur: 800 }
const TAILLE = { largeur: 292, hauteur: 350 }
const boite = (left: number, top: number, largeur = 40, hauteur = 20) => ({ left, top, right: left + largeur, bottom: top + hauteur })

describe('placer un panneau accroché à sa cible', () => {
  it('sous la cible, centré, à 10 px, la flèche au milieu de la cible', () => {
    const p = placer(boite(400, 100), TAILLE, FENETRE)!
    expect(p).toEqual({ left: 420 - 146, top: 130, cote: 'bas', fleche: 146 - 6.5 })
  })

  it('passe au-dessus quand il n’y a pas la place dessous', () => {
    const p = placer(boite(400, 600), TAILLE, FENETRE)!
    expect(p.cote).toBe('haut')
    expect(p.top).toBe(600 - 350 - 10)
  })

  it('reste à 10 px des côtés de la fenêtre, la flèche toujours vers la cible', () => {
    const p = placer(boite(12, 100), TAILLE, FENETRE)!
    expect(p.left).toBe(10)
    expect(p.fleche).toBe(32 - 10 - 6.5)
  })

  it('sur un téléphone, garde en plus les zones sûres : rien sous la barre d’accueil ni l’encoche', () => {
    const zones = { haut: 59, droite: 0, bas: 34, gauche: 0 }
    const bas = placer(boite(400, 600), TAILLE, FENETRE, { cote: 'droite', zones })!
    expect(bas.top + TAILLE.hauteur).toBe(800 - 20 - 34)
    const haut = placer(boite(400, 90), TAILLE, FENETRE, { cote: 'droite', zones })!
    expect(haut.top).toBe(20 + 59)
  })

  it('suit la cible : elle bouge, il bouge d’autant', () => {
    const a = placer(boite(400, 100), TAILLE, FENETRE)!
    const b = placer(boite(350, 140), TAILLE, FENETRE)!
    expect([b.left - a.left, b.top - a.top]).toEqual([-50, 40])
  })

  it('se cache quand la cible sort de la toile, ou n’a plus de taille', () => {
    const bornes = { left: 80, top: 50, right: 1000, bottom: 800 }
    expect(placer(boite(60, 100), TAILLE, FENETRE, { bornes })).toBeNull()
    expect(placer(boite(400, 30), TAILLE, FENETRE, { bornes })).toBeNull()
    expect(placer(boite(400, 100, 0, 0), TAILLE, FENETRE)).toBeNull()
  })

  it('dans la toile, il ne déborde pas sur la barre de gauche', () => {
    const p = placer(boite(100, 100), TAILLE, FENETRE, { bornes: { left: 80, top: 50, right: 1000, bottom: 800 } })!
    expect(p.left).toBe(80)
  })

  it('à droite de la cible, centré en hauteur ; à gauche s’il n’y a pas la place', () => {
    const emojis = { largeur: 572, hauteur: 300 }
    const droite = placer(boite(100, 300), emojis, FENETRE, { cote: 'droite', distance: 15 })!
    expect(droite).toMatchObject({ left: 155, top: 160, cote: 'droite' })
    const gauche = placer(boite(800, 300), emojis, FENETRE, { cote: 'droite', distance: 15 })!
    expect(gauche).toMatchObject({ left: 800 - 572 - 15, cote: 'gauche' })
  })

  it('aligné sur le début de la cible, pour une liste sous le curseur', () => {
    const p = placer(boite(300, 100, 0, 18), { largeur: 200, hauteur: 120 }, FENETRE, { alignement: 'debut', distance: 4 })!
    expect([p.left, p.top]).toEqual([300, 122])
  })
})
