// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { type BoitePlan, type EntreeIndex, type ResumeContenu, creerDans, definirLangue, deplacer, jeter, quandPretes, renommerChose } from '@notak/tableau'
import { beforeEach, describe, expect, it } from 'vitest'
import { cheminDansLAppareil, entreesDeLAppareil, sourceLocale } from './bibliotheque'
import { espaceLocal } from './espace'
import { noterVu } from './vus'

const toile = (id: string, titre: string, parent?: string): EntreeIndex => ({ id, titre, cree: 0, ...(parent ? { parent } : {}) })
const plan: BoitePlan[] = [[0, 0, 10, 4, '', 'note', 1]]
const resumeToile = (titre: string, cartes: string[] = [], jetees: string[] = []): ResumeContenu => ({
  genre: 'toile',
  element: '',
  titre,
  boites: plan,
  ...(cartes.length ? { cartes } : {}),
  ...(jetees.length ? { jetees } : {}),
})

describe('les entrées de l’appareil', () => {
  beforeEach(() => definirLangue('fr'))

  const TOILES = [toile('accueil', ''), toile('voyage', 'Voyage', 'accueil'), toile('japon', 'Japon', 'accueil'), toile('vieux', 'Vieux', 'accueil')]
  const FICHES = new Map([
    ['accueil', { resumes: [resumeToile('', ['voyage'], ['vieux']), { genre: 'document' as const, element: 'cr', titre: 'Compte rendu', lignes: [] }] }],
    // « Japon », créée dans l'accueil, a été glissée dans « Voyage » : c'est sa carte qui le dit.
    ['voyage', { resumes: [resumeToile('Voyage', ['japon']), { genre: 'arbre' as const, element: 'plan', titre: 'Plan', branches: [] }] }],
    ['japon', { resumes: [resumeToile('Japon')] }],
    ['vieux', { resumes: [resumeToile('Vieux')] }],
  ])

  it('chaque toile hors l’accueil, rangée dans celle qui porte sa carte ; les cartes et les documents de toutes, l’accueil compris', () => {
    const e = entreesDeLAppareil(TOILES, 'accueil', FICHES, new Map(), {})
    expect(e.map((x) => [x.genre, x.titre, x.ou, x.dans])).toEqual([
      ['document', 'Compte rendu', 'Accueil', 'accueil'],
      ['toile', 'Voyage', 'Accueil', 'accueil'],
      ['arbre', 'Plan', 'Voyage', 'voyage'],
      ['toile', 'Japon', 'Voyage', 'voyage'],
    ])
    // Le résumé d'une toile ne dit plus ses cartes : la page n'en a pas besoin.
    expect(e.find((x) => x.tableau === 'voyage' && !x.element)!.resume).not.toHaveProperty('cartes')
  })

  it('une toile dont la carte est jetée n’y est plus', () => {
    const e = entreesDeLAppareil(TOILES, 'accueil', FICHES, new Map(), {})
    expect(e.some((x) => x.tableau === 'vieux')).toBe(false)
  })

  it('les favoris et les récents de l’appareil', () => {
    const e = entreesDeLAppareil(TOILES, 'accueil', FICHES, new Map([['voyage/', 1]]), { voyage: 50, 'voyage/e/plan': 70 })
    const voyage = e.find((x) => x.tableau === 'voyage' && !x.element)!
    expect([voyage.favori, voyage.vu, voyage.partage]).toEqual([true, 50, false])
    expect(e.find((x) => x.element === 'plan')!.vu).toBe(70)
  })

  it('les récents prennent aussi ce qu’on a ajouté, changé ou déplacé, mais pas ce qu’avait fait qui a envoyé la toile', () => {
    const photo = (element: string) => ({ genre: 'image' as const, element, titre: '', fichier: element, largeur: 1, hauteur: 1 })
    // « Voyage » est arrivée dans l'espace à 100 (une copie reçue) : ses gestes d'avant sont ceux de l'expéditeur.
    const toiles = [toile('accueil', ''), { ...toile('voyage', 'Voyage', 'accueil'), cree: 100 }]
    const fiches = new Map([
      ['accueil', { resumes: [resumeToile('', ['voyage'])] }],
      ['voyage', { resumes: [resumeToile('Voyage'), photo('posee'), photo('recue'), photo('ouverte'), photo('rien')], gestes: { '': 300, posee: 300, recue: 50, ouverte: 150 } }],
    ])
    const e = entreesDeLAppareil(toiles, 'accueil', fiches, new Map(), { voyage: 200, 'voyage/e/recue': 120, 'voyage/e/ouverte': 400 })
    const vu = (element: string | null) => e.find((x) => x.tableau === 'voyage' && x.element === element)!.vu
    expect([vu(null), vu('posee'), vu('recue'), vu('ouverte'), vu('rien')]).toEqual([300, 300, 120, 400, null])
  })

  it('les photos, les liens et les fichiers des toiles, et leurs favoris', () => {
    const fiches = new Map([
      ['accueil', { resumes: [resumeToile(''), { genre: 'image' as const, element: 'port', titre: '', fichier: 'f', largeur: 1, hauteur: 1 }] }],
      ['voyage', { resumes: [resumeToile('Voyage'), { genre: 'fichier' as const, element: 'pdf', titre: 'Billets', fichier: 'g', nom: 'b.pdf', typeMime: 'application/pdf', taille: 1 }] }],
    ])
    const e = entreesDeLAppareil([toile('accueil', ''), toile('voyage', 'Voyage', 'accueil')], 'accueil', fiches, new Map([['voyage/pdf', 1]]), {})
    expect(e.map((x) => [x.genre, x.element, x.dans, x.favori])).toEqual([
      ['image', 'port', 'accueil', false],
      ['toile', null, 'accueil', false],
      ['fichier', 'pdf', 'voyage', true],
    ])
  })

  it('une toile que le catalogue ne connaît pas encore se montre quand même, sans plan', () => {
    const e = entreesDeLAppareil([toile('accueil', 'Accueil'), toile('neuve', 'Neuve', 'accueil')], 'accueil', new Map(), new Map(), {})
    expect(e.map((x) => [x.titre, x.dans, x.resume.genre])).toEqual([['Neuve', 'accueil', 'toile']])
  })
})

describe('le chemin d’une toile de l’appareil, pour le fil de son en-tête', () => {
  const TOILES = [toile('accueil', 'Accueil'), toile('projets', 'Projets', 'accueil'), toile('voyage', 'Voyage', 'accueil'), toile('japon', 'Japon', 'voyage'), toile('seule', 'Seule')]
  const FICHES = new Map([
    ['accueil', { resumes: [resumeToile('Accueil', ['projets'])] }],
    // « Voyage », créée dans l'accueil, a été glissée dans « Projets » : c'est sa carte qui le dit.
    ['projets', { resumes: [{ ...resumeToile('Projets', ['voyage']), dossier: true } as ResumeContenu] }],
  ])
  const el = { index: { lister: () => TOILES, racine: () => 'accueil', entree: (id: string) => TOILES.find((e) => e.id === id) }, catalogue: { fiches: async () => FICHES } }

  it('va de l’accueil à son parent par la règle de la bibliothèque, et dit ce qui se montre en dossier', async () => {
    expect(await cheminDansLAppareil(el as never, 'japon')).toEqual([
      { id: 'accueil', titre: 'Accueil' },
      { id: 'projets', titre: 'Projets', dossier: true },
      { id: 'voyage', titre: 'Voyage' },
    ])
  })

  it('rien au-dessus de l’accueil, ni d’une toile que rien ne range', async () => {
    expect(await cheminDansLAppareil(el as never, 'accueil')).toEqual([])
    expect(await cheminDansLAppareil(el as never, 'seule')).toEqual([])
  })
})

describe('la source de l’appareil', () => {
  beforeEach(() => definirLangue('fr'))

  it('lit les toiles, ce qu’elles portent, et suit ce qu’on y range, jette ou met en favori', async () => {
    const el = await espaceLocal()
    const { espace, index } = el
    await quandPretes(espace, [espace.racine])
    const voyage = creerDans(espace, espace.racine, 'toile', 'Voyage au Japon').tableau
    const atelier = creerDans(espace, espace.racine, 'toile', 'Atelier').tableau
    const carte = creerDans(espace, voyage, 'arbre')
    renommerChose(espace, { toile: carte.tableau, element: carte.element }, 'Itinéraire')
    noterVu(voyage)
    const source = sourceLocale(el)

    let entrees = await source.charger()
    const de = (id: string) => entrees.find((x) => x.tableau === id && x.element === null)
    expect(de(voyage)).toMatchObject({ titre: 'Voyage au Japon', dans: espace.racine, partage: false })
    expect(de(voyage)!.vu).not.toBeNull()
    expect(entrees.find((x) => x.element === carte.element)).toMatchObject({ genre: 'arbre', titre: 'Itinéraire', dans: voyage, ou: 'Voyage au Japon' })
    // La carte mentale qu'on vient d'y créer est parmi les récents, sans qu'on l'ait ouverte.
    expect(entrees.find((x) => x.element === carte.element)!.vu).not.toBeNull()

    // Ranger « Atelier » dans « Voyage » : sa carte passe d'une toile à l'autre, l'index suit.
    const carteAtelier = espace.magasin(espace.racine).lire().elements.find((x) => x.contenu.type === 'tableau' && x.contenu.cible === atelier)!
    deplacer(espace, [{ toile: espace.racine, element: carteAtelier.id }], voyage)
    await source.rangerToile(atelier, voyage)
    expect(index.entree(atelier)!.parent).toBe(voyage)

    await source.definirFavori(voyage, true)
    expect(index.favoris().has(`${voyage}/`)).toBe(true)
    await source.definirFavori(voyage, true, 'une-photo')
    expect(index.favoris().has(`${voyage}/une-photo`)).toBe(true)

    // Les toiles changées se relisent une fois retombées (le suivi du réseau) : on attend le catalogue.
    const changements = new Promise<void>((fin) => {
      const arreter = source.ecouter(() => {
        arreter()
        fin()
      })
    })
    await changements
    await new Promise((fin) => setTimeout(fin, 1800))
    entrees = await source.charger()
    expect(de(atelier)).toMatchObject({ dans: voyage, ou: 'Voyage au Japon' })
    expect(de(voyage)!.favori).toBe(true)

    // Jeter « Voyage » : elle part, avec ce qu'elle contient.
    const carteVoyage = espace.magasin(espace.racine).lire().elements.find((x) => x.contenu.type === 'tableau' && x.contenu.cible === voyage)!
    jeter(espace, [{ toile: espace.racine, element: carteVoyage.id }])
    await new Promise((fin) => setTimeout(fin, 1800))
    entrees = await source.charger()
    expect(de(voyage)).toBeUndefined()
    expect(de(atelier)).toBeUndefined()
    expect(entrees.find((x) => x.element === carte.element)).toBeUndefined()
  }, 20_000)

  it('ranger à l’essai ne change rien, et ne coûte rien à personne', async () => {
    const el = await espaceLocal()
    const source = sourceLocale(el)
    const id = el.espace.creerTableau('Essai', el.index.racine())
    const bilan = await source.rangerToile(id, 'ailleurs', { essai: true })
    expect(bilan).toEqual({ nouveaux: 0, perdus: 0, permanents: 0, liensOuverts: 0, liensEteints: 0, fait: false })
    expect(el.index.entree(id)!.parent).toBe(el.index.racine())
  })
})
