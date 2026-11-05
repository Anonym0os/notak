// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { EntreeBibliotheque } from '../api'
import { adresseDeLaVue, compterParGenre, dansLaPortee, duFiltre, ecrireAffichage, lireAffichage, lireVue } from './modele'

const entree = (e: Partial<EntreeBibliotheque> & Pick<EntreeBibliotheque, 'tableau'>): EntreeBibliotheque =>
  ({ element: null, genre: 'toile', titre: e.tableau, ou: null, dans: null, vu: null, favori: false, partage: false, resume: { genre: 'toile', element: '', titre: '', boites: [] }, ...e }) as EntreeBibliotheque

const TOUTES = [
  entree({ tableau: 'voyage', vu: 5, favori: true }),
  entree({ tableau: 'budget', partage: true }),
  entree({ tableau: 'voyage', element: 'port', genre: 'image', favori: true }),
  entree({ tableau: 'voyage', element: 'notes', genre: 'document', vu: 9 }),
]

describe('où et quoi', () => {
  it('la portée garde tout, ce qu’on a ouvert, les favoris ou les partages', () => {
    expect(dansLaPortee('tout', TOUTES)).toHaveLength(4)
    expect(dansLaPortee('recents', TOUTES).map((e) => e.element ?? e.tableau)).toEqual(['voyage', 'notes'])
    expect(dansLaPortee('favoris', TOUTES).map((e) => e.element ?? e.tableau)).toEqual(['voyage', 'port'])
    expect(dansLaPortee('partages', TOUTES).map((e) => e.tableau)).toEqual(['budget'])
  })

  it('les puces gardent un genre, et se comptent', () => {
    expect(duFiltre('image', TOUTES).map((e) => e.element)).toEqual(['port'])
    expect(duFiltre('tout', TOUTES)).toHaveLength(4)
    expect(compterParGenre(dansLaPortee('favoris', TOUTES))).toEqual({ tout: 2, toile: 1, document: 0, arbre: 0, image: 1, lien: 0, fichier: 0 })
  })
})

describe('l’adresse de la vue', () => {
  it('se lit, et se réécrit ; les récents sans filtre, c’est la racine', () => {
    expect(lireVue('?vue=favoris&type=image')).toEqual({ portee: 'favoris', filtre: 'image' })
    expect(lireVue('')).toEqual({ portee: null, filtre: 'tout' })
    expect(lireVue('?vue=nimporte&type=quoi')).toEqual({ portee: null, filtre: 'tout' })
    expect(adresseDeLaVue({ portee: 'recents', filtre: 'tout' })).toBe('/')
    expect(adresseDeLaVue({ portee: 'tout', filtre: 'arbre' })).toBe('/?vue=tout&type=arbre')
    expect(adresseDeLaVue({ portee: 'recents', filtre: 'lien' })).toBe('/?type=lien')
  })

  it('une ancienne adresse d’un seul genre ouvre la bibliothèque, filtrée', () => {
    expect(lireVue('?vue=toiles')).toEqual({ portee: 'tout', filtre: 'toile' })
    expect(lireVue('?vue=cartes')).toEqual({ portee: 'tout', filtre: 'arbre' })
    expect(lireVue('?vue=documents')).toEqual({ portee: 'tout', filtre: 'document' })
    expect(lireVue('?vue=photos')).toEqual({ portee: 'tout', filtre: 'image' })
  })
})

describe('l’affichage', () => {
  beforeEach(() => localStorage.clear())

  it('en grille d’abord ; la liste se retient', () => {
    expect(lireAffichage()).toBe('grille')
    ecrireAffichage('liste')
    expect(lireAffichage()).toBe('liste')
  })
})
