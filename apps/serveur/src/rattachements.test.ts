import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { type Compte, type Monde, monde, poser, texte } from './essai.ts'
import { indexerDocument } from './indexation.ts'
import { type SourceRattachement, adresseDeLaFiche, sourcesDe } from './rattachements.ts'
import { nomDuDocument } from './synchro.ts'

const CRM: SourceRattachement = { source: 'crm', nom: 'Mon CRM', dossier: 'Clients', origine: 'https://crm.exemple.fr' }

describe('NOTAK_RATTACHEMENTS', () => {
  it('lit chaque outil déclaré, et signale puis laisse de côté une entrée illisible', () => {
    const dits: string[] = []
    const lues = sourcesDe(
      JSON.stringify([
        { source: 'crm', nom: 'Mon CRM', dossier: 'Clients', origine: 'https://crm.exemple.fr/', espace: 'e1' },
        { source: 'CRM', nom: 'x', dossier: 'y', origine: 'https://a.fr' },
        { source: 'projets', nom: 'Projets', dossier: 'Projets', origine: 'ftp://a.fr' },
        { source: 'crm', nom: 'Doublon', dossier: 'D', origine: 'https://b.fr' },
        { source: 'suivi', nom: 'Suivi', dossier: 'Suivis', origine: 'https://suivi.exemple.fr' },
      ]),
      (m) => void dits.push(m),
    )
    expect(lues).toEqual([
      { source: 'crm', nom: 'Mon CRM', dossier: 'Clients', origine: 'https://crm.exemple.fr', espace: 'e1' },
      { source: 'suivi', nom: 'Suivi', dossier: 'Suivis', origine: 'https://suivi.exemple.fr' },
    ])
    expect(dits).toHaveLength(3)
    expect(dits[0]).toContain('entrée 2')
  })

  it('une valeur absente, vide, ou qui n’est pas une liste JSON : aucun rattachement', () => {
    const dits: string[] = []
    expect(sourcesDe(undefined)).toEqual([])
    expect(sourcesDe('  ')).toEqual([])
    expect(sourcesDe('{', (m) => void dits.push(m))).toEqual([])
    expect(sourcesDe('{"source":"crm"}', (m) => void dits.push(m))).toEqual([])
    expect(dits).toHaveLength(2)
  })

  it('l’adresse d’une fiche doit être chez l’outil', () => {
    expect(adresseDeLaFiche('https://crm.exemple.fr/societes/42', CRM)).toBe('https://crm.exemple.fr/societes/42')
    expect(adresseDeLaFiche(undefined, CRM)).toBeUndefined()
    expect(adresseDeLaFiche('', CRM)).toBeUndefined()
    expect(adresseDeLaFiche('https://ailleurs.fr/societes/42', CRM)).toBeNull()
    expect(adresseDeLaFiche('https://crm.exemple.fr.ailleurs.fr/', CRM)).toBeNull()
    expect(adresseDeLaFiche('javascript:alert(1)', CRM)).toBeNull()
    expect(adresseDeLaFiche(42, CRM)).toBeNull()
  })
})

type Etat = { etat: 'present'; tableau: string; titre: string; source: string; dossier: string } | { etat: 'absent' | 'cache'; source: string; dossier: string }
type Entree = { tableau: string; element: string | null; titre: string; dans: string | null; fiche?: { nom: string; adresse?: string } }

describe('les dossiers des fiches d’un autre outil', () => {
  let m: Monde
  let ana: Compte
  let bob: Compte
  const lire = async (c: Compte, cle: string, source = 'crm') => {
    const r = await m.appeler(`/api/rattachements/${source}/${encodeURIComponent(cle)}`, { compte: c })
    return { statut: r.status, corps: (await r.json()) as Etat & { code?: string } }
  }
  const relier = async (c: Compte, cle: string, corps: Record<string, unknown> = {}, source = 'crm') => {
    const r = await m.appeler(`/api/rattachements/${source}/${encodeURIComponent(cle)}`, { compte: c, json: corps })
    return { statut: r.status, corps: (await r.json()) as Etat & { code?: string } }
  }
  const meta = (tableau: string) => {
    const doc = new Y.Doc()
    Y.applyUpdate(doc, m.base.document(nomDuDocument(tableau))!)
    return { titre: doc.getMap('meta').get('titre'), dossier: doc.getMap('meta').get('dossier'), elements: [...doc.getMap<{ contenu: { type: string; cible?: string } }>('elements').values()] }
  }
  const cartesVers = (dans: string, cible: string) => meta(dans).elements.filter((e) => e.contenu.type === 'tableau' && e.contenu.cible === cible)

  beforeAll(async () => {
    m = monde({ rattachements: [CRM] })
    ana = await m.compte('Ana')
    bob = await m.compte('Bob')
  })
  afterAll(() => m.fermer())

  it('sans session, une source inconnue, une fiche mal écrite : refusés', async () => {
    expect((await m.appeler('/api/rattachements/crm/societe:1')).status).toBe(401)
    expect(await lire(ana, 'societe:1', 'inconnue')).toMatchObject({ statut: 404, corps: { code: 'source_inconnue' } })
    expect(await lire(ana, 'société 1')).toMatchObject({ statut: 400, corps: { code: 'fiche_invalide' } })
    expect(await relier(ana, 'societe:1', { titre: 'Dupont', adresse: 'https://ailleurs.fr/42' })).toMatchObject({ statut: 400, corps: { code: 'adresse_refusee' } })
  })

  it('une fiche sans dossier : absent, et où il se rangerait', async () => {
    expect(await lire(ana, 'societe:1')).toEqual({ statut: 200, corps: { etat: 'absent', source: 'Mon CRM', dossier: 'Clients' } })
  })

  it('le crée dans le dossier de l’outil, lui-même posé dans l’accueil, et le retrouve ensuite', async () => {
    const r = await relier(ana, 'societe:1', { titre: '  Dupont SARL ', adresse: 'https://crm.exemple.fr/societes/1' })
    expect(r.statut).toBe(201)
    expect(r.corps).toMatchObject({ etat: 'present', titre: 'Dupont SARL', source: 'Mon CRM', dossier: 'Clients' })
    const dossier = (r.corps as { tableau: string }).tableau
    const clients = m.base.tableau(dossier)!.parent!
    expect(m.base.tableau(clients)).toMatchObject({ titre: 'Clients', parent: ana.utilisateur.racine })
    // Deux toiles qui se montrent en dossier, chacune rangée par sa carte.
    expect(meta(dossier)).toMatchObject({ titre: 'Dupont SARL', dossier: true })
    expect(meta(clients)).toMatchObject({ titre: 'Clients', dossier: true })
    expect(cartesVers(ana.utilisateur.racine, clients)).toHaveLength(1)
    expect(cartesVers(clients, dossier)).toHaveLength(1)

    expect(await lire(ana, 'societe:1')).toEqual({ statut: 200, corps: { etat: 'present', tableau: dossier, titre: 'Dupont SARL', source: 'Mon CRM', dossier: 'Clients' } })
    // Un second clic ne refait rien.
    expect(await relier(ana, 'societe:1', { titre: 'Autre' })).toMatchObject({ statut: 200, corps: { etat: 'present', tableau: dossier } })
    expect(cartesVers(clients, dossier)).toHaveLength(1)
  })

  it('une seconde fiche va dans le même dossier de l’outil ; deux clics au même moment n’en font qu’un', async () => {
    const [a, b] = await Promise.all([relier(ana, 'societe:2', { titre: 'Martin' }), relier(ana, 'societe:2', { titre: 'Martin' })])
    expect([a.statut, b.statut].sort()).toEqual([200, 201])
    const dossier = (a.corps as { tableau: string }).tableau
    expect((b.corps as { tableau: string }).tableau).toBe(dossier)
    const premier = (await lire(ana, 'societe:1')).corps as { tableau: string }
    expect(m.base.tableau(dossier)!.parent).toBe(m.base.tableau(premier.tableau)!.parent)
    // Sans adresse donnée, le titre : la clé de la fiche à défaut.
    expect((await relier(ana, 'societe:3')).corps).toMatchObject({ etat: 'present', titre: 'societe:3' })
  })

  it('la bibliothèque mène du dossier à sa fiche, tant que l’outil est déclaré', async () => {
    const r = await m.appeler('/api/bibliotheque', { compte: ana })
    const entrees = (await r.json()) as Entree[]
    const dupont = entrees.find((e) => e.titre === 'Dupont SARL' && e.element === null)
    expect(dupont?.fiche).toEqual({ nom: 'Mon CRM', adresse: 'https://crm.exemple.fr/societes/1' })
    expect(entrees.find((e) => e.titre === 'Martin')?.fiche).toEqual({ nom: 'Mon CRM' })
    expect(entrees.find((e) => e.titre === 'Clients')?.fiche).toBeUndefined()
    expect(dupont?.dans).toBe(entrees.find((e) => e.titre === 'Clients')?.tableau)
  })

  it('la création n’accepte que du JSON : un formulaire d’un autre site ne la déclenche pas', async () => {
    const r = await m.appeler('/api/rattachements/crm/societe:9', { compte: ana, methode: 'POST', corps: new TextEncoder().encode('{"titre":"X"}'), type: 'text/plain' })
    expect(r.status).toBe(415)
    expect((await lire(ana, 'societe:9')).corps).toMatchObject({ etat: 'absent' })
  })

  it('le contenu d’un dossier : ce qu’il range, du plus récemment changé au plus ancien, avec son chemin', async () => {
    const dupont = ((await lire(ana, 'societe:1')).corps as { tableau: string }).tableau
    // Une toile rangée dans le dossier par sa carte, et une page posée sur lui.
    m.tableau(ana, 'devis', 'Devis 2027', undefined, dupont)
    const doc = new Y.Doc()
    Y.applyUpdate(doc, m.base.document(nomDuDocument(dupont))!)
    poser(doc, { type: 'tableau', cible: 'devis' }, { id: 'carte-devis' })
    poser(doc, { type: 'document', titre: 'Compte rendu', texte: texte('Rendez-vous du 5') }, { id: 'cr' })
    m.base.enregistrerDocument(nomDuDocument(dupont), Y.encodeStateAsUpdate(doc))
    indexerDocument(m.base, dupont, doc)
    const devis = new Y.Doc()
    devis.getMap('meta').set('titre', 'Devis 2027')
    indexerDocument(m.base, 'devis', devis)
    m.base.noterActivite({ tableau: 'devis', auteur: ana.utilisateur.id, genre: 'modifie', element: 'n1', typeElement: 'note', libelle: '', instant: 5000 }, 0)

    const r = await m.appeler(`/api/rattachements/crm/societe:1/contenu`, { compte: ana })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({
      etat: 'present',
      tableau: dupont,
      titre: 'Dupont SARL',
      source: 'Mon CRM',
      dossier: 'Clients',
      chemin: `/?dossier=${dupont}`,
      elements: [
        { tableau: 'devis', element: null, genre: 'toile', titre: 'Devis 2027', modifie: 5000, chemin: '/t/devis' },
        { tableau: dupont, element: 'cr', genre: 'document', titre: 'Compte rendu', modifie: null, chemin: `/?dossier=${dupont}&element=cr` },
      ],
    })
    // Une fiche sans dossier : son état, sans contenu.
    expect(await (await m.appeler('/api/rattachements/crm/societe:99/contenu', { compte: ana })).json()).toEqual({ etat: 'absent', source: 'Mon CRM', dossier: 'Clients' })
  })

  it('seules les pages de l’outil lisent un dossier depuis leur site, avec la session, et sans rien pouvoir y écrire', async () => {
    const depuis = (origine: string, chemin = '/api/rattachements/crm/societe:1/contenu', methode = 'GET') =>
      m.appelerBrut(chemin, { method: methode, headers: { cookie: ana.cookie, origin: origine } })
    const outil = await depuis('https://crm.exemple.fr')
    expect(outil.status).toBe(200)
    expect(outil.headers.get('access-control-allow-origin')).toBe('https://crm.exemple.fr')
    expect(outil.headers.get('access-control-allow-credentials')).toBe('true')
    expect(outil.headers.get('vary')).toContain('Origin')
    expect((await depuis('https://crm.exemple.fr', '/api/rattachements/crm/societe:1')).headers.get('access-control-allow-origin')).toBe('https://crm.exemple.fr')
    // Une autre origine : la réponse part, mais son navigateur ne la lui laisse pas lire.
    expect((await depuis('https://ailleurs.fr')).headers.get('access-control-allow-origin')).toBeNull()
    // La demande préalable : seulement lire.
    const avant = await depuis('https://crm.exemple.fr', '/api/rattachements/crm/societe:1/contenu', 'OPTIONS')
    expect(avant.status).toBe(204)
    expect(avant.headers.get('access-control-allow-methods')).toBe('GET')
    // Sans session, l'outil lit qu'il faut se connecter.
    const anonyme = await m.appelerBrut('/api/rattachements/crm/societe:1/contenu', { headers: { origin: 'https://crm.exemple.fr' } })
    expect(anonyme.status).toBe(401)
    expect(anonyme.headers.get('access-control-allow-origin')).toBe('https://crm.exemple.fr')
    // La création, elle, ne s'ouvre pas à l'outil.
    const creation = await m.appelerBrut('/api/rattachements/crm/societe:1', { method: 'POST', headers: { cookie: ana.cookie, origin: 'https://crm.exemple.fr', 'content-type': 'application/json' }, body: '{}' })
    expect(creation.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('chacun a ses dossiers, dans son espace personnel, quand l’outil ne nomme pas d’espace', async () => {
    expect((await lire(bob, 'societe:1')).corps).toMatchObject({ etat: 'absent' })
    const r = await relier(bob, 'societe:1', { titre: 'Dupont SARL' })
    expect(r.statut).toBe(201)
    const deBob = (r.corps as { tableau: string }).tableau
    expect(deBob).not.toBe(((await lire(ana, 'societe:1')).corps as { tableau: string }).tableau)
    expect(m.base.tableau(m.base.tableau(deBob)!.parent!)!.parent).toBe(bob.utilisateur.racine)
  })

  it('un dossier jeté à la corbeille y reste : on ne le refait pas, on le remet', async () => {
    const premier = ((await lire(ana, 'societe:3')).corps as { tableau: string }).tableau
    const clients = m.base.tableau(premier)!.parent!
    // La carte du dossier, jetée dans le dossier de l'outil, comme le fait la bibliothèque.
    const doc = new Y.Doc()
    Y.applyUpdate(doc, m.base.document(nomDuDocument(clients))!)
    const elements = doc.getMap<Record<string, unknown>>('elements')
    for (const [id, e] of elements) if ((e.contenu as { cible?: string }).cible === premier) elements.set(id, { ...e, corbeille: 1 })
    m.base.enregistrerDocument(nomDuDocument(clients), Y.encodeStateAsUpdate(doc))
    indexerDocument(m.base, clients, doc)

    expect((await lire(ana, 'societe:3')).corps).toMatchObject({ etat: 'corbeille', tableau: premier })
    // Ni la page, ni un second clic n'en font un autre.
    expect(await relier(ana, 'societe:3', { titre: 'Nouveau' })).toMatchObject({ statut: 200, corps: { etat: 'corbeille', tableau: premier } })
    const bibliotheque = (await (await m.appeler('/api/bibliotheque', { compte: ana })).json()) as Entree[]
    expect(bibliotheque.some((e) => e.tableau === premier)).toBe(false)
    // « Le remettre » : la carte sort de la corbeille, le dossier revient.
    const r = await m.appeler(`/api/rattachements/crm/societe:3/remettre`, { compte: ana, json: {} })
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ etat: 'present', tableau: premier })
    expect(cartesVers(clients, premier)).toHaveLength(1)
    expect(meta(clients).elements.find((e) => e.contenu.cible === premier)).not.toHaveProperty('corbeille')
  })
})

describe('les dossiers d’un outil rangés dans un espace donné', () => {
  let m: Monde
  let ana: Compte
  let bob: Compte

  beforeAll(async () => {
    // L'espace se nomme dans l'environnement ; celui d'Ana ne se connaît qu'une fois elle inscrite : la liste se
    // remplit après coup, et le serveur la relit à chaque demande.
    const sources: SourceRattachement[] = []
    m = monde({ rattachements: sources })
    ana = await m.compte('Ana')
    bob = await m.compte('Bob')
    sources.push({ ...CRM, espace: m.base.espacePersonnel(ana.utilisateur.id)! })
  })
  afterAll(() => m.fermer())

  const appeler = async (c: Compte, cle: string, json?: unknown) => {
    const r = await m.appeler(`/api/rattachements/crm/${cle}`, { compte: c, ...(json ? { json } : {}) })
    return { statut: r.status, corps: (await r.json()) as Etat & { code?: string } }
  }

  it('un dossier qu’on ne voit pas : caché, et il ne s’en crée pas un second', async () => {
    expect((await appeler(ana, 'societe:1', { titre: 'Dupont' })).statut).toBe(201)
    expect((await appeler(bob, 'societe:1')).corps).toEqual({ etat: 'cache', source: 'Mon CRM', dossier: 'Clients' })
    expect(await appeler(bob, 'societe:1', { titre: 'Dupont' })).toEqual({ statut: 200, corps: { etat: 'cache', source: 'Mon CRM', dossier: 'Clients' } })
    // Une autre fiche : il ne peut pas écrire dans l'espace, ni dans le dossier de l'outil qu'il ne voit pas.
    expect(await appeler(bob, 'societe:2', { titre: 'Martin' })).toMatchObject({ statut: 403, corps: { code: 'interdit' } })
  })

  it('partagé avec lui, il le voit et y crée les suivants', async () => {
    const dossier = ((await appeler(ana, 'societe:1')).corps as { tableau: string }).tableau
    const clients = m.base.tableau(dossier)!.parent!
    // L'accueil d'Ana en édition : comme un membre d'un espace d'équipe.
    m.base.definirAcces({ tableau: ana.utilisateur.racine, utilisateur: bob.utilisateur.id, role: 'edition' })
    await m.autorisation.vider()
    expect((await appeler(bob, 'societe:1')).corps).toMatchObject({ etat: 'present', tableau: dossier })
    const r = await appeler(bob, 'societe:2', { titre: 'Martin' })
    expect(r.statut).toBe(201)
    expect(m.base.tableau((r.corps as { tableau: string }).tableau)!.parent).toBe(clients)
  })
})
