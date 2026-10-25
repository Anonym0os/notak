import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import * as Y from 'yjs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ouvrirAutorisation } from './autorisation.ts'
import { ouvrirBase } from './base.ts'
import { indexerDocument } from './indexation.ts'
import { type Compte, type Monde, autorisationEssai, monde, openfgaEssai, poser } from './essai.ts'
import { MIGRATIONS, migrer } from './migrations.ts'
import { creerHocuspocus, nomDuDocument } from './synchro.ts'

let m: Monde
let ana: Compte
let bob: Compte
let cleo: Compte

beforeEach(async () => {
  m = monde()
  ana = await m.compte('Ana')
  bob = await m.compte('Bob')
  cleo = await m.compte('Cléo')
})
afterEach(() => m.fermer())

const json = async <T>(r: Response | Promise<Response>): Promise<T> => (await (await r).json()) as T
const statut = async (c: Compte, chemin: string) => (await m.appeler(chemin, { compte: c })).status
const role = (c: Compte, tableau: string) => m.autorisation.roleSur(`user:${c.utilisateur.id}`, tableau)
const partager = (c: Compte, tableau: string, corps: Record<string, unknown>) => m.appeler(`/api/tableaux/${tableau}/partage`, { compte: c, json: corps })

describe('le modèle', () => {
  it('passe ses essais dans la CLI d’OpenFGA', () => {
    const dossier = join(dirname(fileURLToPath(import.meta.url)), '..', 'autorisation')
    // La CLI écrit son bilan sur la sortie d'erreur, et sort en erreur au premier essai raté.
    const r = spawnSync('docker', ['run', '--rm', '-v', `${dossier}:/m`, 'openfga/cli:v0.8.1', 'model', 'test', '--tests', '/m/modele.fga.yaml'], { encoding: 'utf8' })
    expect(r.status, r.stderr).toBe(0)
    expect(r.stderr).toMatch(/Tests (\d+)\/\1 passing/)
  }, 60_000)
})

describe('les droits par OpenFGA', () => {
  it('le rôle commentaire : il lit, il ne modifie pas, et la synchro le tient en lecture seule', async () => {
    m.tableau(ana, 'tableau-comm-1', 'Revue')
    expect((await partager(ana, 'tableau-comm-1', { email: bob.utilisateur.email, role: 'commentaire' })).status).toBe(200)
    expect(await role(bob, 'tableau-comm-1')).toBe('commentaire')
    expect(await statut(bob, '/api/tableaux/tableau-comm-1/acces')).toBe(200)

    const hp = creerHocuspocus(m.base, m.auth, m.autorisation)
    const config = { readOnly: false }
    await hp.configuration.onAuthenticate!({ documentName: nomDuDocument('tableau-comm-1'), requestHeaders: new Headers({ cookie: bob.cookie }), connectionConfig: config } as never)
    expect(config.readOnly).toBe(true)
  })

  it('un tableau partagé à une équipe vaut pour ses membres, et plus pour qui en sort', async () => {
    const { id: espace } = await json<{ id: string }>(m.appeler('/api/auth/organization/create', { compte: ana, json: { name: 'Studio', slug: 'studio' } }))
    for (const c of [bob, cleo]) {
      const inv = await json<{ id: string }>(m.appeler('/api/auth/organization/invite-member', { compte: ana, json: { email: c.utilisateur.email, role: 'guest', organizationId: espace } }))
      await m.appeler('/api/auth/organization/accept-invitation', { compte: c, json: { invitationId: inv.id } })
    }
    const equipe = await json<{ id: string }>(m.appeler('/api/auth/organization/create-team', { compte: ana, json: { name: 'Graphisme', organizationId: espace } }))
    await m.appeler('/api/auth/organization/add-team-member', { compte: ana, json: { teamId: equipe.id, userId: bob.utilisateur.id } })

    m.tableau(ana, 'tableau-equipe-1', 'Affiches')
    expect((await partager(ana, 'tableau-equipe-1', { equipe: equipe.id, role: 'edition' })).status).toBe(200)
    expect(await role(bob, 'tableau-equipe-1')).toBe('edition')
    expect(await role(cleo, 'tableau-equipe-1')).toBeNull()
    const acces = await json<{ equipe?: string; role: string }[]>(m.appeler('/api/tableaux/tableau-equipe-1/acces', { compte: ana }))
    expect(acces).toContainEqual(expect.objectContaining({ equipe: equipe.id, nom: 'Graphisme', role: 'edition' }))

    await m.appeler('/api/auth/organization/remove-team-member', { compte: ana, json: { teamId: equipe.id, userId: bob.utilisateur.id } })
    expect(await role(bob, 'tableau-equipe-1')).toBeNull()

    // Une équipe supprimée n'est plus nommée nulle part.
    await m.appeler('/api/auth/organization/remove-team', { compte: ana, json: { teamId: equipe.id, organizationId: espace } })
    expect(await role(ana, 'tableau-equipe-1')).toBe('proprietaire')
    expect(m.base.relationsSur('tableau:tableau-equipe-1').some((r) => r.sujet.startsWith('equipe:'))).toBe(false)
  })

  it('un blocage pour tous tient sous le tableau, se lève plus bas, et n’arrête pas le propriétaire', async () => {
    m.tableau(ana, 'tableau-haut-01', 'Haut')
    m.tableau(ana, 'tableau-bas-001', 'Bas', undefined, 'tableau-haut-01')
    await partager(ana, 'tableau-haut-01', { email: bob.utilisateur.email, role: 'edition' })
    expect(await role(bob, 'tableau-bas-001')).toBe('edition')

    const bloquer = (tableau: string, corps: Record<string, unknown>) => m.appeler(`/api/tableaux/${tableau}/blocage`, { compte: ana, json: corps })
    expect((await bloquer('tableau-haut-01', { tous: true, etat: 'bloque' })).status).toBe(200)
    expect(await role(bob, 'tableau-haut-01')).toBeNull()
    expect(await role(bob, 'tableau-bas-001')).toBeNull()
    expect(await role(ana, 'tableau-bas-001')).toBe('proprietaire')

    await bloquer('tableau-bas-001', { email: bob.utilisateur.email, etat: 'debloque' })
    expect(await role(bob, 'tableau-bas-001')).toBe('edition')
    expect(await role(bob, 'tableau-haut-01')).toBeNull()
    expect(await json(m.appeler('/api/tableaux/tableau-bas-001/blocage', { compte: ana }))).toEqual([{ email: bob.utilisateur.email, nom: 'Bob', etat: 'debloque' }])
    // Un éditeur ne bloque personne.
    expect((await m.appeler('/api/tableaux/tableau-bas-001/blocage', { compte: bob, json: { tous: true, etat: 'bloque' } })).status).toBe(403)
  })

  it('un fichier ne se lit que par qui peut lire un tableau qui le montre', async () => {
    const depot = await json<{ id: string }>(m.appeler('/api/fichiers', { compte: ana, corps: new Uint8Array([1, 2, 3]), type: 'image/png' }))
    expect(await statut(ana, `/api/fichiers/${depot.id}`)).toBe(200)
    expect(await statut(bob, `/api/fichiers/${depot.id}`)).toBe(404)

    m.tableau(ana, 'tableau-fichier', 'Photos', (doc) => void poser(doc, { type: 'image', fichier: depot.id }))
    const doc = new Y.Doc()
    Y.applyUpdate(doc, m.base.document(nomDuDocument('tableau-fichier'))!)
    indexerDocument(m.base, 'tableau-fichier', doc)
    expect(await statut(bob, `/api/fichiers/${depot.id}`)).toBe(404)
    await partager(ana, 'tableau-fichier', { email: bob.utilisateur.email, role: 'lecture' })
    expect(await statut(bob, `/api/fichiers/${depot.id}`)).toBe(200)
  })

  it('le lien public prend un niveau ; en édition, il synchronise sans compte, et un blocage pour tous l’arrête', async () => {
    m.tableau(ana, 'tableau-lien-01', 'Ouvert')
    const { jeton } = await json<{ jeton: string }>(m.appeler('/api/tableaux/tableau-lien-01/lien', { compte: ana, json: {} }))
    expect(await m.autorisation.roleSur(`lien:${jeton}`, 'tableau-lien-01')).toBe('lecture')
    expect((await m.appeler('/api/tableaux/tableau-lien-01/lien/niveau', { compte: ana, methode: 'PUT', json: { niveau: 'edition' } })).status).toBe(200)
    expect(await m.autorisation.roleSur(`lien:${jeton}`, 'tableau-lien-01')).toBe('edition')

    const hp = creerHocuspocus(m.base, m.auth, m.autorisation)
    const demander = (token: string) => {
      const config = { readOnly: false }
      return hp.configuration.onAuthenticate!({ documentName: nomDuDocument('tableau-lien-01'), requestHeaders: new Headers(), connectionConfig: config, token } as never).then(() => config)
    }
    expect(await demander(`lien:${jeton}`)).toEqual({ readOnly: false })
    await expect(demander('lien:faux-jeton-de-lien')).rejects.toThrow('refusé')

    await m.appeler('/api/tableaux/tableau-lien-01/blocage', { compte: ana, json: { tous: true, etat: 'bloque' } })
    await expect(demander(`lien:${jeton}`)).rejects.toThrow('refusé')
    expect((await m.appeler(`/api/public/${jeton}`)).status).toBe(404)
  })

  it('la recherche trouve ce que l’espace donne à lire, sans partage direct', async () => {
    const { id: espace } = await json<{ id: string }>(m.appeler('/api/auth/organization/create', { compte: ana, json: { name: 'Lab', slug: 'lab' } }))
    const inv = await json<{ id: string }>(m.appeler('/api/auth/organization/invite-member', { compte: ana, json: { email: bob.utilisateur.email, role: 'member', organizationId: espace } }))
    await m.appeler('/api/auth/organization/accept-invitation', { compte: bob, json: { invitationId: inv.id } })
    const racine = m.base.espace(espace)!.racine
    m.tableau(ana, 'tableau-du-lab', 'Protocoles', undefined, racine)
    m.base.indexer('tableau-du-lab', [{ element: '', texte: 'Protocoles de centrifugation' }])
    const trouves = await json<{ tableau: string }[]>(m.appeler('/api/recherche?q=centrifugation', { compte: bob }))
    expect(trouves.map((t) => t.tableau)).toEqual(['tableau-du-lab'])
    expect(await json(m.appeler('/api/recherche?q=centrifugation', { compte: cleo }))).toEqual([])
  })
})

describe('la copie tenue par OpenFGA', () => {
  it('un magasin disparu est recréé et rempli depuis la base, sans rien perdre', async () => {
    m.tableau(ana, 'tableau-garde-1', 'Gardé')
    await partager(ana, 'tableau-garde-1', { email: bob.utilisateur.email, role: 'edition' })
    m.base.definirReglage('openfga.magasin', '01HZZZZZZZZZZZZZZZZZZZZZZZ')
    const neuve = ouvrirAutorisation({ base: m.base, url: openfgaEssai(), journal: () => {} })
    expect(await neuve.roleSur(`user:${bob.utilisateur.id}`, 'tableau-garde-1')).toBe('edition')
    expect(m.base.reglage('openfga.magasin')).not.toBe('01HZZZZZZZZZZZZZZZZZZZZZZZ')
  })

  it('ce qui n’a pas pu partir reste dans la boîte, et part dès qu’OpenFGA répond', async () => {
    const base = ouvrirBase(':memory:')
    const bonne = autorisationEssai(base)
    await bonne.vider()
    base.ajouterRelation({ objet: 'tableau:t-hors-ligne', relation: 'lecteur', sujet: 'user:u1' })
    const injoignable = ouvrirAutorisation({ base, url: 'http://127.0.0.1:1', journal: () => {} })
    await expect(injoignable.vider()).rejects.toThrow()
    expect(base.boiteEnvoi(10)).toHaveLength(1)
    expect(await bonne.verifier('user:u1', 'peut_lire', 'tableau:t-hors-ligne')).toBe(true)
    expect(base.boiteEnvoi(10)).toHaveLength(0)
    base.fermer()
  })
})

describe('la reprise des droits d’avant (migration 4)', () => {
  it('les partages, les héritages et les liens d’une base d’avant valent pareil évalués par OpenFGA', async () => {
    const maintenant = new Date().toISOString()
    const chemin = join(m.dossier, 'avant.db')
    // Une base arrêtée à la migration 3, avec ses partages dans `acces` ; elle s'ouvre ensuite par le chemin normal.
    const disque = new DatabaseSync(chemin)
    migrer(disque, undefined, MIGRATIONS.slice(0, 3))
    for (const u of ['ana', 'bob', 'cleo']) {
      disque.prepare('INSERT INTO utilisateurs (id,email,nom,couleur,racine,email_verifie,cree,modifie) VALUES (?,?,?,?,?,1,?,?)').run(u, `${u}@exemple.fr`, u, '#000000', `racine-${u}`, maintenant, maintenant)
      disque.prepare('INSERT INTO tableaux (id,titre,proprietaire,parent) VALUES (?,?,?,NULL)').run(`racine-${u}`, u, u)
    }
    disque.prepare("INSERT INTO tableaux (id,titre,proprietaire,parent) VALUES ('projet','Projet','ana',NULL), ('detail','Détail','ana','projet'), ('a-part','À part','ana',NULL)").run()
    disque.prepare(`INSERT INTO acces (tableau,utilisateur,role) VALUES ('racine-ana','ana','proprietaire'),('racine-bob','bob','proprietaire'),('racine-cleo','cleo','proprietaire'),
      ('projet','ana','proprietaire'),('detail','ana','proprietaire'),('a-part','ana','proprietaire'),('projet','bob','edition'),('detail','cleo','lecture')`).run()
    disque.prepare("INSERT INTO liens_publics (tableau,jeton,cree) VALUES ('a-part','jeton-d-avant-0001',0)").run()
    disque.close()

    const migree = ouvrirBase(chemin)
    const autorisation = autorisationEssai(migree)
    const attendu: [string, string, string | null][] = [
      ['user:ana', 'projet', 'proprietaire'],
      ['user:ana', 'detail', 'proprietaire'],
      ['user:bob', 'projet', 'edition'],
      ['user:bob', 'detail', 'edition'],
      ['user:bob', 'a-part', null],
      ['user:cleo', 'projet', null],
      ['user:cleo', 'detail', 'lecture'],
      ['user:cleo', 'racine-ana', null],
      ['lien:jeton-d-avant-0001', 'a-part', 'lecture'],
      ['lien:jeton-d-avant-0001', 'projet', null],
    ]
    for (const [sujet, tableau, r] of attendu) expect([sujet, tableau, await autorisation.roleSur(sujet, tableau)]).toEqual([sujet, tableau, r])
    migree.fermer()
  })
})
