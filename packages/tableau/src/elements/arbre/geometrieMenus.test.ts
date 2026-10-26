import { describe, expect, it } from 'vitest'
import { type CoteFlottant, MARGE_FENETRE, borner, placerBarreSujet, placerFlottant } from './geometrieMenus'

const fenetre = { l: 1000, h: 700 }

/** Le rectangle posé tient dans la fenêtre, avec la marge de 8 px de chaque côté. */
const tient = (p: { x: number; y: number; l: number; h: number }, f: { l: number; h: number }) => {
  expect(p.x).toBeGreaterThanOrEqual(MARGE_FENETRE)
  expect(p.y).toBeGreaterThanOrEqual(MARGE_FENETRE)
  expect(p.x + p.l).toBeLessThanOrEqual(f.l - MARGE_FENETRE)
  expect(p.y + p.h).toBeLessThanOrEqual(f.h - MARGE_FENETRE)
}

describe('placerFlottant : au point cliqué (libre)', () => {
  const libre = (x: number, y: number, l: number, h: number) => placerFlottant({ x, y, l: 0, h: 0 }, { l, h }, fenetre, { cote: 'libre' })

  it('au point cliqué quand il tient', () => {
    expect(libre(100, 120, 230, 300)).toMatchObject({ x: 100, y: 120, l: 230, h: 300, borneH: false })
  })

  it('glisse pour rester dans la fenêtre, avec 8 de marge', () => {
    expect(libre(900, 600, 230, 300)).toMatchObject({ x: 1000 - 230 - 8, y: 700 - 300 - 8 })
    expect(libre(-5, -5, 230, 300)).toMatchObject({ x: 8, y: 8 })
  })

  it('un menu plus haut que la fenêtre se cale contre le haut et se borne', () => {
    expect(libre(10, 400, 230, 900)).toMatchObject({ y: MARGE_FENETRE, h: 700 - 2 * MARGE_FENETRE, borneH: true })
  })

  it('un menu plus large que la fenêtre se borne en largeur', () => {
    expect(libre(10, 10, 1200, 100)).toMatchObject({ x: MARGE_FENETRE, l: 1000 - 2 * MARGE_FENETRE, borneL: true })
  })
})

describe('placerFlottant : sous un bouton', () => {
  const bouton = { x: 480, y: 20, l: 80, h: 28 }

  it('6 px sous le bord bas du bouton, à son bord gauche', () => {
    expect(placerFlottant(bouton, { l: 220, h: 400 }, fenetre)).toMatchObject({ x: 480, y: 54, cote: 'bas', borneH: false })
  })

  it('alignée sur le bord de fin ou sur le milieu', () => {
    expect(placerFlottant(bouton, { l: 220, h: 100 }, fenetre, { alignement: 'fin' }).x).toBe(480 + 80 - 220)
    expect(placerFlottant(bouton, { l: 220, h: 100 }, fenetre, { alignement: 'centre' }).x).toBe(480 + 40 - 110)
  })

  it('se retourne au-dessus quand le dessous manque de place, sans recouvrir le bouton', () => {
    const b = { x: 480, y: 640, l: 80, h: 28 }
    const p = placerFlottant(b, { l: 220, h: 300 }, fenetre)
    expect(p).toMatchObject({ y: 640 - 6 - 300, cote: 'haut' })
    expect(p.y + p.h).toBeLessThanOrEqual(b.y)
  })

  it('demandée au-dessus, elle passe dessous quand le haut manque de place', () => {
    expect(placerFlottant(bouton, { l: 220, h: 300 }, fenetre, { cote: 'haut' })).toMatchObject({ y: 54, cote: 'bas' })
  })

  it('ni dessus ni dessous : elle glisse dans la fenêtre, contre le bord bas', () => {
    const b = { x: 480, y: 330, l: 80, h: 28 }
    const p = placerFlottant(b, { l: 220, h: 500 }, fenetre)
    expect(p.y + p.h).toBe(700 - MARGE_FENETRE)
    tient(p, fenetre)
  })

  it('plus haute que la fenêtre : bornée à la place, contre le haut', () => {
    const p = placerFlottant(bouton, { l: 220, h: 2000 }, fenetre)
    expect(p).toMatchObject({ y: MARGE_FENETRE, h: 684, borneH: true })
    tient(p, fenetre)
  })

  it('un bouton contre le bord droit : la fenêtre est ramenée dans l’écran, pas coupée', () => {
    const bord = { x: 940, y: 100, l: 52, h: 28 }
    for (const alignement of ['debut', 'centre', 'fin'] as const) tient(placerFlottant(bord, { l: 308, h: 200 }, fenetre, { alignement }), fenetre)
    expect(placerFlottant(bord, { l: 308, h: 200 }, fenetre, { alignement: 'centre' }).x).toBe(1000 - 308 - MARGE_FENETRE)
  })

  it('un bouton contre le bord gauche : ramenée à 8 px', () => {
    expect(placerFlottant({ x: 0, y: 100, l: 40, h: 28 }, { l: 308, h: 200 }, fenetre, { alignement: 'fin' }).x).toBe(MARGE_FENETRE)
  })

  it('l’écart est celui qu’on demande', () => {
    expect(placerFlottant(bouton, { l: 100, h: 100 }, fenetre, { ecart: 12 }).y).toBe(48 + 12)
  })
})

describe('placerFlottant : à côté d’une ancre', () => {
  // Un panneau de 268 de large contre le bord droit, et le bouton d’un réglage dedans.
  const panneau = { x: 732, y: 60, l: 268, h: 600 }
  const reglage = { x: 750, y: 400, l: 120, h: 28 }

  it('à gauche du panneau, le haut aligné sur le réglage', () => {
    const p = placerFlottant({ ...panneau, y: reglage.y, h: reglage.h }, { l: 316, h: 200 }, fenetre, { cote: 'gauche', ecart: 8 })
    expect(p).toMatchObject({ x: 732 - 8 - 316, y: 400, cote: 'gauche' })
  })

  it('glisse vers le haut quand le bas de l’écran manque', () => {
    const p = placerFlottant({ ...panneau, y: reglage.y, h: reglage.h }, { l: 316, h: 450 }, fenetre, { cote: 'gauche', ecart: 8 })
    expect(p.y + p.h).toBe(700 - MARGE_FENETRE)
  })

  it('à droite d’un bouton contre le bord droit : se retourne à gauche', () => {
    const p = placerFlottant({ x: 940, y: 100, l: 52, h: 28 }, { l: 200, h: 100 }, fenetre, { cote: 'droite' })
    expect(p).toMatchObject({ x: 940 - 6 - 200, cote: 'gauche' })
  })

  it('à gauche d’un bouton contre le bord gauche : passe à droite', () => {
    const p = placerFlottant({ x: 4, y: 100, l: 40, h: 28 }, { l: 200, h: 100 }, fenetre, { cote: 'gauche' })
    expect(p).toMatchObject({ x: 4 + 40 + 6, cote: 'droite' })
  })

  it('ni à gauche ni à droite : elle glisse dans la fenêtre', () => {
    const p = placerFlottant({ x: 100, y: 100, l: 600, h: 28 }, { l: 900, h: 100 }, { l: 1000, h: 700 }, { cote: 'droite' })
    tient(p, fenetre)
  })

  it('le décalage transversal s’ajoute à l’alignement', () => {
    expect(placerFlottant({ x: 100, y: 200, l: 100, h: 28 }, { l: 100, h: 100 }, fenetre, { cote: 'droite', decalage: -9 }).y).toBe(191)
  })
})

describe('placerFlottant : jamais hors de la fenêtre', () => {
  const ancres = [0, 3, 40, 500, 940, 990, 1000].flatMap((x) => [0, 3, 40, 350, 660, 695, 700].map((y) => ({ x, y, l: 36, h: 28 })))
  const tailles = [
    { l: 120, h: 80 },
    { l: 308, h: 400 },
    { l: 400, h: 280 },
    { l: 1400, h: 900 },
  ]
  const cotes: CoteFlottant[] = ['bas', 'haut', 'gauche', 'droite', 'libre']

  it('aux quatre bords et dans les coins, de tout côté, dans toute taille', () => {
    for (const ancre of ancres) {
      for (const taille of tailles) {
        for (const cote of cotes) {
          for (const alignement of ['debut', 'centre', 'fin'] as const) {
            tient(placerFlottant(ancre, taille, fenetre, { cote, alignement }), fenetre)
          }
        }
      }
    }
  })

  it('dans une toute petite fenêtre, la fenêtre flottante se borne et la borne basse l’emporte', () => {
    const p = placerFlottant({ x: 10, y: 10, l: 20, h: 20 }, { l: 300, h: 300 }, { l: 200, h: 150 })
    expect(p).toMatchObject({ x: 8, y: 8, l: 184, h: 134, borneL: true, borneH: true })
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

  it('passée sous le sujet, elle ne sort pas de la zone par le bas', () => {
    expect(placerBarreSujet({ x: 500, y: 70, bas: 690 }, barre, { l: 1000, h: 700 })).toEqual({ x: 400, y: 700 - 36 - 8, dessous: true })
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
