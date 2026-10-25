import { describe, expect, it } from 'vitest'
import { ECART_AIDE, MARGE_AIDE, morceauxAide, placerAide } from './aidePoignee'

const fenetre = { largeur: 1200, hauteur: 800 }
const taille = { largeur: 200, hauteur: 42 }
const bouton = (left: number, top: number, largeur = 24) => ({ left, top, right: left + largeur, bottom: top + 24 })

describe('NOTION.md § 6 : la bulle d’aide de la poignée, sa place', () => {
  it('centrée sous le bouton, à 6 px', () => {
    expect(placerAide(bouton(400, 300), taille, fenetre)).toEqual({ left: 412 - 100, top: 324 + ECART_AIDE })
  })

  it('poussée contre le bord gauche ou droit de la fenêtre, à 8 px', () => {
    expect(placerAide(bouton(0, 300), taille, fenetre).left).toBe(MARGE_AIDE)
    expect(placerAide(bouton(1190, 300), taille, fenetre).left).toBe(1200 - MARGE_AIDE - 200)
  })

  it('passe au-dessus du bouton quand le bas manque', () => {
    expect(placerAide(bouton(400, 760), taille, fenetre).top).toBe(760 - ECART_AIDE - 42)
  })

  it('en dernier recours, contre le bas de la fenêtre', () => {
    expect(placerAide(bouton(400, 10), taille, { largeur: 1200, hauteur: 50 }).top).toBe(MARGE_AIDE)
  })
})

describe('la mise en forme des textes d’aide', () => {
  it('les mots entre ** sont clairs, le reste ne l’est pas', () => {
    expect(morceauxAide('**Glisser** pour déplacer')).toEqual([
      { texte: 'Glisser', clair: true },
      { texte: ' pour déplacer', clair: false },
    ])
    expect(morceauxAide('**Cliquer** ou **⌘/** pour ouvrir le menu').map((m) => [m.texte, m.clair])).toEqual([
      ['Cliquer', true],
      [' ou ', false],
      ['⌘/', true],
      [' pour ouvrir le menu', false],
    ])
  })

  it('un texte sans marque reste entier', () => {
    expect(morceauxAide('Simple')).toEqual([{ texte: 'Simple', clair: false }])
  })

  it('un ** sans fermeture reste du texte', () => {
    expect(morceauxAide('a **b')).toEqual([{ texte: 'a **b', clair: false }])
    expect(morceauxAide('**a** et **b')).toEqual([
      { texte: 'a', clair: true },
      { texte: ' et **b', clair: false },
    ])
  })
})
