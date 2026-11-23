import { Hono } from 'hono'
import type { Context } from 'hono'
import { describe, expect, it } from 'vitest'
import { type Base, type Utilisateur, ouvrirBase } from './base.ts'
import type { Role } from './droits.ts'
import {
  type AgentRelaye,
  type Ouvrabilite,
  adressePieces,
  agentsRelayes,
  cartesLues,
  creesLus,
  enTeteOuverte,
  evenementLu,
  nomDePiece,
  ouvrirLu,
  partiesLues,
  piecesLues,
  reponsesLues,
  routesAgent,
  selectionLue,
  typeDePiece,
} from './fram.ts'
import { signatureValable, sourcesDe } from './rattachements.ts'

const SECRET = 'un-secret-partage-de-plus-de-trente-deux-signes'
const MOI: Utilisateur = { id: 'u1', email: 'samy@crm.exemple.fr', nom: 'Samy', couleur: '#000', racine: 'r1' }
const AGENT: AgentRelaye = { source: 'crm', nom: 'Fram', outil: 'Comptoir', adresse: 'https://api.crm.exemple.fr/hooks/notak/fram', fournisseur: 'crm', secret: SECRET }
const TOUR = '0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee'

function base(lie = true): Base {
  const b = ouvrirBase(':memory:')
  b.db.prepare("INSERT INTO utilisateurs (id, email, nom, couleur, racine, photo, email_verifie, cree, modifie) VALUES (?, ?, ?, ?, ?, NULL, 1, '', '')").run(MOI.id, MOI.email, MOI.nom, MOI.couleur, MOI.racine)
  if (lie) b.db.prepare("INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES ('a1', 'sub-42', 'crm', ?, '', '')").run(MOI.id)
  return b
}

/** Un Comptoir qui vérifie la signature, garde ce qu'on lui envoie et répond selon le type. */
function crm(reponses: Record<string, { statut?: number; corps?: unknown }>) {
  const recus: Record<string, unknown>[] = []
  const adresses: string[] = []
  const envoyer = (async (adresse: string, init: RequestInit) => {
    adresses.push(adresse)
    const corps = String(init.body)
    const entete = (init.headers as Record<string, string>)['notak-signature']
    if (!signatureValable(SECRET, corps, entete, Date.now())) return new Response('', { status: 404 })
    const lu = JSON.parse(corps) as Record<string, unknown>
    recus.push(lu)
    const r = reponses[String(lu.type)] ?? { statut: 404 }
    return new Response(r.corps === undefined ? '' : JSON.stringify(r.corps), { status: r.statut ?? 200 })
  }) as typeof fetch
  return { recus, envoyer, adresses }
}

function app(o: { base: Base; role?: Role | null; envoyer: typeof fetch; agents?: AgentRelaye[]; ouvrable?: Ouvrabilite }) {
  const a = new Hono()
  const garde = async (c: Context, minimum: Role) => {
    const role = o.role === undefined ? 'edition' : o.role
    if (role === null) return c.json({ code: 'introuvable' }, 404)
    if (minimum === 'edition' && role === 'lecture') return c.json({ code: 'interdit' }, 403)
    return { u: MOI, id: c.req.param('id') ?? '', role }
  }
  routesAgent(a, {
    garde,
    base: o.base,
    sources: () => [],
    maintenant: Date.now,
    origine: 'https://notak.test',
    agents: o.agents ?? [AGENT],
    envoyer: o.envoyer,
    ...(o.ouvrable ? { ouvrable: o.ouvrable } : {}),
  })
  return a
}

/**
 * Ce que Samy peut ouvrir, comme `app.ts` le dirait : le tableau t1 et le dossier d1 (ce qu'ils portent), pas le
 * tableau prive01 ; ni l'élément perdu1, à la corbeille.
 */
const OUVRABLE: Ouvrabilite = async (_u, { tableau, element }) => {
  if (tableau === 'prive0001' || element === 'perdu1') return null
  if (!element) return tableau === 'dossier01' ? { adresse: `https://notak.test/?dossier=${tableau}`, titre: 'Clients', type: 'dossier' } : { adresse: `https://notak.test/t/${tableau}`, titre: 'Prism', type: 'toile' }
  const type = element.startsWith('page') ? 'page' : element.startsWith('carte') ? 'carte_mentale' : 'note'
  return { adresse: `https://notak.test/t/${tableau}/e/${element}`, titre: type === 'page' ? 'Wilfried Robert' : type === 'carte_mentale' ? 'Rendez-vous' : '', type }
}

const poster = (a: Hono, chemin: string, corps: unknown) => a.request(chemin, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) })

describe('L’agent sollicité depuis un tableau', () => {
  it('se lit sur une source qui ouvre la porte des agents, a son secret et dit où relayer', () => {
    const brut = JSON.stringify([
      { source: 'crm', nom: 'Comptoir', dossier: 'Clients', origine: 'https://crm.exemple.fr', secret: SECRET, agents: true, agent: 'Fram', agentAdresse: 'https://api.crm.exemple.fr/hooks/notak/fram' },
      { source: 'autre', nom: 'Autre', dossier: 'Fiches', origine: 'https://autre.fr', secret: SECRET, agentAdresse: 'https://autre.fr/agent' },
      { source: 'http', nom: 'Http', dossier: 'Fiches', origine: 'https://http.fr', secret: SECRET, agents: true, agentAdresse: 'http://http.fr/agent' },
    ])
    const dits: string[] = []
    const agents = agentsRelayes(sourcesDe(brut, (m) => dits.push(m)))
    expect(agents).toEqual([{ source: 'crm', nom: 'Fram', outil: 'Comptoir', adresse: 'https://api.crm.exemple.fr/hooks/notak/fram', fournisseur: 'crm', secret: SECRET }])
    expect(dits).toHaveLength(1)
    expect(agentsRelayes([])).toEqual([])
  })

  it('n’existe pas sans agent, ni sur un tableau qu’on ne lit pas ; paraît à qui le lit, sans pouvoir le modifier', async () => {
    const { envoyer, recus } = crm({ 'fram.fil': { corps: { fil: 'f1', echanges: [], tour: null } } })
    expect((await app({ base: base(), envoyer, agents: [] }).request('/api/tableaux/t1/agent')).status).toBe(404)
    expect((await app({ base: base(), envoyer, role: null }).request('/api/tableaux/t1/agent')).status).toBe(404)
    expect(recus).toEqual([])
    const lecteur = await app({ base: base(), envoyer, role: 'lecture' }).request('/api/tableaux/t1/agent')
    expect(lecteur.status).toBe(200)
    expect(await lecteur.json()).toMatchObject({ disponible: true })
  })

  it('ne paraît pas à une personne qui n’est pas liée à l’outil, ni que l’outil ne lui ouvre pas', async () => {
    const { envoyer, recus } = crm({ 'fram.fil': { statut: 404 } })
    const nonLiee = await app({ base: base(false), envoyer }).request('/api/tableaux/t1/agent')
    expect(await nonLiee.json()).toEqual({ agent: 'Fram', outil: 'Comptoir', disponible: false })
    expect(recus).toEqual([])
    const fermee = await app({ base: base(), envoyer }).request('/api/tableaux/t1/agent')
    expect(await fermee.json()).toEqual({ agent: 'Fram', outil: 'Comptoir', disponible: false })
    expect(recus).toEqual([{ type: 'fram.fil', personne: { sub: 'sub-42', email: 'samy@crm.exemple.fr' }, tableau: 't1' }])
  })

  it('relaie le fil, la demande et l’état du tour, signés, au nom de la personne liée', async () => {
    const echanges = [{ qui: 'personne', texte: 'Range ce tableau.', quand: '2026-11-21T13:00:00Z' }]
    const { envoyer, recus } = crm({
      'fram.fil': { corps: { fil: 'f1', echanges, tour: null } },
      'fram.demander': { corps: { tour: TOUR, fil: 'f1', etat: 'queued' } },
      'fram.lire': { corps: { tour: TOUR, etat: 'done', fini: true, texte: 'C’est rangé.', echec: null, cartes: [] } },
    })
    const a = app({ base: base(), envoyer })

    expect(await (await a.request('/api/tableaux/t1/agent')).json()).toEqual({ agent: 'Fram', outil: 'Comptoir', disponible: true, echanges, tour: null, parties: [] })
    const demande = await poster(a, '/api/tableaux/t1/agent', { message: '  Range ce tableau.  ', selection: [{ id: 'element-1', texte: ' Une   note ' }, { id: '../x' }] })
    expect(demande.status).toBe(202)
    expect(await demande.json()).toEqual({ tour: TOUR, etat: 'queued' })
    const etat = await a.request(`/api/tableaux/t1/agent/tours/${TOUR}`)
    expect(await etat.json()).toEqual({ tour: TOUR, etat: 'done', fini: true, texte: 'C’est rangé.', echec: null, cartes: [], crees: [], ouvrir: null })

    const envoyee = recus[1]!
    expect(envoyee).toMatchObject({
      type: 'fram.demander',
      personne: { sub: 'sub-42', email: 'samy@crm.exemple.fr' },
      tableau: { id: 't1', titre: 'Sans titre', lien: 'https://notak.test/t/t1' },
      selection: [{ id: 'element-1', texte: 'Une note' }],
      message: 'Range ce tableau.',
    })
    expect(String(envoyee.id)).toMatch(/^[0-9a-f-]{36}$/)
    expect(recus[2]).toEqual({ type: 'fram.lire', personne: { sub: 'sub-42', email: 'samy@crm.exemple.fr' }, tableau: 't1', tour: TOUR })
  })

  it('refuse un message vide ou trop long, un tour mal écrit, et dit une panne de l’outil', async () => {
    const { envoyer, recus } = crm({ 'fram.demander': { statut: 409, corps: { erreur: 'occupé' } } })
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

  it('rend ce que le tour a créé et ce que l’agent veut ouvrir, refaits par Notak et tus quand la personne ne les lit pas', async () => {
    const { envoyer } = crm({
      'fram.lire': {
        corps: {
          tour: TOUR,
          etat: 'done',
          fini: true,
          texte: 'La page est prête.',
          echec: null,
          cartes: [],
          crees: [
            { type: 'page', titre: 'Titre de Comptoir', tableau: 't1-prism', element: 'page-wr1', adresse: 'https://ailleurs.exemple/piege' },
            { type: 'page', titre: 'Doublon', tableau: 't1-prism', element: 'page-wr1' },
            { type: 'toile', titre: 'Secret', tableau: 'prive0001' },
            { type: 'note', titre: 'Jetée', tableau: 't1-prism', element: 'perdu1' },
            { type: 'toile', titre: 'Mal écrit', tableau: '../x' },
            { type: 'dossier', titre: 'Clients', tableau: 'dossier01' },
          ],
          ouvrir: { tableau: 't1-prism', element: 'page-wr1' },
        },
      },
    })
    const etat = (await (await app({ base: base(), envoyer, ouvrable: OUVRABLE }).request(`/api/tableaux/t1/agent/tours/${TOUR}`)).json()) as Record<string, unknown>
    expect(etat.crees).toEqual([
      { type: 'page', titre: 'Wilfried Robert', tableau: 't1-prism', element: 'page-wr1', adresse: 'https://notak.test/t/t1-prism/e/page-wr1' },
      { type: 'dossier', titre: 'Clients', tableau: 'dossier01', adresse: 'https://notak.test/?dossier=dossier01' },
    ])
    expect(etat.ouvrir).toEqual({ type: 'page', titre: 'Wilfried Robert', tableau: 't1-prism', element: 'page-wr1', adresse: 'https://notak.test/t/t1-prism/e/page-wr1' })
    // Sans ces champs (un Comptoir d'avant), ou sans de quoi vérifier ce que la personne lit : rien ne passe.
    const avant = crm({ 'fram.lire': { corps: { tour: TOUR, etat: 'done', fini: true, texte: 'x', echec: null, cartes: [] } } })
    expect(await (await app({ base: base(), envoyer: avant.envoyer, ouvrable: OUVRABLE }).request(`/api/tableaux/t1/agent/tours/${TOUR}`)).json()).toMatchObject({ crees: [], ouvrir: null })
    expect(await (await app({ base: base(), envoyer }).request(`/api/tableaux/t1/agent/tours/${TOUR}`)).json()).toMatchObject({ crees: [], ouvrir: null })
    expect(await ouvrirLu({ tableau: 'prive0001' }, (l) => OUVRABLE(MOI, l))).toBeNull()
    expect(await ouvrirLu(null, (l) => OUVRABLE(MOI, l))).toBeNull()
    expect(await creesLus('rien', (l) => OUVRABLE(MOI, l))).toEqual([])
  })

  it('une demande faite depuis une page ouverte en grand la porte en tête de sa sélection, avec son lien', async () => {
    const { envoyer, recus } = crm({ 'fram.demander': { corps: { tour: TOUR, fil: 'f1', etat: 'queued' } } })
    const a = app({ base: base(), envoyer, ouvrable: OUVRABLE })
    const r = await poster(a, '/api/tableaux/t1-prism/agent', { message: 'Complète-la.', ouvert: 'page-wr1', selection: [{ id: 'page-wr1', texte: 'doublon' }, { id: 'note-12', texte: 'Une note' }] })
    expect(r.status).toBe(202)
    expect(recus[0]).toMatchObject({
      tableau: { id: 't1-prism', lien: 'https://notak.test/t/t1-prism' },
      selection: [
        { id: 'page-wr1', texte: 'La page « Wilfried Robert » est ouverte en grand : https://notak.test/t/t1-prism/e/page-wr1' },
        { id: 'note-12', texte: 'Une note' },
      ],
    })
    // Un dossier se dit par son adresse de bibliothèque ; un élément que la personne ne lit pas n'est pas dit ouvert.
    await poster(a, '/api/tableaux/dossier01/agent', { message: 'Range-le.', ouvert: 'perdu1' })
    expect(recus[1]).toMatchObject({ tableau: { id: 'dossier01', lien: 'https://notak.test/?dossier=dossier01' }, selection: [] })
    expect(enTeteOuverte('carte-1', { adresse: 'https://notak.test/t/t1/e/carte-1', titre: 'x'.repeat(400), type: 'carte_mentale' }).texte.length).toBeLessThanOrEqual(300)
  })

  it('borne la sélection à des éléments du tableau', () => {
    expect(selectionLue([{ id: 'abcdef', texte: 'x'.repeat(400) }, { id: 'a b' }, 'rien'])).toEqual([{ id: 'abcdef', texte: 'x'.repeat(300) }])
    expect(selectionLue(null)).toEqual([])
  })

  it('relaie les réponses aux cartes d’un tour, et ne laisse « toujours » qu’à un accord', async () => {
    const { envoyer, recus } = crm({
      'fram.decider': { corps: { tour: TOUR, etat: 'queued' } },
      'fram.lire': { corps: { tour: TOUR, etat: 'awaiting_approval', fini: false, texte: null, echec: null, cartes: [{ id: 'call-1', resume: 'Créer la carte', definitif: false }, { id: '../x' }] } },
    })
    const a = app({ base: base(), envoyer })
    const etat = (await (await a.request(`/api/tableaux/t1/agent/tours/${TOUR}`)).json()) as { cartes: unknown }
    expect(etat.cartes).toEqual([{ id: 'call-1', resume: 'Créer la carte', definitif: false }])

    const r = await poster(a, `/api/tableaux/t1/agent/tours/${TOUR}/cartes`, { cartes: [{ id: 'call-1', accord: true, toujours: true }, { id: 'call-2', accord: false, toujours: true }, { id: 'call-3' }] })
    expect(r.status).toBe(202)
    expect(await r.json()).toEqual({ tour: TOUR, etat: 'queued' })
    const envoye = recus.find((x) => x.type === 'fram.decider')!
    expect(envoye).toMatchObject({ personne: { sub: 'sub-42', email: 'samy@crm.exemple.fr' }, tableau: 't1', tour: TOUR, cartes: [{ id: 'call-1', accord: true, toujours: true }, { id: 'call-2', accord: false, toujours: false }] })
    expect(String(envoye.id)).toMatch(/^[0-9a-f-]{36}$/)
    expect((await poster(a, `/api/tableaux/t1/agent/tours/${TOUR}/cartes`, { cartes: [] })).status).toBe(400)
    expect((await poster(a, '/api/tableaux/t1/agent/tours/pas-un-tour/cartes', { cartes: [{ id: 'call-1', accord: true }] })).status).toBe(404)
  })

  it('borne les cartes lues et les réponses', () => {
    expect(cartesLues([{ id: 'a', resume: 'x'.repeat(600), definitif: 'oui' }, null])).toEqual([{ id: 'a', resume: 'x'.repeat(500), definitif: false }])
    expect(reponsesLues([{ id: 'a', accord: 'oui' }, { id: 'b', accord: false, toujours: true }])).toEqual([{ id: 'b', accord: false, toujours: false }])
  })
})

describe('L’agent en direct (23/11/2026)', () => {
  const PERSONNE = { sub: 'sub-42', email: 'samy@crm.exemple.fr' }

  it('relaie le journal d’un tour depuis la dernière suite, et relit chaque événement sans faire confiance à l’outil', async () => {
    const evenements = [
      { seq: 4, genre: 'etat', etat: 'running' },
      { seq: 5, genre: 'geste', id: 'g1', statut: 'en_cours', phrase: 'Je lis le tableau « Voyage »…' },
      { seq: 6, genre: 'geste', id: 'g1', statut: 'fait', phrase: 'J’ai lu le tableau « Voyage ».' },
      { seq: 7, genre: 'pensee', titre: 'Trois sujets se dégagent', resume: 'Le budget, les dates, les invités.' },
      { seq: 8, genre: 'plan', etapes: [{ titre: 'Lire', statut: 'fait' }, { titre: 'Dessiner', statut: 'en_cours' }, { titre: '', statut: 'fait' }, { titre: 'Relire', statut: 'bizarre' }] },
      { seq: 9, genre: 'texte', bloc: 1, ajout: 'Je pose ', etape: false },
      { seq: 10, genre: 'texte', bloc: 'b2', ajout: 'Je regarde les dates.', etape: true },
      { seq: 11, genre: 'geste', id: 'g2', statut: 'pas-un-statut', phrase: 'x' },
      { seq: 12, genre: 'inconnu' },
      { seq: -1, genre: 'fin' },
      { genre: 'fin' },
      'rien',
    ]
    const { envoyer, recus } = crm({
      'fram.journal': {
        corps: {
          tour: TOUR,
          etat: 'running',
          fini: false,
          suite: 12,
          encore: true,
          evenements,
          crees: [{ type: 'carte_mentale', tableau: 't1-prism', element: 'carte-1' }],
          ouvrir: null,
          texte: null,
          echec: null,
          cartes: [],
        },
      },
    })
    const a = app({ base: base(), envoyer, ouvrable: OUVRABLE })
    const r = await a.request(`/api/tableaux/t1/agent/tours/${TOUR}/journal?depuis=3`)
    expect(r.status).toBe(200)
    const lu = (await r.json()) as Record<string, unknown>
    expect(recus[0]).toEqual({ type: 'fram.journal', personne: PERSONNE, tableau: 't1', tour: TOUR, depuis: 3 })
    expect(lu).toMatchObject({ tour: TOUR, etat: 'running', fini: false, suite: 12, encore: true, ouvrir: null, texte: null, echec: null, cartes: [] })
    expect(lu.evenements).toEqual([
      { seq: 4, genre: 'etat', etat: 'running' },
      { seq: 5, genre: 'geste', id: 'g1', statut: 'en_cours', phrase: 'Je lis le tableau « Voyage »…' },
      { seq: 6, genre: 'geste', id: 'g1', statut: 'fait', phrase: 'J’ai lu le tableau « Voyage ».' },
      { seq: 7, genre: 'pensee', titre: 'Trois sujets se dégagent', resume: 'Le budget, les dates, les invités.' },
      { seq: 8, genre: 'plan', etapes: [{ titre: 'Lire', statut: 'fait' }, { titre: 'Dessiner', statut: 'en_cours' }, { titre: 'Relire', statut: 'a_faire' }] },
      { seq: 9, genre: 'texte', bloc: '1', ajout: 'Je pose ', etape: false },
      { seq: 10, genre: 'texte', bloc: 'b2', ajout: 'Je regarde les dates.', etape: true },
    ])
    // Ce qui est créé paraît dès qu'il est écrit, refait par Notak comme à la lecture du tour.
    expect(lu.crees).toEqual([{ type: 'carte_mentale', titre: 'Rendez-vous', tableau: 't1-prism', element: 'carte-1', adresse: 'https://notak.test/t/t1-prism/e/carte-1' }])

    // Sans `depuis`, le journal se lit depuis le début ; un curseur de l'outil lui revient tel quel ; un curseur mal écrit est refusé.
    await a.request(`/api/tableaux/t1/agent/tours/${TOUR}/journal`)
    await a.request(`/api/tableaux/t1/agent/tours/${TOUR}/journal?depuis=c-17.a`)
    expect(recus.slice(1).map((x) => x.depuis)).toEqual([0, 'c-17.a'])
    expect((await a.request(`/api/tableaux/t1/agent/tours/${TOUR}/journal?depuis=${encodeURIComponent('../x')}`)).status).toBe(400)
    expect((await a.request('/api/tableaux/t1/agent/tours/pas-un-tour/journal')).status).toBe(404)
  })

  it('le journal d’un tour fini dit sa fin, sa réponse et son échec ; une suite absente reste celle qu’on a donnée', async () => {
    const { envoyer } = crm({
      'fram.journal': { corps: { tour: TOUR, etat: 'failed', fini: true, evenements: [{ seq: 30, genre: 'echec', message: 'Comptoir ne répond plus.' }, { seq: 31, genre: 'fin' }], texte: 'Je n’ai pas pu finir.', echec: 'Comptoir ne répond plus.' } },
    })
    const lu = (await (await app({ base: base(), envoyer }).request(`/api/tableaux/t1/agent/tours/${TOUR}/journal?depuis=29`)).json()) as Record<string, unknown>
    expect(lu).toEqual({
      tour: TOUR,
      etat: 'failed',
      fini: true,
      suite: 29,
      encore: false,
      evenements: [
        { seq: 30, genre: 'echec', message: 'Comptoir ne répond plus.' },
        { seq: 31, genre: 'fin' },
      ],
      crees: [],
      ouvrir: null,
      texte: 'Je n’ai pas pu finir.',
      echec: 'Comptoir ne répond plus.',
      cartes: [],
    })
  })

  it('arrête un tour, au nom de la personne, d’un identifiant neuf', async () => {
    const { envoyer, recus } = crm({ 'fram.arreter': { corps: { tour: TOUR, etat: 'cancelled' } } })
    const a = app({ base: base(), envoyer })
    const r = await poster(a, `/api/tableaux/t1/agent/tours/${TOUR}/arreter`, {})
    expect(r.status).toBe(202)
    expect(await r.json()).toEqual({ tour: TOUR, etat: 'cancelled' })
    expect(recus[0]).toMatchObject({ type: 'fram.arreter', personne: PERSONNE, tableau: 't1', tour: TOUR })
    expect(String(recus[0]!.id)).toMatch(/^[0-9a-f-]{36}$/)
    expect((await poster(a, '/api/tableaux/t1/agent/tours/pas-un-tour/arreter', {})).status).toBe(404)
    expect((await poster(app({ base: base(false), envoyer }), `/api/tableaux/t1/agent/tours/${TOUR}/arreter`, {})).status).toBe(404)
  })

  it('un message porte ses pièces ; une image seule est un message ; pendant un tour, il part en file', async () => {
    const { envoyer, recus } = crm({ 'fram.demander': { corps: { tour: TOUR, fil: 'f1', etat: 'waiting' } } })
    const a = app({ base: base(), envoyer })
    const r = await poster(a, '/api/tableaux/t1/agent', { message: 'Regarde ces photos.', pieces: ['p-1', 'p-2', 'p-1'] })
    expect(r.status).toBe(202)
    expect(await r.json()).toEqual({ tour: TOUR, etat: 'waiting' })
    expect(recus[0]).toMatchObject({ type: 'fram.demander', message: 'Regarde ces photos.', pieces: ['p-1', 'p-2'] })
    await poster(a, '/api/tableaux/t1/agent', { message: '', pieces: ['p-3'] })
    expect(recus[1]).toMatchObject({ message: '', pieces: ['p-3'] })
    // Sans pièce, rien n'est ajouté au corps : un Comptoir d'avant le lit comme hier.
    await poster(a, '/api/tableaux/t1/agent', { message: 'Bonjour' })
    expect(recus[2]).not.toHaveProperty('pieces')
    expect((await poster(a, '/api/tableaux/t1/agent', { message: 'x', pieces: Array.from({ length: 11 }, (_, i) => `p-${i}`) })).status).toBe(400)
    expect((await poster(a, '/api/tableaux/t1/agent', { message: 'x', pieces: ['../etc'] })).status).toBe(400)
    expect((await poster(a, '/api/tableaux/t1/agent', { message: '', pieces: [] })).status).toBe(400)
    expect(recus).toHaveLength(3)
  })

  it('une pièce passe par Notak, bornée à 25 Mo, et part en base64 à l’adresse des pièces', async () => {
    const { envoyer, recus, adresses } = crm({ 'fram.piece': { statut: 200, corps: { piece: 'piece-0190', nom: 'plan.png', taille: 4 } } })
    const a = app({ base: base(), envoyer })
    const envoyerPiece = (corps: Uint8Array<ArrayBuffer>, nom: string, type = 'image/png', entetes: Record<string, string> = {}) =>
      a.request(`/api/tableaux/t1/agent/pieces?nom=${encodeURIComponent(nom)}`, { method: 'POST', headers: { 'content-type': type, ...entetes }, body: corps })

    const r = await envoyerPiece(new Uint8Array([1, 2, 3, 4]), 'Mes images/plan.png')
    expect(r.status).toBe(201)
    expect(await r.json()).toEqual({ piece: 'piece-0190', nom: 'plan.png', taille: 4 })
    expect(adresses).toEqual(['https://api.crm.exemple.fr/hooks/notak/fram/pieces'])
    expect(recus[0]).toMatchObject({ type: 'fram.piece', personne: PERSONNE, tableau: 't1', nom: 'plan.png', type_mime: 'image/png', contenu: 'AQIDBA==' })
    expect(String(recus[0]!.id)).toMatch(/^[0-9a-f-]{36}$/)

    // Trop gros (annoncé, ou lu), vide : refusé ici, rien ne part.
    expect((await envoyerPiece(new Uint8Array(1), 'x', 'image/png', { 'content-length': String(26 * 1024 * 1024) })).status).toBe(413)
    expect((await envoyerPiece(new Uint8Array(25 * 1024 * 1024 + 1), 'x')).status).toBe(413)
    expect((await envoyerPiece(new Uint8Array(0), 'vide.txt')).status).toBe(400)
    expect(recus).toHaveLength(1)
    expect((await envoyerPiece(new Uint8Array(1), 'x', 'image/png')).status).toBe(201)
    expect((await app({ base: base(false), envoyer }).request('/api/tableaux/t1/agent/pieces?nom=x', { method: 'POST', body: new Uint8Array(1) })).status).toBe(404)
  })

  it('un refus de l’outil se dit dans ses mots ; une panne, comme ailleurs', async () => {
    const refus = crm({ 'fram.piece': { statut: 422, corps: { erreur: 'Fram ne lit pas encore les vidéos.' } } })
    const r = await app({ base: base(), envoyer: refus.envoyer }).request('/api/tableaux/t1/agent/pieces?nom=film.mov', { method: 'POST', headers: { 'content-type': 'video/quicktime' }, body: new Uint8Array(8) })
    expect(r.status).toBe(422)
    expect(await r.json()).toEqual({ erreur: 'Fram ne lit pas encore les vidéos.', code: 'piece_refusee' })
    const muet = crm({ 'fram.piece': { statut: 200, corps: { piece: '../x' } } })
    expect((await app({ base: base(), envoyer: muet.envoyer }).request('/api/tableaux/t1/agent/pieces?nom=a', { method: 'POST', body: new Uint8Array(8) })).status).toBe(502)
  })

  it('le fil rend les parties précédentes de la conversation, bornées', async () => {
    const parties = [
      { id: 'partie-2', debut: '2026-11-22T09:00:00Z', fin: '2026-11-22T09:40:00Z', resume: 'La carte des invités.' },
      { id: 7, debut: '2026-11-21T09:00:00Z', fin: '2026-11-21T10:00:00Z', resume: 'x'.repeat(5000) },
      { resume: 'sans id' },
    ]
    const { envoyer } = crm({ 'fram.fil': { corps: { fil: 'f1', echanges: [], tour: null, parties } } })
    const lu = (await (await app({ base: base(), envoyer }).request('/api/tableaux/t1/agent')).json()) as { parties: { id: string; resume: string }[] }
    expect(lu.parties.map((p) => p.id)).toEqual(['partie-2', '7'])
    expect(lu.parties[1]!.resume).toHaveLength(4000)
    // Un Comptoir d'avant, sans parties : une liste vide.
    const avant = crm({ 'fram.fil': { corps: { fil: 'f1', echanges: [], tour: null } } })
    expect(await (await app({ base: base(), envoyer: avant.envoyer }).request('/api/tableaux/t1/agent')).json()).toMatchObject({ parties: [] })
  })

  it('borne les noms, les genres et les identifiants des pièces', () => {
    expect(nomDePiece(encodeURIComponent('../../etc/pass\nwd\u0007.txt'))).toBe('passwd.txt')
    expect(nomDePiece('%E0%A4%A')).toBe('%E0%A4%A')
    expect(nomDePiece('')).toBe('fichier')
    expect(nomDePiece('x'.repeat(300))).toHaveLength(200)
    expect(typeDePiece('image/PNG; charset=binary')).toBe('image/png')
    expect(typeDePiece('pas un genre')).toBe('application/octet-stream')
    expect(typeDePiece(undefined)).toBe('application/octet-stream')
    expect(piecesLues(undefined)).toEqual([])
    expect(piecesLues('p-1')).toBeNull()
    expect(adressePieces({ ...AGENT, adresse: 'https://crm.test/hooks/notak/fram/' })).toBe('https://crm.test/hooks/notak/fram/pieces')
    expect(evenementLu({ seq: 1, genre: 'texte', bloc: '', ajout: 'x' })).toBeNull()
    expect(evenementLu({ seq: 1, genre: 'pensee', titre: '  ' })).toBeNull()
    expect(evenementLu({ seq: 1.5, genre: 'fin' })).toBeNull()
    expect(partiesLues(null)).toEqual([])
  })
})
