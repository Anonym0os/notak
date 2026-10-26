import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Hono } from 'hono'
import { creerApp } from './app.ts'
import { type Base, ouvrirBase } from './base.ts'
import { creerLimiteur } from './debit.ts'
import { creerDemandes, normaliserCode } from './demandesBureau.ts'
import { type Compte, ORIGINE_ESSAI, authEssai, autorisationEssai, inscrireEssai } from './essai.ts'

// L'app de bureau se connecte par un code (RFC 8628, plugin `deviceAuthorization` de Better Auth) : elle le demande,
// la personne le confirme dans son navigateur, l'app reçoit sa session. La page du serveur, dans la fenêtre de l'app,
// la reçoit aussi en cookie, mais seulement pour une demande en JSON venue d'une page de Notak.

const CLIENT = 'notak-bureau'

describe('la connexion de l’app de bureau par un code', () => {
  let base: Base
  let dossier: string
  let app: Hono
  let ana: Compte
  let bob: Compte
  // Chaque scénario vient de sa machine : les limites par adresse ne se mêlent pas d'un essai à l'autre.
  let machine = 0
  const nouvelleMachine = () => `198.51.100.${++machine}`

  const appeler = (chemin: string, o: { methode?: string; ip?: string; cookie?: string; origine?: string | null; type?: string; corps?: string } = {}) => {
    const entetes: Record<string, string> = {}
    if (o.cookie) entetes.cookie = o.cookie
    if (o.origine !== null) entetes.origin = o.origine ?? ORIGINE_ESSAI
    if (o.type) entetes['content-type'] = o.type
    return app.request(chemin, { method: o.methode ?? (o.corps === undefined ? 'GET' : 'POST'), headers: entetes, body: o.corps }, { incoming: { socket: { remoteAddress: o.ip ?? '127.0.0.1' } } })
  }
  const enJson = (chemin: string, corps: object, o: Parameters<typeof appeler>[1] = {}) => appeler(chemin, { type: 'application/json', corps: JSON.stringify(corps), ...o })

  type Code = { device_code: string; user_code: string; verification_uri: string; verification_uri_complete: string; expires_in: number; interval: number }
  /** L'app demande un code, depuis `ip`. Sans cookie ni origine : c'est la coque, ou la page avant toute connexion. */
  const demanderCode = async (ip: string): Promise<Code> => {
    const r = await enJson('/api/auth/device/code', { client_id: CLIENT }, { ip, origine: null })
    expect(r.status).toBe(200)
    return (await r.json()) as Code
  }
  /** La personne ouvre la page du code dans son navigateur (ce qui le prend en main), puis l'accepte. */
  const confirmer = async (code: string, qui: Compte, ip: string) => {
    expect((await appeler(`/api/auth/device?user_code=${code}`, { cookie: qui.cookie, ip })).status).toBe(200)
    const r = await enJson('/api/auth/device/approve', { userCode: code }, { cookie: qui.cookie, ip })
    expect(r.status).toBe(200)
  }
  const jeton = (deviceCode: string, o: Parameters<typeof appeler>[1] = {}) =>
    enJson('/api/auth/device/token', { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: deviceCode, client_id: CLIENT }, o)
  const cookieDe = (r: Response) => (r.headers.get('set-cookie') ?? '').split(';')[0]!

  beforeAll(async () => {
    base = ouvrirBase(':memory:')
    dossier = mkdtempSync(join(tmpdir(), 'notak-bureau-'))
    const auth = authEssai(base)
    ana = await inscrireEssai(auth, base, 'Ana')
    bob = await inscrireEssai(auth, base, 'Bob')
    app = creerApp({
      base,
      auth,
      autorisation: autorisationEssai(base),
      moyens: { fournisseurs: [], courriel: false },
      dossierFichiers: join(dossier, 'fichiers'),
      // Les limites du vrai serveur (`serveur.ts`).
      limiteur: creerLimiteur(10, 60_000),
      limiteurJeton: creerLimiteur(60, 60_000),
      maintenant: Date.now,
      synchro: () => null,
      relaisFiable: false,
      cookieSecurise: false,
    })
  })
  afterAll(() => {
    base.fermer()
    rmSync(dossier, { recursive: true, force: true })
  })

  it('du code à la session : la page de Notak, dans la fenêtre de l’app, reçoit son cookie', async () => {
    const ip = nouvelleMachine()
    const code = await demanderCode(ip)
    expect(code.verification_uri).toBe(`${ORIGINE_ESSAI}/bureau/autoriser`)
    expect(code.verification_uri_complete).toBe(`${ORIGINE_ESSAI}/bureau/autoriser?user_code=${code.user_code}`)
    expect(code).toMatchObject({ expires_in: 600, interval: 5 })
    expect(code.user_code).toMatch(/^[A-Z2-9]{8}$/)

    await confirmer(code.user_code, ana, nouvelleMachine())
    const r = await jeton(code.device_code, { ip })
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    expect(((await r.json()) as { access_token: string }).access_token).toBeTruthy()
    expect(r.headers.get('set-cookie')).toMatch(/^notak\.session_token=.*HttpOnly.*SameSite=Lax/i)
    const moi = await appeler('/api/moi', { cookie: cookieDe(r) })
    expect(moi.status).toBe(200)
    expect(await moi.json()).toMatchObject({ id: ana.utilisateur.id, email: 'ana@exemple.fr' })

    // Le code ne sert qu'une fois.
    expect((await jeton(code.device_code, { ip })).status).toBe(400)
  })

  it('pas de cookie pour une demande d’ailleurs : sans origine, d’une autre origine, ou pas en JSON', async () => {
    for (const o of [{ origine: null }, { origine: 'https://attaquant.exemple' }, { origine: 'null' }] as const) {
      const ip = nouvelleMachine()
      const code = await demanderCode(ip)
      await confirmer(code.user_code, ana, nouvelleMachine())
      const r = await jeton(code.device_code, { ip, ...o })
      // Better Auth rend le jeton (la coque, elle, n'a pas d'origine) ; aucune page n'en reçoit de cookie.
      expect(r.status).toBe(200)
      expect(r.headers.get('set-cookie')).toBeNull()
    }

    // Un formulaire d'un autre site (le seul envoi qu'il puisse faire sans demander la permission) est refusé avant tout,
    // y compris sous l'origine de Notak : le code reste intact, et sert ensuite à la vraie page.
    const ip = nouvelleMachine()
    const code = await demanderCode(ip)
    await confirmer(code.user_code, ana, nouvelleMachine())
    const champs = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: code.device_code, client_id: CLIENT }).toString()
    for (const type of ['application/x-www-form-urlencoded', 'text/plain', 'multipart/form-data; boundary=x']) {
      const r = await appeler('/api/auth/device/token', { ip, type, corps: champs })
      expect(r.status).toBe(415)
      expect(r.headers.get('set-cookie')).toBeNull()
    }
    const bon = await jeton(code.device_code, { ip, type: 'application/json; charset=utf-8' })
    expect(bon.status).toBe(200)
    expect(bon.headers.get('set-cookie')).toMatch(/^notak\.session_token=/)
  })

  it('avant l’accord, l’app attend ; refusé, elle ne reçoit rien', async () => {
    const ip = nouvelleMachine()
    const code = await demanderCode(ip)
    const attente = await jeton(code.device_code, { ip })
    expect(attente.status).toBe(400)
    expect(await attente.json()).toMatchObject({ error: 'authorization_pending' })
    expect(attente.headers.get('set-cookie')).toBeNull()

    const autre = await demanderCode(ip)
    const navigateur = nouvelleMachine()
    expect((await appeler(`/api/auth/device?user_code=${autre.user_code}`, { cookie: bob.cookie, ip: navigateur })).status).toBe(200)
    expect((await enJson('/api/auth/device/deny', { userCode: autre.user_code }, { cookie: bob.cookie, ip: navigateur })).status).toBe(200)
    const refuse = await jeton(autre.device_code, { ip })
    expect(await refuse.json()).toMatchObject({ error: 'access_denied' })
    expect(refuse.headers.get('set-cookie')).toBeNull()
  })

  it('un code pris en main par un compte ne s’accepte pas depuis un autre', async () => {
    const code = await demanderCode(nouvelleMachine())
    const navigateur = nouvelleMachine()
    expect((await appeler(`/api/auth/device?user_code=${code.user_code}`, { cookie: ana.cookie, ip: navigateur })).status).toBe(200)
    const r = await enJson('/api/auth/device/approve', { userCode: code.user_code }, { cookie: bob.cookie, ip: navigateur })
    expect(r.status).toBe(403)
    // Et l'accord d'un autre site, avec le cookie d'Ana, est refusé par le contrôle d'origine.
    const ailleurs = await enJson('/api/auth/device/approve', { userCode: code.user_code }, { cookie: ana.cookie, ip: navigateur, origine: 'https://attaquant.exemple' })
    expect(ailleurs.status).toBe(403)
  })

  it('seule l’app de bureau demande un code, en JSON, sans nommer d’avance le compte', async () => {
    const ip = nouvelleMachine()
    const mauvais = await enJson('/api/auth/device/code', { client_id: 'autre-app' }, { ip })
    expect(mauvais.status).toBe(400)
    expect(await mauvais.json()).toMatchObject({ error: 'invalid_client' })
    expect((await appeler('/api/auth/device/code', { ip, type: 'application/x-www-form-urlencoded', corps: `client_id=${CLIENT}` })).status).toBe(415)
    const codes = () => (base.db.prepare('SELECT count(*) AS n FROM deviceCode').get() as { n: number }).n
    const avant = codes()
    expect((await enJson('/api/auth/device/code', { client_id: CLIENT, user_id: ana.utilisateur.id }, { ip })).status).toBe(400)
    expect(codes()).toBe(avant)

    // Ni un jeton pour un autre client.
    const code = await demanderCode(ip)
    await confirmer(code.user_code, ana, nouvelleMachine())
    const r = await enJson('/api/auth/device/token', { grant_type: 'urn:ietf:params:oauth:grant-type:device_code', device_code: code.device_code, client_id: 'autre-app' }, { ip })
    expect(r.status).toBe(400)
    expect(r.headers.get('set-cookie')).toBeNull()
  })

  it('la page de confirmation sait d’où et quand l’app a demandé le code, et d’où l’on confirme', async () => {
    const ipApp = nouvelleMachine()
    const avant = Date.now()
    const code = await demanderCode(ipApp)
    const navigateur = nouvelleMachine()
    const demande = (qui: Compte | null, c = code.user_code) => appeler(`/api/bureau/demande?user_code=${encodeURIComponent(c)}`, { cookie: qui?.cookie, ip: navigateur })

    expect((await demande(null)).status).toBe(401)
    // Tant que la page n'a pas pris le code en main pour son compte, elle n'en sait rien.
    expect((await demande(ana)).status).toBe(404)
    expect((await appeler(`/api/auth/device?user_code=${code.user_code}`, { cookie: ana.cookie, ip: navigateur })).status).toBe(200)

    const r = await demande(ana)
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toBe('no-store')
    const lu = (await r.json()) as { ip: string; quand: number; ipActuelle: string }
    expect(lu).toMatchObject({ ip: ipApp, ipActuelle: navigateur })
    expect(lu.quand).toBeGreaterThanOrEqual(avant)
    expect(lu.quand).toBeLessThanOrEqual(Date.now())
    // Le code se tape comme il vient : minuscules, tiret au milieu.
    const tape = `${code.user_code.slice(0, 4)}-${code.user_code.slice(4)}`.toLowerCase()
    expect((await demande(ana, tape)).status).toBe(200)
    // Un autre compte ne voit pas l'adresse de l'app d'Ana, ni un code inconnu.
    expect((await demande(bob)).status).toBe(404)
    expect((await demande(ana, 'ZZZZZZZZ')).status).toBe(404)
    expect((await demande(ana, '')).status).toBe(404)
  })

  it('demander des codes, ou en essayer, se limite par adresse ; le jeton a sa propre limite, large', async () => {
    const ip = nouvelleMachine()
    const statuts: number[] = []
    for (let i = 0; i < 11; i++) statuts.push((await enJson('/api/auth/device/code', { client_id: CLIENT }, { ip, origine: null })).status)
    expect(statuts.slice(0, 10).every((s) => s === 200)).toBe(true)
    expect(statuts[10]).toBe(429)

    const devin = nouvelleMachine()
    const essais: number[] = []
    for (let i = 0; i < 11; i++) essais.push((await appeler(`/api/auth/device?user_code=AAAA${String(i).padStart(4, '2')}`, { cookie: bob.cookie, ip: devin })).status)
    expect(essais.slice(0, 10).every((s) => s === 400)).toBe(true)
    expect(essais[10]).toBe(429)
    // L'accord partage la même limite que l'ouverture de la page.
    expect((await enJson('/api/auth/device/approve', { userCode: 'AAAAAAAA' }, { cookie: bob.cookie, ip: devin })).status).toBe(429)

    // L'app qui attend l'accord redemande son jeton bien plus de dix fois.
    const code = await demanderCode(nouvelleMachine())
    const app2 = nouvelleMachine()
    const sondages: number[] = []
    for (let i = 0; i < 30; i++) sondages.push((await jeton(code.device_code, { ip: app2 })).status)
    expect(sondages.includes(429)).toBe(false)
  })
})

describe('les demandes de code expirées', () => {
  it('s’effacent de la base, les autres restent', () => {
    const base = ouvrirBase(':memory:')
    const poser = (code: string, expire: Date) =>
      base.db
        .prepare("INSERT INTO deviceCode (id, deviceCode, userCode, expiresAt, status, clientId) VALUES (?, ?, ?, ?, 'pending', 'notak-bureau')")
        .run(code, `d-${code}`, code, expire.toISOString())
    const maintenant = Date.parse('2026-10-26T10:00:00.000Z')
    poser('VIEUX222', new Date(maintenant - 1))
    poser('NEUF2222', new Date(maintenant + 60_000))
    base.oublierDemandesAppareilExpirees(maintenant)
    expect(base.demandeAppareil('VIEUX222')).toBeNull()
    expect(base.demandeAppareil('NEUF2222')).toEqual({ compte: null, expire: maintenant + 60_000, statut: 'pending' })
    base.fermer()
  })
})

describe('la mémoire des demandes de code', () => {
  it('oublie une demande après dix minutes', () => {
    const d = creerDemandes()
    d.noter('ABCD2345', '203.0.113.9', 1_000)
    expect(d.lire('abcd-2345', 1_000 + 9 * 60_000)).toEqual({ ip: '203.0.113.9', quand: 1_000 })
    expect(d.lire('ABCD2345', 1_000 + 10 * 60_000)).toBeNull()
  })

  it('ne grossit pas au-delà de sa borne : les plus anciennes partent d’abord', () => {
    const d = creerDemandes(60_000, 3)
    for (let i = 0; i < 5; i++) d.noter(`CODE000${i + 2}`, `10.0.0.${i}`, 100 + i)
    expect(d.lire('CODE0002', 200)).toBeNull()
    expect(d.lire('CODE0003', 200)).toBeNull()
    expect(d.lire('CODE0006', 200)).toEqual({ ip: '10.0.0.4', quand: 104 })
  })

  it('le code se lit comme Better Auth le cherche', () => {
    expect(normaliserCode(' abcd-efgh ')).toBe('ABCDEFGH')
    expect(normaliserCode('x'.repeat(500))).toHaveLength(64)
  })
})
