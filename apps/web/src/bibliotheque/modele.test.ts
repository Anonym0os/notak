// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { EntreeBibliotheque } from '../api'
import {
  adresseDeLaVue,
  arbreDesDossiers,
  avecApercus,
  compterParGenre,
  contenuDuDossier,
  fige,
  dansLaPortee,
  duFiltre,
  ecrireAffichage,
  estDossier,
  filDAriane,
  genere,
  lireAffichage,
  lireVue,
  memeEndroit,
  neLe,
  ordonner,
  parLesPuces,
  sansPlace,
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

  it('dans les récents (et la recherche, à plat), garde ce qui s’ouvre ; les photos, liens et fichiers restent sous leur puce', () => {
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

  it('ce qui arrive se montre là où c’est rangé, la toile qui l’a pris parcourue comme un dossier, jamais dans les récents', () => {
    expect(vueDeLArrivee('voyage')).toEqual({ portee: 'tout', filtre: 'tout', dossier: 'voyage' })
  })
})

describe('l’adresse de la vue', () => {
  it('se lit, et se réécrit ; `/`, c’est la racine, où la bibliothèque s’ouvre', () => {
    expect(lireVue('', 'accueil')).toEqual({ portee: 'tout', filtre: 'tout', dossier: 'accueil' })
    expect(lireVue('?type=toile', 'accueil')).toEqual({ portee: 'tout', filtre: 'toile', dossier: 'accueil' })
    expect(lireVue('?vue=recents', 'accueil')).toEqual({ portee: 'recents', filtre: 'tout' })
    expect(lireVue('?vue=favoris&type=image', 'accueil')).toEqual({ portee: 'favoris', filtre: 'image' })
    expect(lireVue('?vue=nimporte&type=quoi', 'accueil')).toEqual({ portee: 'tout', filtre: 'tout', dossier: 'accueil' })
    // Sans racine (pas d'espace), rien que la bibliothèque à plat.
    expect(lireVue('', null)).toEqual({ portee: 'tout', filtre: 'tout' })
    expect(adresseDeLaVue({ portee: 'tout', filtre: 'tout', dossier: 'accueil' }, 'accueil')).toBe('/')
    expect(adresseDeLaVue({ portee: 'tout', filtre: 'arbre', dossier: 'accueil' }, 'accueil')).toBe('/?type=arbre')
    expect(adresseDeLaVue({ portee: 'recents', filtre: 'tout' }, 'accueil')).toBe('/?vue=recents')
    expect(adresseDeLaVue({ portee: 'favoris', filtre: 'lien' }, 'accueil')).toBe('/?vue=favoris&type=lien')
  })

  it('`?dossier=` de la racine, et `?vue=tout` d’avant, y mènent aussi ; une ancienne adresse d’un seul genre, filtrée', () => {
    expect(lireVue('?dossier=accueil', 'accueil')).toEqual({ portee: 'tout', filtre: 'tout', dossier: 'accueil' })
    expect(lireVue('?vue=tout&type=arbre', 'accueil')).toEqual({ portee: 'tout', filtre: 'arbre', dossier: 'accueil' })
    expect(lireVue('?vue=toiles', 'accueil')).toEqual({ portee: 'tout', filtre: 'toile', dossier: 'accueil' })
    expect(lireVue('?vue=cartes', 'accueil')).toEqual({ portee: 'tout', filtre: 'arbre', dossier: 'accueil' })
    expect(lireVue('?vue=documents', 'accueil')).toEqual({ portee: 'tout', filtre: 'document', dossier: 'accueil' })
    expect(lireVue('?vue=photos', 'accueil')).toEqual({ portee: 'tout', filtre: 'image', dossier: 'accueil' })
  })
})

describe('l’ordre de la bibliothèque', () => {
  /** Un identifiant de Notak né à cet instant (`nouvelId`) : dix signes de date, seize de hasard. */
  const neA = (ms: number, suite = 'AAAAAAAAAAAAAAAA') => {
    let date = ''
    for (let t = ms, i = 0; i < 10; i++, t = Math.floor(t / 32)) date = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[t % 32] + date
    return date + suite
  }
  const MAINTENANT = Date.UTC(2026, 10, 23, 12)
  const HEURE = 3_600_000
  const toile = (titre: string, ms: number | null, plus: Partial<EntreeBibliotheque> = {}) => entree({ tableau: ms === null ? `vieux-${titre}` : neA(ms), titre, ...plus })
  const dossier = (titre: string, ms: number) =>
    entree({ tableau: neA(ms, 'BBBBBBBBBBBBBBBB'), titre, resume: { genre: 'toile', element: '', titre, boites: [], dossier: true } })

  it('la date de création se lit dans l’identifiant ; un identifiant d’une autre forme n’en dit rien', () => {
    expect(neLe({ tableau: neA(MAINTENANT - HEURE), element: null }, MAINTENANT)).toBe(MAINTENANT - HEURE)
    // Un élément : son identifiant à lui (il renaît dans la toile où on le déplace).
    expect(neLe({ tableau: neA(0), element: neA(MAINTENANT - 2 * HEURE) }, MAINTENANT)).toBe(MAINTENANT - 2 * HEURE)
    expect(neLe({ tableau: 'bb8fae71-0420-404e-8324-3a9ef12a98bc', element: null }, MAINTENANT)).toBeNull()
    expect(neLe({ tableau: 'voyage', element: null }, MAINTENANT)).toBeNull()
    // Une date d'avant Notak, ou à venir, n'en est pas une.
    expect(neLe({ tableau: neA(Date.UTC(2019, 0, 1)), element: null }, MAINTENANT)).toBeNull()
    expect(neLe({ tableau: neA(MAINTENANT + 3 * 86_400_000), element: null }, MAINTENANT)).toBeNull()
  })

  it('les dossiers d’abord, par nom ; puis le reste, la création la plus récente d’abord, ou par nom', () => {
    const l = [
      toile('Budget', MAINTENANT - 3 * HEURE),
      dossier('Projets', MAINTENANT - 9 * HEURE),
      toile('atelier', MAINTENANT - HEURE),
      toile('Ancienne', null),
      dossier('Clients', MAINTENANT),
      toile('Voyage', MAINTENANT - 2 * HEURE, { vu: MAINTENANT }),
    ]
    const titres = (x: EntreeBibliotheque[]) => x.map((e) => e.titre)
    // Ouvrir « Voyage » à l'instant ne le fait pas monter : l'ordre des récents n'est pas celui du rangement.
    expect(titres(ordonner(l, 'creation', MAINTENANT))).toEqual(['Clients', 'Projets', 'atelier', 'Voyage', 'Budget', 'Ancienne'])
    expect(titres(ordonner(l, 'nom', MAINTENANT))).toEqual(['Clients', 'Projets', 'Ancienne', 'atelier', 'Budget', 'Voyage'])
    // Ce qu'on vient de créer arrive en tête, juste après les dossiers.
    expect(titres(ordonner([...l, toile('Neuve', MAINTENANT - 1000)], 'creation', MAINTENANT)).slice(0, 3)).toEqual(['Clients', 'Projets', 'Neuve'])
  })

  it('à la main : l’ordre que retient le dossier ; ce qui n’y est pas encore passe devant, par date de création', () => {
    const budget = toile('Budget', MAINTENANT - 3 * HEURE)
    const atelier = toile('Atelier', MAINTENANT - 2 * HEURE)
    const voyage = toile('Voyage', MAINTENANT - 9 * HEURE)
    const clients = dossier('Clients', MAINTENANT - 5 * HEURE)
    const neuve = toile('Neuve', MAINTENANT - 1000)
    const cle = (e: EntreeBibliotheque) => `${e.tableau}/`
    const titres = (x: EntreeBibliotheque[]) => x.map((e) => e.titre)
    // Rangé à la main, un dossier peut suivre une toile ; une clé qui n'est plus là ne gêne pas.
    const ordre = [cle(voyage), cle(clients), 'partie/', cle(budget), cle(atelier)]
    expect(titres(ordonner([budget, atelier, voyage, clients, neuve], 'manuel', MAINTENANT, ordre))).toEqual(['Neuve', 'Voyage', 'Clients', 'Budget', 'Atelier'])
    // Jamais rangé à la main : l'ordre de la création.
    expect(titres(ordonner([budget, atelier, voyage, clients], 'manuel', MAINTENANT))).toEqual(['Clients', 'Atelier', 'Budget', 'Voyage'])
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

  it('la racine montre aussi les toiles à soi que rien ne range ; une toile partagée sans ce qui la range reste dans les partages', () => {
    const egaree = entree({ tableau: 'egaree', dans: null })
    const partagee = entree({ tableau: 'partagee', dans: null, partage: true })
    const monde = [...MONDE, egaree, partagee]
    expect([egaree, partagee, MONDE[0]!].map(sansPlace)).toEqual([true, false, false])
    expect(contenuDuDossier('accueil', monde, 'accueil').map((e) => e.tableau)).toEqual(['projets', 'archives', 'egaree'])
    // Un autre dossier ne la prend pas.
    expect(contenuDuDossier('projets', monde, 'accueil').map((e) => e.tableau)).toEqual(['voyage', 'atelier'])
  })

  it('un dossier porte l’aperçu de ce qu’il range : ses quatre premières entrées dans l’ordre où il les montre', () => {
    const photo = (element: string) =>
      entree({ tableau: 'voyage', element, genre: 'image', titre: element, dans: 'voyage', resume: { genre: 'image', element, titre: element, fichier: element, largeur: 4, hauteur: 3 } })
    // Des identifiants d'avant : sans date, par titre ; « aso » et « fuji » passent avant « kyoto » et les billets (« voyage »).
    const monde = [...MONDE, photo('kyoto'), photo('nara'), photo('osaka'), photo('aso'), photo('fuji')]
    const apres = avecApercus(monde)
    const apercu = (id: string) => apres.find((e) => e.tableau === id && e.element === null)!.resume.apercu
    expect(apercu('voyage')!.map((a) => a.resume.element)).toEqual(['aso', 'fuji', 'kyoto', 'nara'])
    expect(apercu('voyage')![0]).toEqual({ tableau: 'voyage', resume: { genre: 'image', element: 'aso', titre: 'aso', fichier: 'aso', largeur: 4, hauteur: 3 } })
    // « Projets » range un dossier, d'abord, qui s'y montre par son icône : pas d'aperçu dans l'aperçu.
    expect(apercu('projets')!.map((a) => [a.tableau, a.resume.genre])).toEqual([
      ['voyage', 'toile'],
      ['atelier', 'toile'],
    ])
    expect(apercu('projets')![0]!.resume).not.toHaveProperty('apercu')
    // Un dossier vide n'en a pas ; une toile ordinaire non plus, même quand elle range quelque chose.
    expect(apercu('archives')).toBeUndefined()
    expect(apercu('atelier')).toBeUndefined()
    // Sans dossier, rien ne change.
    expect(avecApercus(TOUTES)).toBe(TOUTES)
  })

  it('un raccourci y montre une toile rangée ailleurs, marquée et figée ; elle reste rangée chez elle', () => {
    // « Vitrine » est rangée dans « Projets » ; un raccourci la montre aussi dans « Archives » (et un autre, posé là où
    // elle est déjà rangée, ne la montre pas deux fois).
    const vitrine = { ...dossier('vitrine', 'projets', 'Vitrine'), raccourcis: ['archives', 'projets'] }
    const monde = [...MONDE, vitrine]
    expect(contenuDuDossier('archives', monde).map((e) => [e.tableau, e.raccourci])).toEqual([['vitrine', true]])
    expect(contenuDuDossier('projets', monde).filter((e) => e.tableau === 'vitrine').map((e) => e.raccourci)).toEqual([undefined])
    // Ni elle-même, ni ce qu'elle porte : seule la toile se montre par son raccourci.
    expect(contenuDuDossier('vitrine', [...monde, { ...vitrine, raccourcis: ['vitrine'] }])).toEqual([])
    expect(contenuDuDossier('archives', [...MONDE, { ...MONDE[5]!, raccourcis: ['archives'] }])).toEqual([])
    // Montrée par un raccourci, elle ne se déplace, ne se renomme ni ne se jette d'ici ; chez elle, si.
    expect(fige(contenuDuDossier('archives', monde)[0]!)).toBe(true)
    expect(fige(vitrine)).toBe(false)
    // Son fil reste le sien, et l'aperçu d'« Archives » la compte.
    expect(filDAriane('vitrine', monde, 'accueil')).toEqual(['accueil', 'projets', 'vitrine'])
    const apercu = avecApercus(monde).find((e) => e.tableau === 'archives')!.resume.apercu
    expect(apercu!.map((a) => a.tableau)).toEqual(['vitrine'])
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
      { ...dossier('clients', 'accueil', 'Clients'), outil: 'Comptoir' },
      { ...dossier('dupont', 'clients', 'Dupont'), outil: 'Comptoir', fiche: { nom: 'Comptoir' } },
      dossier('mien', 'clients', 'À moi'),
      // Ce que porte la toile d'un dossier généré, lui, se change et se range où l'on veut.
      { ...entree({ tableau: 'dupont', element: 'devis', genre: 'document', dans: 'dupont' }), outil: 'Comptoir' },
    ]
    expect(GENERES.map(genere)).toEqual([true, true, false, false])
    const [clients] = arbreDesDossiers(GENERES, 'accueil')
    expect([clients!.outil, clients!.enfants.map((n) => [n.titre, n.outil])]).toEqual([
      'Comptoir',
      [
        ['À moi', undefined],
        ['Dupont', 'Comptoir'],
      ],
    ])
  })

  it('l’adresse d’un dossier', () => {
    expect(adresseDeLaVue({ portee: 'tout', filtre: 'tout', dossier: 'voyage' }, 'accueil')).toBe('/?dossier=voyage')
    expect(adresseDeLaVue({ portee: 'tout', filtre: 'image', dossier: 'voyage' }, 'accueil')).toBe('/?dossier=voyage&type=image')
    expect(lireVue('?dossier=voyage&type=image', 'accueil')).toEqual({ portee: 'tout', filtre: 'image', dossier: 'voyage' })
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
