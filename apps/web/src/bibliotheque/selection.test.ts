import { describe, expect, it } from 'vitest'
import type { EntreeBibliotheque } from '../api'
import { type Boite, RIEN, cadreEntre, cadrer, cleDe, cliquer, garder, horsDAtteinte, porteuseDe, toutChoisir, voisine } from './selection'

const ordre = ['a', 'b', 'c', 'd', 'e']
const choisies = (s: { choisies: ReadonlySet<string> }) => [...s.choisies].sort()

/** Trois tuiles par ligne, de 100 × 80, 20 d'écart ; `e` est seule sur la deuxième ligne d'une autre section. */
const boites = new Map<string, Boite>([
  ['a', { gauche: 0, haut: 0, droite: 100, bas: 80 }],
  ['b', { gauche: 120, haut: 0, droite: 220, bas: 80 }],
  ['c', { gauche: 240, haut: 0, droite: 340, bas: 80 }],
  ['d', { gauche: 0, haut: 100, droite: 100, bas: 180 }],
  ['e', { gauche: 240, haut: 260, droite: 340, bas: 340 }],
])

describe('la sélection', () => {
  it('un clic choisit seul ; ⌘ ajoute ou retire ; ⇧ prend la suite depuis l’ancre', () => {
    let s = cliquer(RIEN, 'b', ordre)
    expect(choisies(s)).toEqual(['b'])
    s = cliquer(s, 'd', ordre, { ajout: true })
    expect(choisies(s)).toEqual(['b', 'd'])
    expect(s.ancre).toBe('d')
    s = cliquer(s, 'b', ordre, { ajout: true })
    expect(choisies(s)).toEqual(['d'])
    s = cliquer(s, 'e', ordre, { ajout: true })
    s = cliquer(s, 'b', ordre, { suite: true })
    expect(choisies(s)).toEqual(['b', 'c', 'd', 'e'])
    expect(s.ancre).toBe('e')
    // ⇧ sans ancre : un clic simple.
    expect(choisies(cliquer(RIEN, 'c', ordre, { suite: true }))).toEqual(['c'])
    // ⌘⇧ ajoute la suite à ce qui l'était déjà.
    expect(choisies(cliquer({ choisies: new Set(['e']), ancre: 'a' }, 'b', ordre, { suite: true, ajout: true }))).toEqual(['a', 'b', 'e'])
  })

  it('tout choisir, et ne garder que ce qui reste affiché', () => {
    expect(choisies(toutChoisir(ordre))).toEqual(ordre)
    const s = garder({ choisies: new Set(['a', 'z']), ancre: 'z' }, ordre)
    expect(choisies(s)).toEqual(['a'])
    expect(s.ancre).toBeNull()
    const pareil = { choisies: new Set(['a']), ancre: 'a' }
    expect(garder(pareil, ordre)).toBe(pareil)
  })

  it('un cadre prend ce qu’il touche ; ⇧ l’ajoute, ⌘ retourne ce qu’il touche', () => {
    const cadre = cadreEntre(150, 60, 10, 120)
    expect(cadre).toEqual({ gauche: 10, haut: 60, droite: 150, bas: 120 })
    expect(choisies(cadrer(RIEN, boites, cadre))).toEqual(['a', 'b', 'd'])
    const avant = { choisies: new Set(['a', 'e']), ancre: 'e' }
    expect(choisies(cadrer(avant, boites, cadre, { suite: true }))).toEqual(['a', 'b', 'd', 'e'])
    expect(choisies(cadrer(avant, boites, cadre, { ajout: true }))).toEqual(['b', 'd', 'e'])
    expect(choisies(cadrer(avant, boites, cadreEntre(500, 500, 600, 600)))).toEqual([])
  })

  it('les flèches vont à la voisine : de suite à gauche et à droite, sur la ligne d’à côté en haut et en bas', () => {
    expect(voisine(boites, ordre, null, 'droite')).toBe('a')
    expect(voisine(boites, ordre, 'c', 'droite')).toBe('d')
    expect(voisine(boites, ordre, 'a', 'gauche')).toBeNull()
    expect(voisine(boites, ordre, 'b', 'bas')).toBe('d')
    expect(voisine(boites, ordre, 'c', 'bas')).toBe('d')
    expect(voisine(boites, ordre, 'd', 'bas')).toBe('e')
    expect(voisine(boites, ordre, 'e', 'haut')).toBe('d')
    expect(voisine(boites, ordre, 'b', 'haut')).toBeNull()
  })
})

const entree = (tableau: string, element: string | null, dans: string | null): EntreeBibliotheque => ({
  tableau,
  element,
  dans,
  genre: element ? 'document' : 'toile',
  titre: tableau,
  resume: { genre: 'toile', element: '', titre: tableau, boites: [] },
  ou: null,
  vu: null,
  favori: false,
  partage: false,
})

describe('ranger', () => {
  const toutes = [entree('projets', null, 'accueil'), entree('a', null, 'projets'), entree('b', null, 'a'), entree('autre', null, 'accueil'), entree('projets', 'doc', 'projets')]

  it('une toile ne va ni dans elle-même ni dans ce qu’elle contient', () => {
    expect([...horsDAtteinte(toutes, [toutes[0]!])].sort()).toEqual(['a', 'b', 'projets'])
    expect([...horsDAtteinte(toutes, [toutes[4]!])]).toEqual([])
  })

  it('la clé et la toile qui porte', () => {
    expect(cleDe(toutes[4]!)).toBe('projets/doc')
    expect(cleDe(toutes[0]!)).toBe('projets/')
    expect(porteuseDe(toutes[4]!)).toBe('projets')
    expect(porteuseDe(toutes[1]!)).toBe('projets')
  })
})
