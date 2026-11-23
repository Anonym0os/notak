import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { type Compte, type Monde, monde } from './essai.ts'
import type { SourceRattachement } from './rattachements.ts'
import { indexerDocument } from './indexation.ts'
import { nomDuDocument } from './synchro.ts'

type Lien = { cle: string; lien: string; tableau?: string }
type Reponse = { etat: string; tableau?: string; titre?: string; code?: string; dans?: Lien[] }
type Carte = { id: string; x: number; y: number; contenu: { type: string; cible?: string; raccourci?: boolean } }

/**
 * Le dossier d'une fiche rangée sous plusieurs entités de l'outil (`dans`) : un projet sous ses sociétés et ses
 * établissements. Un seul dossier, son vrai parent sous la première entité, un raccourci sous chacune des autres.
 */
describe('le dossier d’une fiche rangé sous ses entités (`dans`)', () => {
  let m: Monde
  let ana: Compte
  let bob: Compte

  beforeAll(async () => {
    // L'espace d'Ana est celui de l'outil : Bob y écrira quand elle lui ouvrira son accueil.
    const sources: SourceRattachement[] = []
    m = monde({ rattachements: sources })
    ana = await m.compte('Ana')
    bob = await m.compte('Bob')
    sources.push({ source: 'crm', nom: 'Mon CRM', dossier: 'Clients', origine: 'https://crm.exemple.fr', espace: m.base.espacePersonnel(ana.utilisateur.id)! })
  })
  afterAll(() => m.fermer())

  const relier = async (c: Compte, cle: string, corps: Record<string, unknown> = {}) => {
    const r = await m.appeler(`/api/rattachements/crm/${encodeURIComponent(cle)}`, { compte: c, json: corps })
    return { statut: r.status, corps: (await r.json()) as Reponse }
  }
  const lire = (tableau: string) => {
    const doc = new Y.Doc()
    Y.applyUpdate(doc, m.base.document(nomDuDocument(tableau))!)
    return doc
  }
  const cartes = (dans: string, cible: string) =>
    [...lire(dans).getMap<Carte>('elements').values()].filter((e) => e.contenu.type === 'tableau' && e.contenu.cible === cible)
  const raccourcis = (dans: string, cible: string) => cartes(dans, cible).filter((e) => e.contenu.raccourci === true)
  /** Le dossier rattaché d'une fiche, dans l'espace de l'outil. */
  const dossierDe = (cle: string) => m.base.rattachementsDeLaFiche('crm', cle)[0]?.tableau
  /** Déplace un élément à la main, comme on le fait sur la toile. */
  const deplacer = (tableau: string, element: string, x: number) => {
    const doc = lire(tableau)
    const elements = doc.getMap<Carte>('elements')
    elements.set(element, { ...elements.get(element)!, x })
    m.base.enregistrerDocument(nomDuDocument(tableau), Y.encodeStateAsUpdate(doc))
  }

  it('une entité : le dossier du projet se range dans le sien, créé au besoin dans celui de l’outil', async () => {
    const r = await relier(ana, 'projet:1', { titre: 'Refonte du site', dans: [{ cle: 'societe:1', titre: 'Dupont SARL' }] })
    expect(r.statut).toBe(201)
    const projet = r.corps.tableau!
    const societe = dossierDe('societe:1')!
    // Le dossier de la société, créé à son titre, dans « Clients » ; celui du projet, dedans.
    expect(m.base.tableau(societe)).toMatchObject({ titre: 'Dupont SARL' })
    expect(m.base.tableau(m.base.tableau(societe)!.parent!)).toMatchObject({ titre: 'Clients' })
    expect(m.base.tableau(projet)!.parent).toBe(societe)
    expect(cartes(societe, projet)).toHaveLength(1)
    expect(raccourcis(societe, projet)).toHaveLength(0)
    expect(r.corps.dans).toEqual([{ cle: 'societe:1', lien: 'dossier', tableau: societe }])
    // La lecture ne change pas : ni `dans`, ni autre chose.
    const lu = await m.appeler('/api/rattachements/crm/projet:1', { compte: ana })
    expect(await lu.json()).toEqual({ etat: 'present', tableau: projet, titre: 'Refonte du site', source: 'Mon CRM', dossier: 'Clients' })
  })

  it('sans `dans`, rien ne change : rangé dans le dossier de l’outil, et un rappel ne pose rien', async () => {
    const r = await relier(ana, 'projet:0', { titre: 'Sans client' })
    expect(r.statut).toBe(201)
    expect(r.corps.dans).toBeUndefined()
    expect(m.base.tableau(m.base.tableau(r.corps.tableau!)!.parent!)).toMatchObject({ titre: 'Clients' })
    expect(await relier(ana, 'projet:0', { dans: 'societe:1' })).toMatchObject({ statut: 400, corps: { code: 'dans_invalide' } })
    expect(await relier(ana, 'projet:0', { dans: ['projet:0'] })).toMatchObject({ statut: 400, corps: { code: 'dans_invalide' } })
    expect(await relier(ana, 'projet:0', { dans: ['société 1'] })).toMatchObject({ statut: 400, corps: { code: 'dans_invalide' } })
  })

  it('trois entités : un seul dossier, sous la première ; un raccourci sous chacune des deux autres', async () => {
    await relier(ana, 'etablissement:4', { titre: 'Atelier de Limoges' })
    const r = await relier(ana, 'projet:2', { titre: 'Chantier', dans: [{ cle: 'societe:2', titre: 'Martin' }, 'etablissement:4', { cle: 'societe:3', titre: 'Durand' }] })
    expect(r.statut).toBe(201)
    const projet = r.corps.tableau!
    const [s2, e4, s3] = ['societe:2', 'etablissement:4', 'societe:3'].map((c) => dossierDe(c)!) as [string, string, string]
    expect(m.base.rattachementsDeLaFiche('crm', 'projet:2')).toHaveLength(1)
    expect(m.base.tableau(projet)!.parent).toBe(s2)
    expect(raccourcis(s2, projet)).toHaveLength(0)
    expect(raccourcis(e4, projet)).toHaveLength(1)
    expect(raccourcis(s3, projet)).toHaveLength(1)
    // Le dossier de l'outil ne le porte pas : il n'est pas rangé à plat.
    expect(cartes(m.base.tableau(s2)!.parent!, projet)).toHaveLength(0)
    expect(r.corps.dans).toEqual([
      { cle: 'societe:2', lien: 'dossier', tableau: s2 },
      { cle: 'etablissement:4', lien: 'raccourci', tableau: e4 },
      { cle: 'societe:3', lien: 'raccourci', tableau: s3 },
    ])
    // Le même rappel ne pose rien de plus.
    expect(await relier(ana, 'projet:2', { dans: ['societe:2', 'etablissement:4', 'societe:3'] })).toMatchObject({ statut: 200, corps: { etat: 'present', tableau: projet } })
    expect(raccourcis(e4, projet)).toHaveLength(1)
    expect(raccourcis(s3, projet)).toHaveLength(1)
  })

  it('un rappel avec une liste changée pose et retire les raccourcis ; le vrai parent et ce qu’on a déplacé restent', async () => {
    const projet = dossierDe('projet:2')!
    const [s2, e4, s3] = ['societe:2', 'etablissement:4', 'societe:3'].map((c) => dossierDe(c)!) as [string, string, string]
    await relier(ana, 'societe:6', { titre: 'Petit' })
    const s6 = dossierDe('societe:6')!
    // Quelqu'un déplace à la main le raccourci posé sous Durand.
    deplacer(s3, raccourcis(s3, projet)[0]!.id, 80)

    const r = await relier(ana, 'projet:2', { dans: ['etablissement:4', 'societe:6', 'societe:7'] })
    expect(r.statut).toBe(200)
    // Martin, sorti de la liste, garde le vrai parent : on ne le déplace jamais.
    expect(m.base.tableau(projet)!.parent).toBe(s2)
    expect(raccourcis(e4, projet)).toHaveLength(1)
    expect(raccourcis(s6, projet)).toHaveLength(1)
    // Durand, sorti aussi : son raccourci déplacé à la main reste.
    expect(raccourcis(s3, projet)).toHaveLength(1)
    // Au rappel, une entité sans dossier n'en reçoit pas : on ne crée rien sans qu'on ouvre sa fiche.
    expect(dossierDe('societe:7')).toBeUndefined()
    expect(r.corps.dans).toEqual([
      { cle: 'etablissement:4', lien: 'raccourci', tableau: e4 },
      { cle: 'societe:6', lien: 'raccourci', tableau: s6 },
      { cle: 'societe:7', lien: 'absent' },
    ])

    // Une liste vide retire ce que Notak a posé et que personne n'a touché.
    expect((await relier(ana, 'projet:2', { dans: [] })).corps.dans).toEqual([])
    expect(raccourcis(e4, projet)).toHaveLength(0)
    expect(raccourcis(s6, projet)).toHaveLength(0)
    expect(raccourcis(s3, projet)).toHaveLength(1)
    expect(m.base.tableau(projet)!.parent).toBe(s2)

    // Durand revient : son raccourci déplacé suffit, il ne s'en pose pas un second ; et, posé par la personne, il ne
    // se retire plus.
    await relier(ana, 'projet:2', { dans: ['societe:3'] })
    expect(raccourcis(s3, projet)).toHaveLength(1)
    await relier(ana, 'projet:2', { dans: [] })
    expect(raccourcis(s3, projet)).toHaveLength(1)
  })

  it('une entité sans droit : ni raccourci ni dossier chez elle ; le projet se range sous la suivante', async () => {
    await relier(ana, 'societe:8', { titre: 'Confidentiel' })
    const s8 = dossierDe('societe:8')!
    const s1 = dossierDe('societe:1')!
    // Bob n'écrit que dans le dossier de Dupont : celui de l'autre société, il ne le voit même pas.
    m.base.definirAcces({ tableau: s1, utilisateur: bob.utilisateur.id, role: 'edition' })
    await m.autorisation.vider()

    const r = await relier(bob, 'projet:9', { titre: 'Audit', dans: ['societe:8', 'societe:1'] })
    expect(r.statut).toBe(201)
    const projet = r.corps.tableau!
    expect(m.base.tableau(projet)!.parent).toBe(s1)
    expect(cartes(s8, projet)).toHaveLength(0)
    expect(r.corps.dans).toEqual([
      { cle: 'societe:8', lien: 'interdit' },
      { cle: 'societe:1', lien: 'dossier', tableau: s1 },
    ])

    // Seule entité, et fermée : comme sans `dans`, le dossier de l'outil, où il n'écrit pas non plus. Rien de créé.
    expect(await relier(bob, 'projet:10', { titre: 'Seul', dans: ['societe:8'] })).toMatchObject({ statut: 403, corps: { code: 'interdit' } })
    expect(dossierDe('projet:10')).toBeUndefined()

    // Ana, qui y écrit, rappelle la même liste : le raccourci se pose chez la société fermée à Bob.
    const rappel = await relier(ana, 'projet:9', { dans: ['societe:8', 'societe:1'] })
    expect(rappel.corps.dans).toEqual([
      { cle: 'societe:8', lien: 'raccourci', tableau: s8 },
      { cle: 'societe:1', lien: 'dossier', tableau: s1 },
    ])
    expect(raccourcis(s8, projet)).toHaveLength(1)
    // Bob, qui n'y écrit pas, ne le retire pas en rappelant sans elle.
    await relier(bob, 'projet:9', { dans: ['societe:1'] })
    expect(raccourcis(s8, projet)).toHaveLength(1)
  })

  it('une première entité jetée à la corbeille : le projet se range sous la suivante, ou dans le dossier de l’outil', async () => {
    await relier(ana, 'societe:20', { titre: 'Jetée' })
    m.base.marquerCorbeille({ espace: m.base.espacePersonnel(ana.utilisateur.id)!, source: 'crm', cle: 'societe:20' }, m.maintenant(), 'personne')
    const r = await relier(ana, 'projet:20', { titre: 'Après la corbeille', dans: ['societe:20'] })
    expect(r.statut).toBe(201)
    expect(r.corps.dans).toEqual([{ cle: 'societe:20', lien: 'jete' }])
    expect(m.base.tableau(m.base.tableau(r.corps.tableau!)!.parent!)).toMatchObject({ titre: 'Clients' })
    expect(cartes(dossierDe('societe:20')!, r.corps.tableau!)).toHaveLength(0)
  })

  it('la bibliothèque et le contenu de la fiche montrent le projet sous chaque entité, marqué là où c’est un raccourci', async () => {
    type Entree = { tableau: string; element: string | null; dans: string | null; raccourcis?: string[]; resume: Record<string, unknown> }
    type Contenu = { elements: { tableau: string; raccourci?: boolean }[] }
    await relier(ana, 'societe:31', { titre: 'Bernard' })
    const r = await relier(ana, 'projet:30', { titre: 'Vitrine', dans: [{ cle: 'societe:30', titre: 'Arnaud' }, 'societe:31'] })
    const projet = r.corps.tableau!
    const [s30, s31] = ['societe:30', 'societe:31'].map((c) => dossierDe(c)!) as [string, string]
    const bibliotheque = async (c: Compte) => (await (await m.appeler('/api/bibliotheque', { compte: c })).json()) as Entree[]
    const contenu = async (c: Compte, cle: string) => (await (await m.appeler(`/api/rattachements/crm/${cle}/contenu`, { compte: c })).json()) as Contenu

    // Rangé sous la première entité ; montré, en plus, sous la seconde. Le résumé ne dit pas ses raccourcis.
    const entree = (await bibliotheque(ana)).find((e) => e.tableau === projet && e.element === null)!
    expect(entree).toMatchObject({ dans: s30, raccourcis: [s31] })
    expect((await bibliotheque(ana)).find((e) => e.tableau === s31)!.resume).not.toHaveProperty('raccourcis')
    expect((await contenu(ana, 'societe:30')).elements.find((e) => e.tableau === projet)).not.toHaveProperty('raccourci')
    expect((await contenu(ana, 'societe:31')).elements.find((e) => e.tableau === projet)).toMatchObject({ raccourci: true })

    // Bob lit le dossier de Bernard, pas celui d'Arnaud où le projet est rangé : il ne le voit nulle part.
    m.base.definirAcces({ tableau: s31, utilisateur: bob.utilisateur.id, role: 'lecture' })
    await m.autorisation.vider()
    const chezBob = await bibliotheque(bob)
    expect(chezBob.some((e) => e.tableau === s31)).toBe(true)
    expect(chezBob.some((e) => e.tableau === projet)).toBe(false)
    expect((await contenu(bob, 'societe:31')).elements.some((e) => e.tableau === projet)).toBe(false)

    // Le raccourci jeté, le projet ne s'y montre plus ; il reste rangé chez Arnaud.
    const doc = lire(s31)
    const elements = doc.getMap<Carte & { corbeille?: number }>('elements')
    for (const [id, e] of elements) if (e.contenu.cible === projet) elements.set(id, { ...e, corbeille: 1 })
    m.base.enregistrerDocument(nomDuDocument(s31), Y.encodeStateAsUpdate(doc))
    indexerDocument(m.base, s31, doc)
    expect((await bibliotheque(ana)).find((e) => e.tableau === projet && e.element === null)).toMatchObject({ dans: s30 })
    expect((await bibliotheque(ana)).find((e) => e.tableau === projet && e.element === null)).not.toHaveProperty('raccourcis')
    expect((await contenu(ana, 'societe:31')).elements.some((e) => e.tableau === projet)).toBe(false)
  })
})
