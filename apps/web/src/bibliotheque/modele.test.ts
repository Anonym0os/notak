// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { EntreeBibliotheque } from '../api'
import {
  adresseDeLaVue,
  arbreDesDossiers,
  avecApercus,
  compterParGenre,
  contenuDuDossier,
  dansLaPortee,
  duFiltre,
  ecrireAffichage,
  estDossier,
  filDAriane,
  genere,
  lireAffichage,
  lireVue,
  memeEndroit,
  parLesPuces,
  vueDeLArrivee,
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

describe('« Tout »', () => {
  // « Voyage » porte une page, une photo, un lien et un PDF ; la photo est en favori.
  const MELEES = [
    entree({ tableau: 'voyage', vu: 5 }),
    entree({ tableau: 'voyage', element: 'notes', genre: 'document', vu: 9 }),
    entree({ tableau: 'voyage', element: 'port', genre: 'image', vu: 8, favori: true }),
    entree({ tableau: 'voyage', element: 'site', genre: 'lien', vu: 7 }),
    entree({ tableau: 'voyage', element: 'billets', genre: 'fichier', vu: 6 }),
  ]
  const ids = (l: EntreeBibliotheque[]) => l.map((e) => e.element ?? e.tableau)

  it('dans toute la bibliothèque et les récents, garde ce qui s’ouvre ; les photos, liens et fichiers restent sous leur puce', () => {
    expect(ids(parLesPuces({ portee: 'tout', filtre: 'tout' }, MELEES))).toEqual(['voyage', 'notes'])
    expect(ids(parLesPuces({ portee: 'recents', filtre: 'tout' }, MELEES))).toEqual(['voyage', 'notes'])
    expect(ids(parLesPuces({ portee: 'tout', filtre: 'image' }, MELEES))).toEqual(['port'])
    expect(ids(parLesPuces({ portee: 'recents', filtre: 'fichier' }, MELEES))).toEqual(['billets'])
    // Les puces comptent toujours tout : « Photos » dit combien il y en a.
    expect(compterParGenre(MELEES)).toMatchObject({ image: 1, lien: 1, fichier: 1 })
  })

  it('dans un dossier ou les favoris, montre tout ce qu’on y a rangé ou choisi', () => {
    expect(ids(parLesPuces({ portee: 'tout', filtre: 'tout', dossier: 'voyage' }, MELEES))).toEqual(['voyage', 'notes', 'port', 'site', 'billets'])
    expect(ids(parLesPuces({ portee: 'favoris', filtre: 'tout' }, dansLaPortee('favoris', MELEES)))).toEqual(['port'])
  })

  it('ce qui arrive se montre dans les récents, sous la puce de son genre ; des pièces mêlées, dans la toile qui les a prises', () => {
    expect(vueDeLArrivee([{ genre: 'document' }, { genre: 'toile' }], 'voyage')).toEqual({ portee: 'recents', filtre: 'tout' })
    expect(vueDeLArrivee([{ genre: 'image' }, { genre: 'image' }], 'voyage')).toEqual({ portee: 'recents', filtre: 'image' })
    expect(vueDeLArrivee([{ genre: 'image' }, { genre: 'fichier' }], 'voyage')).toEqual({ portee: 'tout', filtre: 'tout', dossier: 'voyage' })
    expect(vueDeLArrivee([{ genre: 'image' }, { genre: 'document' }], 'voyage')).toEqual({ portee: 'tout', filtre: 'tout', dossier: 'voyage' })
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

  it('un dossier porte l’aperçu de ce qu’il range : ses quatre premières entrées, la plus récente d’abord, puis par titre', () => {
    const photo = (element: string, vu: number | null) =>
      entree({ tableau: 'voyage', element, genre: 'image', titre: element, dans: 'voyage', vu, resume: { genre: 'image', element, titre: element, fichier: element, largeur: 4, hauteur: 3 } })
    const monde = [...MONDE, photo('kyoto', null), photo('nara', 5), photo('osaka', 9), photo('aso', null), photo('fuji', null)]
    const apres = avecApercus(monde)
    const apercu = (id: string) => apres.find((e) => e.tableau === id && e.element === null)!.resume.apercu
    // Sans date, par titre : « aso » et « fuji » passent avant « kyoto » et les billets.
    expect(apercu('voyage')!.map((a) => a.resume.element)).toEqual(['osaka', 'nara', 'aso', 'fuji'])
    expect(apercu('voyage')![0]).toEqual({ tableau: 'voyage', resume: { genre: 'image', element: 'osaka', titre: 'osaka', fichier: 'osaka', largeur: 4, hauteur: 3 } })
    // « Projets » range un dossier, qui s'y montre par son icône : pas d'aperçu dans l'aperçu.
    expect(apercu('projets')!.map((a) => [a.tableau, a.resume.genre])).toEqual([
      ['atelier', 'toile'],
      ['voyage', 'toile'],
    ])
    expect(apercu('projets')![1]!.resume).not.toHaveProperty('apercu')
    // Un dossier vide n'en a pas ; une toile ordinaire non plus, même quand elle range quelque chose.
    expect(apercu('archives')).toBeUndefined()
    expect(apercu('atelier')).toBeUndefined()
    // Sans dossier, rien ne change.
    expect(avecApercus(TOUTES)).toBe(TOUTES)
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

  it('ceux qu’un outil a générés se reconnaissent, et l’arbre de la colonne le nomme', () => {
    const GENERES = [
      { ...dossier('clients', 'accueil', 'Clients'), outil: 'Silak' },
      { ...dossier('dupont', 'clients', 'Dupont'), outil: 'Silak', fiche: { nom: 'Silak' } },
      dossier('mien', 'clients', 'À moi'),
      // Ce que porte la toile d'un dossier généré, lui, se change et se range où l'on veut.
      { ...entree({ tableau: 'dupont', element: 'devis', genre: 'document', dans: 'dupont' }), outil: 'Silak' },
    ]
    expect(GENERES.map(genere)).toEqual([true, true, false, false])
    const [clients] = arbreDesDossiers(GENERES, 'accueil')
    expect([clients!.outil, clients!.enfants.map((n) => [n.titre, n.outil])]).toEqual([
      'Silak',
      [
        ['À moi', undefined],
        ['Dupont', 'Silak'],
      ],
    ])
  })

  it('l’adresse d’un dossier', () => {
    expect(adresseDeLaVue({ portee: 'tout', filtre: 'tout', dossier: 'voyage' })).toBe('/?dossier=voyage')
    expect(adresseDeLaVue({ portee: 'tout', filtre: 'image', dossier: 'voyage' })).toBe('/?dossier=voyage&type=image')
    expect(lireVue('?dossier=voyage&type=image')).toEqual({ portee: null, filtre: 'image', dossier: 'voyage' })
  })

  it('changer de dossier ou de rubrique change d’endroit ; changer de puce, non', () => {
    const recents = { portee: 'recents', filtre: 'tout' } as const
    expect(memeEndroit(recents, { portee: 'recents', filtre: 'image' })).toBe(true)
    expect(memeEndroit(recents, { portee: 'favoris', filtre: 'tout' })).toBe(false)
    expect(memeEndroit(recents, { ...recents, dossier: 'voyage' })).toBe(false)
    expect(memeEndroit({ ...recents, dossier: 'voyage' }, { portee: 'tout', filtre: 'toile', dossier: 'voyage' })).toBe(true)
    expect(memeEndroit({ ...recents, dossier: 'voyage' }, { ...recents, dossier: 'projets' })).toBe(false)
  })
})
