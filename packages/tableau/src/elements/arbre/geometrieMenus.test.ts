import { describe, expect, it } from 'vitest'
import { ECART_ANCRE, MARGE_FENETRE, borner, placerBarreSujet, poserMenu, poserSousMenu } from './geometrieMenus'

const fenetre = { l: 1000, h: 700 }

describe('poserMenu', () => {
  it('au point cliqué quand il tient', () => {
    expect(poserMenu({ x: 100, y: 120 }, { l: 230, h: 300 }, fenetre)).toEqual({ x: 100, y: 120 })
  })

  it('glisse pour rester dans la fenêtre, avec 8 de marge', () => {
    expect(poserMenu({ x: 900, y: 600 }, { l: 230, h: 300 }, fenetre)).toEqual({ x: 1000 - 230 - 8, y: 700 - 300 - 8 })
    expect(poserMenu({ x: -5, y: -5 }, { l: 230, h: 300 }, fenetre)).toEqual({ x: 8, y: 8 })
  })

  it('un menu plus haut que la fenêtre se cale contre le haut', () => {
    expect(poserMenu({ x: 10, y: 400 }, { l: 230, h: 900 }, fenetre).y).toBe(MARGE_FENETRE)
  })

  it('sous son bouton : 6 px sous le bord bas, au bord gauche du bouton', () => {
    const p = poserMenu({ x: 480, y: 56 + ECART_ANCRE }, { l: 220, h: 400 }, fenetre, { haut: 20, bas: 48 })
    expect(p).toEqual({ x: 480, y: 54 })
  })

  it('sous son bouton sans le recouvrir : au-dessus quand le dessous manque de place', () => {
    const p = poserMenu({ x: 480, y: 600 }, { l: 220, h: 300 }, fenetre, { haut: 640, bas: 668 })
    expect(p.y).toBe(640 - 6 - 300)
    expect(p.y + 300).toBeLessThanOrEqual(640)
  })

  it('un menu à l’extrême droite est ramené dans la fenêtre', () => {
    expect(poserMenu({ x: 990, y: 56 }, { l: 220, h: 300 }, fenetre, { haut: 20, bas: 48 }).x).toBe(1000 - 220 - 8)
  })
})

describe('poserSousMenu', () => {
  const parent = { x: 100, y: 100, l: 230, h: 400 }
  const entree = { x: 108, y: 140, l: 214, h: 28 }

  it('à droite de son menu quand il y a la place, sans décalage', () => {
    expect(poserSousMenu(parent, entree, { l: 200, h: 200 }, fenetre)).toEqual({ cote: 'droite', decalage: 0 })
  })

  it('à gauche quand la fenêtre manque de place à droite', () => {
    expect(poserSousMenu({ ...parent, x: 700 }, { ...entree, x: 708 }, { l: 200, h: 200 }, fenetre).cote).toBe('gauche')
  })

  it('à droite quand ni l’un ni l’autre ne tient : le moins mauvais côté reste le naturel', () => {
    expect(poserSousMenu({ ...parent, x: 20, l: 700 }, entree, { l: 400, h: 200 }, { l: 900, h: 700 }).cote).toBe('droite')
  })

  it('remonte de ce qui dépasse en bas', () => {
    const { decalage } = poserSousMenu(parent, { ...entree, y: 600 }, { l: 200, h: 300 }, fenetre)
    // Le haut est à 600 - 9 = 591 ; il faut finir à 692 : 591 + 300 = 891, 199 de trop.
    expect(decalage).toBe(-199)
    expect(591 + decalage + 300).toBe(700 - 8)
  })

  it('un sous-menu plus haut que la fenêtre se cale contre le haut', () => {
    const { decalage } = poserSousMenu(parent, entree, { l: 200, h: 900 }, fenetre)
    expect(entree.y - 9 + decalage).toBe(MARGE_FENETRE)
  })
})

describe('placerBarreSujet', () => {
  const barre = { l: 200, h: 36 }

  it('centrée sur le sujet, 8 px au-dessus de son bord haut', () => {
    expect(placerBarreSujet({ x: 500, y: 300 }, barre, { l: 1000, h: 700 })).toEqual({ x: 400, y: 300 - 36 - 8, dessous: false })
  })

  it('ne sort pas de la zone, à gauche comme à droite', () => {
    expect(placerBarreSujet({ x: 20, y: 300 }, barre, { l: 1000, h: 700 }).x).toBe(8)
    expect(placerBarreSujet({ x: 990, y: 300 }, barre, { l: 1000, h: 700 }).x).toBe(1000 - 200 - 8)
  })

  it('passe sous le sujet quand le haut serait sous la barre d’outils', () => {
    expect(placerBarreSujet({ x: 500, y: 70, bas: 98 }, barre, { l: 1000, h: 700 })).toEqual({ x: 400, y: 106, dessous: true })
  })

  it('sans bord bas connu, elle reste dessus', () => {
    expect(placerBarreSujet({ x: 500, y: 70 }, barre, { l: 1000, h: 700 }).dessous).toBe(false)
  })

  it('sans mesure de la zone, elle se centre sans se borner', () => {
    expect(placerBarreSujet({ x: 20, y: 300 }, barre, { l: 0, h: 0 }).x).toBe(-80)
  })

  it('borner : la borne basse l’emporte si elles se croisent', () => {
    expect(borner(5, 10, 3)).toBe(10)
    expect(borner(5, 0, 10)).toBe(5)
  })
})
