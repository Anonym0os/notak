import { describe, expect, it } from 'vitest'
import { placerSousMenu } from './Menus'

const fenetre = { largeur: 1385, hauteur: 868 }

describe('un sous-menu reste tout entier dans la fenêtre', () => {
  it('de la place partout : à droite de son entrée, aligné sur elle', () => {
    expect(placerSousMenu({ left: 400, top: 200, width: 220, height: 300 }, { left: 180 }, fenetre)).toEqual({ aGauche: false, remonte: 0, hauteurMax: 852 })
  })

  it('ouvert en bas de la fenêtre (« Changer l’arrière-plan » du clic droit) : il remonte juste ce qu’il faut', () => {
    const p = placerSousMenu({ left: 1015, top: 820, width: 220, height: 217 }, { left: 780 }, fenetre)
    expect(p.remonte).toBe(820 + 217 - (868 - 8))
    expect(820 - p.remonte + 217).toBe(860)
  })

  it('sans place à droite, il s’ouvre à gauche de son entrée', () => {
    expect(placerSousMenu({ left: 1250, top: 100, width: 220, height: 200 }, { left: 1000 }, fenetre).aGauche).toBe(true)
  })

  it('sans place d’aucun côté, il reste à droite plutôt que de sortir par la gauche', () => {
    expect(placerSousMenu({ left: 300, top: 100, width: 220, height: 200 }, { left: 100 }, { largeur: 400, hauteur: 868 }).aGauche).toBe(false)
  })

  it('plus haut que la fenêtre : il monte jusqu’au bord haut et défile', () => {
    const p = placerSousMenu({ left: 400, top: 300, width: 220, height: 2000 }, { left: 180 }, fenetre)
    expect(p.remonte).toBe(300 - 8)
    expect(p.hauteurMax).toBe(868 - 16)
  })
})
