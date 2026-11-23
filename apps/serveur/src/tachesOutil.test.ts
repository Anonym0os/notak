import { Hono } from 'hono'
import type { Context } from 'hono'
import { describe, expect, it } from 'vitest'
import { type Base, type Utilisateur, ouvrirBase } from './base.ts'
import type { Role } from './droits.ts'
import type { AgentRelaye } from './fram.ts'
import { type SourceRattachement, signatureValable } from './rattachements.ts'
import { jourValable, lienDeLOutil, listeLue, routesTaches, tacheLue } from './tachesOutil.ts'

const SECRET = 'un-secret-partage-de-plus-de-trente-deux-signes'
const MOI: Utilisateur = { id: 'u1', email: 'samy@silak.fr', nom: 'Samy', couleur: '#000', racine: 'r1' }
const ORIGINE = 'https://silak.test'
const SOURCE: SourceRattachement = { source: 'silak', nom: 'Silak', dossier: 'Clients', origine: ORIGINE, espace: 'e1', secret: SECRET, agents: true, agent: 'Fram', agentAdresse: 'https://api.silak.test/hooks/notak/fram' }
const AGENT: AgentRelaye = { source: 'silak', nom: 'Fram', adresse: 'https://api.silak.test/hooks/notak/fram', fournisseur: 'silak', secret: SECRET }
const CLE = 'societe:0190aaaa-bbbb-7ccc-8ddd-eeeeeeeeeeee'
const GESTE = '0190aaaa-bbbb-7ccc-8ddd-000000000001'

/** Samy, lié au SSO de Silak, et le dossier de Rœderer (`dossier01`), fiche de Silak dans l'espace de l'équipe. */
function base(o: { lie?: boolean; fiche?: boolean } = {}): Base {
  const b = ouvrirBase(':memory:')
  b.db.prepare("INSERT INTO utilisateurs (id, email, nom, couleur, racine, photo, email_verifie, cree, modifie) VALUES (?, ?, ?, ?, ?, NULL, 1, '', '')").run(MOI.id, MOI.email, MOI.nom, MOI.couleur, MOI.racine)
  if (o.lie !== false) b.db.prepare("INSERT INTO account (id, accountId, providerId, userId, createdAt, updatedAt) VALUES ('a1', 'sub-42', 'silak', ?, '', '')").run(MOI.id)
  b.db.prepare("INSERT INTO organization (id, name, slug, createdAt) VALUES ('e1', 'Équipe', 'equipe', '')").run()
  b.creerTableau({ id: 'dossier01', titre: 'Rœderer', proprietaire: MOI.id, parent: null })
  b.creerTableau({ id: 'toile0001', titre: 'Voyage', proprietaire: MOI.id, parent: null })
  if (o.fiche !== false) b.poserRattachement({ espace: 'e1', source: 'silak', cle: CLE, tableau: 'dossier01', adresse: `${ORIGINE}/crm/societes/x`, cree: 1 })
  return b
}

/** Un Silak qui vérifie la signature, garde ce qu'on lui envoie et répond selon le type ; `null` : injoignable. */
function silak(reponses: Record<string, { statut?: number; corps?: unknown } | null>) {
  const recus: Record<string, unknown>[] = []
  const envoyer = (async (_adresse: string, init: RequestInit) => {
    const corps = String(init.body)
    const entete = (init.headers as Record<string, string>)['notak-signature']
    if (!signatureValable(SECRET, corps, entete, Date.now())) return new Response('', { status: 404 })
    const lu = JSON.parse(corps) as Record<string, unknown>
    recus.push(lu)
    const r = reponses[String(lu.type)]
    if (r === null) throw new TypeError('fetch failed')
    const dit = r ?? { statut: 404 }
    return new Response(dit.corps === undefined ? '' : JSON.stringify(dit.corps), { status: dit.statut ?? 200 })
  }) as typeof fetch
  return { recus, envoyer }
}

function app(o: { base: Base; role?: Role | null; envoyer: typeof fetch }) {
  const a = new Hono()
  const garde = async (c: Context, _minimum: Role) => {
    const role = o.role === undefined ? 'lecture' : o.role
    if (role === null) return c.json({ code: 'introuvable' }, 404)
    return { u: MOI, id: c.req.param('id') ?? '', role }
  }
  routesTaches(a, { garde, base: o.base, sources: () => [SOURCE], maintenant: Date.now, agents: [AGENT], envoyer: o.envoyer })
  return a
}

/** Ce que les routes rendent, juste ce que les essais lisent. */
type Lu = { code?: string; tache?: { titre: string } }

const poster = (a: Hono, chemin: string, corps: unknown) => a.request(chemin, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corps) })

const LIGNE = {
  id: '0190aaaa-0000-7000-8000-000000000001',
  titre: '  Préparer   le comité ',
  fait: false,
  en_retard: true,
  echeance: '2026-11-25',
  recurrente: false,
  projet: 'Refonte',
  personnes: ['Samy Agher', '', 42],
  lien: '/taches/toutes?tache=0190aaaa-0000-7000-8000-000000000001',
}
const LISTE = { societe: { lien: '/crm/societes/x' }, taches: [LIGNE, { id: 'sans titre' }], total: 7, complet: true, aujourdhui: '2026-11-23', ecrire: true }

describe('Les tâches d’une fiche, tenues par l’outil', () => {
  it('ne suit qu’un chemin de l’outil, posé sur son origine déclarée', () => {
    expect(lienDeLOutil('/taches/toutes?tache=1', ORIGINE)).toBe('https://silak.test/taches/toutes?tache=1')
    for (const ailleurs of ['https://ailleurs.test/x', '//ailleurs.test/x', 'javascript:alert(1)', 'taches', 42, null]) expect(lienDeLOutil(ailleurs, ORIGINE)).toBeNull()
  })

  it('relit ce que l’outil dit d’une tâche, et laisse de côté ce qui ne se lit pas', () => {
    expect(tacheLue(LIGNE, ORIGINE)).toEqual({
      id: LIGNE.id,
      titre: 'Préparer le comité',
      fait: false,
      enRetard: true,
      echeance: '2026-11-25',
      recurrente: false,
      projet: 'Refonte',
      personnes: ['Samy Agher'],
      lien: `${ORIGINE}${LIGNE.lien}`,
    })
    expect(tacheLue({ ...LIGNE, fait: true }, ORIGINE)?.enRetard).toBe(false)
    expect(tacheLue({ ...LIGNE, echeance: '25/11/2026', lien: 'https://ailleurs.test' }, ORIGINE)).toMatchObject({ echeance: null, lien: null })
    expect(tacheLue({ id: '../x', titre: 'Rien' }, ORIGINE)).toBeNull()
    const liste = listeLue(LISTE, 'Silak', ORIGINE)
    expect(liste).toMatchObject({ disponible: true, outil: 'Silak', total: 7, complet: true, aujourdhui: '2026-11-23', ecrire: true, lien: `${ORIGINE}/crm/societes/x` })
    expect(liste.disponible && liste.taches.map((t) => t.titre)).toEqual(['Préparer le comité'])
    expect(jourValable('2026-02-28')).toBe(true)
    expect(jourValable('2026-02-30')).toBe(false)
  })

  it('montre les tâches de la fiche du dossier, demandées au nom de la personne liée', async () => {
    const s = silak({ 'taches.lister': { corps: LISTE } })
    const r = await app({ base: base(), envoyer: s.envoyer }).request('/api/tableaux/dossier01/taches')
    expect(r.status).toBe(200)
    const lu = (await r.json()) as { taches: unknown[] }
    expect(lu).toMatchObject({ disponible: true, outil: 'Silak', total: 7, ecrire: true })
    expect(lu.taches).toHaveLength(1)
    expect(s.recus).toEqual([{ type: 'taches.lister', personne: { sub: 'sub-42', email: 'samy@silak.fr' }, cle: CLE }])
  })

  it('ne paraît pas hors d’un dossier de fiche, sans compte lié, ni quand l’outil ne l’ouvre pas', async () => {
    const s = silak({ 'taches.lister': { statut: 404 } })
    const absent = { disponible: false }
    expect(await (await app({ base: base(), envoyer: s.envoyer }).request('/api/tableaux/toile0001/taches')).json()).toEqual(absent)
    expect(await (await app({ base: base({ lie: false }), envoyer: s.envoyer }).request('/api/tableaux/dossier01/taches')).json()).toEqual(absent)
    expect(s.recus).toHaveLength(0)
    expect(await (await app({ base: base(), envoyer: s.envoyer }).request('/api/tableaux/dossier01/taches')).json()).toEqual(absent)
    expect((await app({ base: base(), role: null, envoyer: s.envoyer }).request('/api/tableaux/dossier01/taches')).status).toBe(404)
    const muet = silak({ 'taches.lister': null })
    const r = await app({ base: base(), envoyer: muet.envoyer }).request('/api/tableaux/dossier01/taches')
    expect([r.status, ((await r.json()) as Lu).code]).toEqual([502, 'injoignable'])
  })

  it('ajoute une tâche chez l’outil, d’un titre et d’un jour, sous l’identifiant du geste', async () => {
    const s = silak({ 'taches.ajouter': { corps: { tache: { ...LIGNE, titre: 'Envoyer le devis' } } } })
    const a = app({ base: base(), envoyer: s.envoyer })
    const r = await poster(a, '/api/tableaux/dossier01/taches', { id: GESTE, titre: '  Envoyer   le devis ', echeance: '2026-11-26' })
    expect(r.status).toBe(200)
    expect(((await r.json()) as Lu).tache?.titre).toBe('Envoyer le devis')
    expect(s.recus).toEqual([{ type: 'taches.ajouter', id: GESTE, personne: { sub: 'sub-42', email: 'samy@silak.fr' }, cle: CLE, tableau: 'dossier01', titre: 'Envoyer le devis', echeance: '2026-11-26' }])
    const refus = await Promise.all([
      poster(a, '/api/tableaux/dossier01/taches', { id: 'pas-un-uuid', titre: 'A' }),
      poster(a, '/api/tableaux/dossier01/taches', { id: GESTE, titre: '   ' }),
      poster(a, '/api/tableaux/dossier01/taches', { id: GESTE, titre: 'A', echeance: '2026-02-30' }),
      poster(a, '/api/tableaux/dossier01/taches', { id: GESTE, titre: 'x'.repeat(201) }),
      poster(a, '/api/tableaux/toile0001/taches', { id: GESTE, titre: 'A' }),
    ])
    expect(refus.map((x) => x.status)).toEqual([400, 400, 400, 400, 404])
    expect(s.recus).toHaveLength(1)
    const refuse = silak({ 'taches.ajouter': { statut: 422, corps: { erreur: 'no' } } })
    const r422 = await poster(app({ base: base(), envoyer: refuse.envoyer }), '/api/tableaux/dossier01/taches', { id: GESTE, titre: 'A' })
    expect([r422.status, ((await r422.json()) as Lu).code]).toEqual([422, 'refuse'])
  })

  it('coche une tâche, ou la remet à faire, chez l’outil', async () => {
    const s = silak({ 'taches.cocher': { corps: { tache: { ...LIGNE, fait: true } } } })
    const a = app({ base: base(), envoyer: s.envoyer })
    const r = await poster(a, `/api/tableaux/dossier01/taches/${LIGNE.id}`, { id: GESTE, fait: true })
    expect(r.status).toBe(200)
    expect(((await r.json()) as Lu).tache).toMatchObject({ fait: true, enRetard: false })
    expect(s.recus).toEqual([{ type: 'taches.cocher', id: GESTE, personne: { sub: 'sub-42', email: 'samy@silak.fr' }, cle: CLE, tache: LIGNE.id, fait: true }])
    expect((await poster(a, `/api/tableaux/dossier01/taches/${LIGNE.id}`, { id: GESTE, fait: 'oui' })).status).toBe(400)
    expect((await poster(a, '/api/tableaux/dossier01/taches/..%2Fx', { id: GESTE, fait: true })).status).toBe(404)
    // Une réponse sans tâche lisible : le geste n'a pas abouti.
    const vide = silak({ 'taches.cocher': { corps: {} } })
    expect((await poster(app({ base: base(), envoyer: vide.envoyer }), `/api/tableaux/dossier01/taches/${LIGNE.id}`, { id: GESTE, fait: true })).status).toBe(502)
  })
})
