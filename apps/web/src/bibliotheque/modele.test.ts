// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { EntreeBibliotheque } from '../api'
import {
  adresseDeLaVue,
  arbreDesDossiers,
  compterParGenre,
  contenuDuDossier,
  dansLaPortee,
  duFiltre,
  ecrireAffichage,
  estDossier,
  filDAriane,
  immobile,
  lireAffichage,
  lireVue,
  regroupeUnOutil,
} from './modele'

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

describe('les dossiers', () => {
  const dossier = (tableau: string, dans: string | null, titre = tableau) =>
    entree({ tableau, titre, dans, resume: { genre: 'toile', element: '', titre, boites: [], dossier: true } })
  // Accueil › Projets › Voyage (dossiers) ; « Atelier » est une toile ordinaire rangée dans Projets, qui porte « Plans ».
  const MONDE = [
    dossier('projets', 'accueil', 'Projets'),
    dossier('voyage', 'projets', 'Voyage'),
    entree({ tableau: 'atelier', titre: 'Atelier', dans: 'projets' }),
    dossier('plans', 'atelier', 'Plans'),
    dossier('archives', 'accueil', 'Archives'),
    entree({ tableau: 'voyage', element: 'billets', genre: 'fichier', dans: 'voyage' }),
  ]

  it('se reconnaissent, et montrent ce qu’ils portent directement', () => {
    expect(MONDE.filter(estDossier).map((e) => e.tableau)).toEqual(['projets', 'voyage', 'plans', 'archives'])
    expect(contenuDuDossier('projets', MONDE).map((e) => e.tableau)).toEqual(['voyage', 'atelier'])
    expect(contenuDuDossier('voyage', MONDE).map((e) => e.element)).toEqual(['billets'])
  })

  it('le fil d’Ariane remonte jusqu’à l’accueil, et s’arrête là où l’on ne sait plus', () => {
    expect(filDAriane('voyage', MONDE, 'accueil')).toEqual(['accueil', 'projets', 'voyage'])
    expect(filDAriane('plans', MONDE, 'accueil')).toEqual(['accueil', 'projets', 'atelier', 'plans'])
    expect(filDAriane('accueil', MONDE, 'accueil')).toEqual(['accueil'])
    expect(filDAriane('ailleurs', [entree({ tableau: 'ailleurs', dans: null })], 'accueil')).toEqual(['ailleurs'])
    // Une boucle ne fait pas tourner en rond.
    const boucle = [entree({ tableau: 'a', dans: 'b' }), entree({ tableau: 'b', dans: 'a' })]
    expect(filDAriane('a', boucle, 'accueil')).toEqual(['b', 'a'])
  })

  it('l’arbre de la colonne : les dossiers par titre, à leur place ; sous une toile ordinaire, au dossier du dessus', () => {
    const plat = (n: ReturnType<typeof arbreDesDossiers>, p = 0): string[] => n.flatMap((x) => [`${'  '.repeat(p)}${x.titre}`, ...plat(x.enfants, p + 1)])
    expect(plat(arbreDesDossiers(MONDE, 'accueil'))).toEqual(['Archives', 'Projets', '  Plans', '  Voyage'])
  })

  it('ceux qu’un outil a posés restent en place ; celui qui range les autres ne se jette pas', () => {
    const clients = dossier('clients', 'accueil', 'Clients')
    const POSES = [
      { ...clients, outil: 'Silak' },
      { ...dossier('dupont', 'clients', 'Dupont'), outil: 'Silak', fiche: { nom: 'Silak' } },
      dossier('mien', 'clients', 'À moi'),
      // Ce que porte la toile d'un dossier posé, lui, se range où l'on veut.
      { ...entree({ tableau: 'dupont', element: 'devis', genre: 'document', dans: 'dupont' }), outil: 'Silak' },
    ]
    expect(POSES.map(immobile)).toEqual([true, true, false, false])
    expect(POSES.map(regroupeUnOutil)).toEqual([true, false, false, false])
  })

  it('l’adresse d’un dossier', () => {
    expect(adresseDeLaVue({ portee: 'tout', filtre: 'tout', dossier: 'voyage' })).toBe('/?dossier=voyage')
    expect(adresseDeLaVue({ portee: 'tout', filtre: 'image', dossier: 'voyage' })).toBe('/?dossier=voyage&type=image')
    expect(lireVue('?dossier=voyage&type=image')).toEqual({ portee: null, filtre: 'image', dossier: 'voyage' })
  })
})
