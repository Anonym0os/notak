import { Hono } from 'hono'
import type { Context } from 'hono'
import { describe, expect, it } from 'vitest'
import { type Base, type Utilisateur, ouvrirBase } from './base.ts'
import type { Role } from './droits.ts'
import { type AgentRelaye, agentsRelayes, routesAgent, selectionLue } from './fram.ts'
import { signatureValable, sourcesDe } from './rattachements.ts'

const SECRET = 'un-secret-partage-de-plus-de-trente-deux-signes'
const MOI: Utilisateur = { id: 'u1', email: 'samy@silak.fr', nom: 'Samy', couleur: '#000', racine: 'r1' }
const AGENT: AgentRelaye = { source: 'silak', nom: 'Fram', adresse: 'https://api.silak.test/hooks/notak/fram', fournisseur: 'silak', secret: SECRET }
const TOUR = '0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee'

function base(lie = true): Base {
  const b = ouvrirBase(':memory:')
  b.db.prepare("INSERT INTO utilisateurs (id, email, nom, couleur, racine, photo, email_verifie, cree, modifie) VALUES (?, ?, ?, ?, ?, NULL, 1, '', '')").run(MOI.id, MOI.email, MOI.nom, MOI.couleur, MOI.racine)
  if (lie) b.db.prepare("INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES ('a1', 'sub-42', 'silak', ?, '', '')").run(MOI.id)
  return b
}

/** Un Silak qui vérifie la signature, garde ce qu'on lui envoie et répond selon le type. */
function silak(reponses: Record<string, { statut?: number; corps?: unknown }>) {
  const recus: Record<string, unknown>[] = []
  const envoyer = (async (_adresse: string, init: RequestInit) => {
    const corps = String(init.body)
    const entete = (init.headers as Record<string, string>)['notak-signature']
    if (!signatureValable(SECRET, corps, entete, Date.now())) return new Response('', { status: 404 })
    const lu = JSON.parse(corps) as Record<string, unknown>
    recus.push(lu)
    const r = reponses[String(lu.type)] ?? { statut: 404 }
    return new Response(r.corps === undefined ? '' : JSON.stringify(r.corps), { status: r.statut ?? 200 })
  }) as typeof fetch
  return { recus, envoyer }
}

function app(o: { base: Base; role?: Role | null; envoyer: typeof fetch; agents?: AgentRelaye[] }) {
  const a = new Hono()
  const garde = async (c: Context, minimum: Role) => {
    const role = o.role === undefined ? 'edition' : o.role
    if (role === null) return c.json({ code: 'introuvable' }, 404)
    if (minimum === 'edition' && role === 'lecture') return c.json({ code: 'interdit' }, 403)
    return { u: MOI, id: c.req.param('id') ?? '', role }
  }
  routesAgent(a, { garde, base: o.base, sources: () => [], maintenant: Date.now, origine: 'https://notak.test', agents: o.agents ?? [AGENT], envoyer: o.envoyer })
  return a
}

const poster = (a: Hono, chemin: string, corps: unknown) => a.request(chemin, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) })

describe('L’agent sollicité depuis un tableau', () => {
  it('se lit sur une source qui ouvre la porte des agents, a son secret et dit où relayer', () => {
    const brut = JSON.stringify([
      { source: 'silak', nom: 'Silak', dossier: 'Clients', origine: 'https://silak.fr', secret: SECRET, agents: true, agent: 'Fram', agentAdresse: 'https://api.silak.fr/hooks/notak/fram' },
      { source: 'autre', nom: 'Autre', dossier: 'Fiches', origine: 'https://autre.fr', secret: SECRET, agentAdresse: 'https://autre.fr/agent' },
      { source: 'http', nom: 'Http', dossier: 'Fiches', origine: 'https://http.fr', secret: SECRET, agents: true, agentAdresse: 'http://http.fr/agent' },
    ])
    const dits: string[] = []
    const agents = agentsRelayes(sourcesDe(brut, (m) => dits.push(m)))
    expect(agents).toEqual([{ source: 'silak', nom: 'Fram', adresse: 'https://api.silak.fr/hooks/notak/fram', fournisseur: 'silak', secret: SECRET }])
    expect(dits).toHaveLength(1)
    expect(agentsRelayes([])).toEqual([])
  })

  it('n’existe pas sans agent, ni sur un tableau qu’on ne peut pas modifier', async () => {
    const { envoyer, recus } = silak({})
    expect((await app({ base: base(), envoyer, agents: [] }).request('/api/tableaux/t1/agent')).status).toBe(404)
    expect((await app({ base: base(), envoyer, role: 'lecture' }).request('/api/tableaux/t1/agent')).status).toBe(403)
    expect((await app({ base: base(), envoyer, role: null }).request('/api/tableaux/t1/agent')).status).toBe(404)
    expect(recus).toEqual([])
  })

  it('ne paraît pas à une personne qui n’est pas liée à l’outil, ni que l’outil ne lui ouvre pas', async () => {
    const { envoyer, recus } = silak({ 'fram.fil': { statut: 404 } })
    const nonLiee = await app({ base: base(false), envoyer }).request('/api/tableaux/t1/agent')
    expect(await nonLiee.json()).toEqual({ agent: 'Fram', disponible: false })
    expect(recus).toEqual([])
    const fermee = await app({ base: base(), envoyer }).request('/api/tableaux/t1/agent')
    expect(await fermee.json()).toEqual({ agent: 'Fram', disponible: false })
    expect(recus).toEqual([{ type: 'fram.fil', personne: { sub: 'sub-42', email: 'samy@silak.fr' }, tableau: 't1' }])
  })

  it('relaie le fil, la demande et l’état du tour, signés, au nom de la personne liée', async () => {
    const echanges = [{ qui: 'personne', texte: 'Range ce tableau.', quand: '2026-11-21T13:00:00Z' }]
    const { envoyer, recus } = silak({
      'fram.fil': { corps: { fil: 'f1', echanges, tour: null } },
      'fram.demander': { corps: { tour: TOUR, fil: 'f1', etat: 'queued' } },
      'fram.lire': { corps: { tour: TOUR, etat: 'done', fini: true, texte: 'C’est rangé.', echec: null, cartes: [] } },
    })
    const a = app({ base: base(), envoyer })

    expect(await (await a.request('/api/tableaux/t1/agent')).json()).toEqual({ agent: 'Fram', disponible: true, echanges, tour: null })
    const demande = await poster(a, '/api/tableaux/t1/agent', { message: '  Range ce tableau.  ', selection: [{ id: 'element-1', texte: ' Une   note ' }, { id: '../x' }] })
    expect(demande.status).toBe(202)
    expect(await demande.json()).toEqual({ tour: TOUR, etat: 'queued' })
    const etat = await a.request(`/api/tableaux/t1/agent/tours/${TOUR}`)
    expect(await etat.json()).toEqual({ tour: TOUR, etat: 'done', fini: true, texte: 'C’est rangé.', echec: null, cartes: [] })

    const envoyee = recus[1]!
    expect(envoyee).toMatchObject({
      type: 'fram.demander',
      personne: { sub: 'sub-42', email: 'samy@silak.fr' },
      tableau: { id: 't1', titre: 'Sans titre', lien: 'https://notak.test/t/t1' },
      selection: [{ id: 'element-1', texte: 'Une note' }],
      message: 'Range ce tableau.',
    })
    expect(String(envoyee.id)).toMatch(/^[0-9a-f-]{36}$/)
    expect(recus[2]).toEqual({ type: 'fram.lire', personne: { sub: 'sub-42', email: 'samy@silak.fr' }, tableau: 't1', tour: TOUR })
  })

  it('refuse un message vide ou trop long, un tour mal écrit, et dit une panne de l’outil', async () => {
    const { envoyer, recus } = silak({ 'fram.demander': { statut: 409, corps: { erreur: 'occupé' } } })
    const a = app({ base: base(), envoyer })
    expect((await poster(a, '/api/tableaux/t1/agent', { message: '   ' })).status).toBe(400)
    expect((await poster(a, '/api/tableaux/t1/agent', { message: 'x'.repeat(8001) })).status).toBe(400)
    expect((await a.request('/api/tableaux/t1/agent/tours/pas-un-tour')).status).toBe(404)
    expect(recus).toEqual([])
    expect((await poster(a, '/api/tableaux/t1/agent', { message: 'Bonjour' })).status).toBe(409)
    const injoignable = app({ base: base(), envoyer: (async () => Promise.reject(new Error('refusé'))) as typeof fetch })
    const r = await injoignable.request('/api/tableaux/t1/agent')
    expect(r.status).toBe(502)
    expect(await r.json()).toMatchObject({ code: 'injoignable' })
  })

  it('borne la sélection à des éléments du tableau', () => {
    expect(selectionLue([{ id: 'abcdef', texte: 'x'.repeat(400) }, { id: 'a b' }, 'rien'])).toEqual([{ id: 'abcdef', texte: 'x'.repeat(300) }])
    expect(selectionLue(null)).toEqual([])
  })
})
