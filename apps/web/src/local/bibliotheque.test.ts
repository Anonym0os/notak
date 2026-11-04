// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { type BoitePlan, type EntreeIndex, type ResumeContenu, creerDans, definirLangue, deplacer, jeter, quandPretes, renommerChose } from '@notak/tableau'
import { beforeEach, describe, expect, it } from 'vitest'
import { entreesDeLAppareil, sourceLocale } from './bibliotheque'
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

  it('une toile que le catalogue ne connaît pas encore se montre quand même, sans plan', () => {
    const e = entreesDeLAppareil([toile('accueil', 'Accueil'), toile('neuve', 'Neuve', 'accueil')], 'accueil', new Map(), new Map(), {})
    expect(e.map((x) => [x.titre, x.dans, x.resume.genre])).toEqual([['Neuve', 'accueil', 'toile']])
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

    // Ranger « Atelier » dans « Voyage » : sa carte passe d'une toile à l'autre, l'index suit.
    const carteAtelier = espace.magasin(espace.racine).lire().elements.find((x) => x.contenu.type === 'tableau' && x.contenu.cible === atelier)!
    deplacer(espace, [{ toile: espace.racine, element: carteAtelier.id }], voyage)
    await source.rangerToile(atelier, voyage)
    expect(index.entree(atelier)!.parent).toBe(voyage)

    await source.definirFavori(voyage, true)
    expect(index.favoris().has(`${voyage}/`)).toBe(true)

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
