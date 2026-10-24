import { describe, expect, it } from 'vitest'
import { lireAdresse } from './bulleAdresse'
import { boutonsBulle, bulleVisible, memeSelection, placerBulle } from './bullePosition'

const fenetre = { largeur: 1400, hauteur: 900 }
const taille = { largeur: 192, hauteur: 160 }
const fin = (right: number, top: number, bottom = top + 19) => ({ left: right, right, top, bottom })

describe('NOTION.md § 4.2 : la place de la bulle', () => {
  it('16 px à droite de la fin de la sélection, 16 px sous sa ligne', () => {
    expect(placerBulle(fin(736.6, 400), taille, fenetre)).toEqual({ left: 752.6, top: 435 })
  })

  it('elle reste dans la fenêtre : poussée à gauche au bord droit', () => {
    expect(placerBulle(fin(1380, 400), taille, fenetre).left).toBe(1400 - 12 - 192)
  })

  it('passe au-dessus de la sélection s’il n’y a pas la place dessous', () => {
    expect(placerBulle(fin(500, 800), taille, fenetre)).toEqual({ left: 516, top: 800 - 16 - 160 })
  })

  it('et se cale contre le bas quand ni dessous ni dessus ne conviennent', () => {
    expect(placerBulle(fin(500, 80), taille, { largeur: 1400, hauteur: 200 }).top).toBe(200 - 12 - 160)
  })
})

describe('NOTION.md § 4.1 : quand elle reste où elle est', () => {
  it('une sélection qui grandit ou se resserre est la même ; un autre passage non', () => {
    const avant = { de: 10, a: 14 }
    expect(memeSelection(avant, { de: 10, a: 20 })).toBe(true)
    expect(memeSelection(avant, { de: 12, a: 13 })).toBe(true)
    expect(memeSelection(avant, { de: 14, a: 18 })).toBe(true)
    expect(memeSelection(avant, { de: 30, a: 34 })).toBe(false)
    expect(memeSelection(null, { de: 30, a: 34 })).toBe(false)
  })

  it('elle ne paraît que sur du texte choisi, éditeur focalisé, hors code, hors blocs choisis, hors glisser, hors lien', () => {
    const ok = { texteChoisi: true, focus: true, code: false, blocsChoisis: false, glisse: false, lien: false }
    expect(bulleVisible(ok)).toBe(true)
    for (const k of ['texteChoisi', 'focus'] as const) expect(bulleVisible({ ...ok, [k]: false })).toBe(false)
    for (const k of ['code', 'blocsChoisis', 'glisse', 'lien'] as const) expect(bulleVisible({ ...ok, [k]: true })).toBe(false)
  })

  it('le type et le lien ne sont proposés que dans un seul bloc', () => {
    expect(boutonsBulle(true, { commenter: true, plus: true })).toEqual({ type: true, lien: true, commenter: true, plus: true })
    expect(boutonsBulle(false, { commenter: true, plus: false })).toEqual({ type: false, lien: false, commenter: true, plus: false })
  })
})

describe('NOTION.md § 5 : l’adresse d’un lien', () => {
  it('sans protocole, c’est du https ; une adresse de courriel devient mailto', () => {
    expect(lireAdresse('exemple.fr')).toEqual({ genre: 'web', url: 'https://exemple.fr' })
    expect(lireAdresse('http://exemple.fr/a?b=1')).toEqual({ genre: 'web', url: 'http://exemple.fr/a?b=1' })
    expect(lireAdresse('moi@exemple.fr')).toEqual({ genre: 'courriel', url: 'mailto:moi@exemple.fr' })
  })

  it('un mot seul n’est pas une adresse', () => {
    expect(lireAdresse('bonjour').genre).toBe('invalide')
    expect(lireAdresse('   ').genre).toBe('invalide')
    expect(lireAdresse('deux mots.fr').genre).toBe('invalide')
  })
})
