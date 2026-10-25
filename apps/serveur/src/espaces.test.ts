import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { type Compte, type Monde, monde } from './essai.ts'
import { decouvrirOidc } from './sso.ts'

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

type EspaceLu = { id: string; nom: string; racine: string; personnel: boolean; role: string }
const json = async <T>(r: Response | Promise<Response>): Promise<T> => (await (await r).json()) as T
const espaces = (c: Compte) => json<EspaceLu[]>(m.appeler('/api/espaces', { compte: c }))
const auth = (chemin: string, compte: Compte, corps: unknown) => m.appeler(`/api/auth${chemin}`, { compte, json: corps })

/** Crée un espace d'équipe à `c` et y fait entrer `invite` avec ce rôle, par une invitation acceptée. */
async function espaceAvec(c: Compte, nom: string, invites: [Compte, string][] = []): Promise<EspaceLu> {
  const cree = await auth('/organization/create', c, { name: nom, slug: nom.toLowerCase().replace(/\W+/g, '-') })
  expect(cree.status).toBe(200)
  const { id } = await json<{ id: string }>(cree)
  for (const [invite, role] of invites) {
    const inv = await json<{ id: string }>(auth('/organization/invite-member', c, { email: invite.utilisateur.email, role, organizationId: id }))
    expect((await auth('/organization/accept-invitation', invite, { invitationId: inv.id })).status).toBe(200)
  }
  return (await espaces(c)).find((e) => e.id === id)!
}

const statutSur = async (c: Compte, tableau: string) => (await m.appeler(`/api/tableaux/${tableau}/acces`, { compte: c })).status

describe('espaces', () => {
  it('chaque compte a son espace personnel, dont son accueil est la racine', async () => {
    const liste = await espaces(ana)
    expect(liste).toEqual([{ id: expect.any(String), nom: 'Ana', racine: ana.utilisateur.racine, personnel: true, role: 'owner' }])
    expect(m.base.tableau(ana.utilisateur.racine)?.espace).toBe(liste[0]!.id)
  })

  it('un espace d’équipe naît avec son accueil, dont le créateur est propriétaire', async () => {
    const e = await espaceAvec(ana, 'Atelier')
    expect(e).toMatchObject({ nom: 'Atelier', personnel: false, role: 'owner' })
    expect(m.base.tableau(e.racine)).toMatchObject({ titre: 'Atelier', espace: e.id, proprietaire: ana.utilisateur.id })
    expect(await statutSur(ana, e.racine)).toBe(200)
    expect(await statutSur(bob, e.racine)).toBe(404)
  })

  it('un membre voit les tableaux de l’espace et peut y écrire ; un invité n’y voit que ce qu’on lui partage', async () => {
    const e = await espaceAvec(ana, 'Atelier', [
      [bob, 'member'],
      [cleo, 'guest'],
    ])
    m.tableau(ana, 'tableau-dans-atelier', 'Plans', undefined, e.racine)
    expect(m.base.tableau('tableau-dans-atelier')?.espace).toBe(e.id)

    expect(await statutSur(bob, 'tableau-dans-atelier')).toBe(200)
    // Membre : il écrit, mais il ne partage pas (réservé au propriétaire).
    const partage = await m.appeler('/api/tableaux/tableau-dans-atelier/partage', { compte: bob, json: { email: 'x@exemple.fr', role: 'lecture' } })
    expect(partage.status).toBe(403)

    expect(await statutSur(cleo, 'tableau-dans-atelier')).toBe(404)
    await m.appeler('/api/tableaux/tableau-dans-atelier/partage', { compte: ana, json: { email: cleo.utilisateur.email, role: 'lecture' } })
    expect(await statutSur(cleo, 'tableau-dans-atelier')).toBe(200)
  })

  it('un rôle composé par l’espace vaut ce que ses permissions donnent', async () => {
    const e = await espaceAvec(ana, 'Atelier')
    const role = await auth('/organization/create-role', ana, { organizationId: e.id, role: 'lecteur', permission: { tableau: ['lire'] } })
    expect(role.status).toBe(200)
    const inv = await json<{ id: string }>(auth('/organization/invite-member', ana, { email: bob.utilisateur.email, role: 'lecteur', organizationId: e.id }))
    await auth('/organization/accept-invitation', bob, { invitationId: inv.id })

    expect(await statutSur(bob, e.racine)).toBe(200)
    expect(await m.autorisation.roleSur(`user:${bob.utilisateur.id}`, e.racine)).toBe('lecture')
    // Un lecteur ne change pas le mot de passe du tableau : c'est au propriétaire.
    expect((await m.appeler(`/api/tableaux/${e.racine}/mot-de-passe`, { compte: bob, methode: 'PUT', json: { motDePasse: 'secret-123' } })).status).toBe(403)
  })

  it('retiré de l’espace, on n’en voit plus les tableaux', async () => {
    const e = await espaceAvec(ana, 'Atelier', [[bob, 'member']])
    expect(await statutSur(bob, e.racine)).toBe(200)
    expect((await auth('/organization/remove-member', ana, { memberIdOrEmail: bob.utilisateur.email, organizationId: e.id })).status).toBe(200)
    expect(await statutSur(bob, e.racine)).toBe(404)
  })

  it('un tableau sans parent va dans l’espace demandé si l’on peut y créer, sinon il est refusé', async () => {
    const e = await espaceAvec(ana, 'Atelier', [
      [bob, 'member'],
      [cleo, 'guest'],
    ])
    const creer = (c: Compte, id: string, espace?: string) => m.appeler('/api/tableaux', { compte: c, json: { id, titre: 'T', espace } })
    expect((await creer(bob, 'tableau-de-bob-1', e.id)).status).toBe(201)
    expect(m.base.tableau('tableau-de-bob-1')?.espace).toBe(e.id)
    expect((await creer(cleo, 'tableau-de-cleo-1', e.id)).status).toBe(403)
    // Sans espace demandé : l'espace personnel.
    expect((await creer(cleo, 'tableau-de-cleo-2')).status).toBe(201)
    expect(m.base.tableau('tableau-de-cleo-2')?.espace).toBe((await espaces(cleo))[0]!.id)
  })

  it('un espace personnel ne s’ouvre pas aux autres et ne se supprime pas', async () => {
    const [perso] = await espaces(ana)
    const invite = await auth('/organization/invite-member', ana, { email: bob.utilisateur.email, role: 'member', organizationId: perso!.id })
    expect(invite.status).toBe(403)
    expect((await auth('/organization/delete', ana, { organizationId: perso!.id })).status).toBe(403)
    expect(await espaces(ana)).toHaveLength(1)
  })

  it('le SSO ne se déclare que pour un espace d’équipe, et par son admin', async () => {
    const [perso] = await espaces(ana)
    const corps = (organizationId: string) => ({ providerId: 'acme', issuer: 'http://idp.interne', domain: 'acme.fr', organizationId, oidcConfig: { clientId: 'c', clientSecret: 's', skipDiscovery: true, authorizationEndpoint: 'https://idp.acme.fr/a', tokenEndpoint: 'https://idp.acme.fr/t', jwksEndpoint: 'https://idp.acme.fr/k' } })
    expect((await auth('/sso/register', ana, corps(perso!.id))).status).toBe(400)
    const e = await espaceAvec(ana, 'Acme', [[bob, 'member']])
    expect((await auth('/sso/register', bob, corps(e.id))).status).toBe(403)
    const r = await auth('/sso/register', ana, corps(e.id))
    expect(r.status).toBe(200)
    expect(await json(r)).toMatchObject({ providerId: 'acme', domain: 'acme.fr', organizationId: e.id })
  })
})

describe('découverte OIDC', () => {
  const doc = {
    issuer: 'http://keycloak.lan/realms/acme',
    authorization_endpoint: 'http://keycloak.lan/realms/acme/auth',
    token_endpoint: 'http://keycloak.lan/realms/acme/token',
    jwks_uri: 'http://keycloak.lan/realms/acme/certs',
  }
  const servir = (corps: unknown) => (async () => new Response(JSON.stringify(corps), { headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch

  it('lit les adresses d’un fournisseur interne déclaré', async () => {
    const a = await decouvrirOidc('http://keycloak.lan/realms/acme', ['http://keycloak.lan'], servir(doc))
    expect(a).toMatchObject({ authorizationEndpoint: doc.authorization_endpoint, jwksEndpoint: doc.jwks_uri })
  })

  it('refuse un émetteur en clair non déclaré, un document qui parle pour un autre, et le réseau local', async () => {
    await expect(decouvrirOidc('http://keycloak.lan/realms/acme', [], servir(doc))).rejects.toThrow(/https/)
    await expect(decouvrirOidc('http://keycloak.lan/realms/acme', ['http://keycloak.lan'], servir({ ...doc, issuer: 'http://autre' }))).rejects.toThrow(/émetteur/)
    await expect(decouvrirOidc('https://127.0.0.1/realms/acme', [])).rejects.toThrow(/interdit/)
  })
})
