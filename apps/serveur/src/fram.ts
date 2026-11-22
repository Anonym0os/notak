import { randomUUID } from 'node:crypto'
import type { Context, Hono } from 'hono'
import type { Base, Utilisateur } from './base.ts'
import type { Role } from './droits.ts'
import { AGENT_PAR_DEFAUT, type SourceRattachement, signer } from './rattachements.ts'

/**
 * Solliciter l'agent d'un outil depuis un tableau (21/11/2026) : la personne écrit à l'agent (Fram, pour Silak) dans le
 * panneau d'un tableau ; Notak relaie sa demande, signée du secret de la source, à l'outil, où restent le cerveau de
 * l'agent, sa mémoire, ses réglages et ses données. L'agent répond, et agit sur le tableau par la porte des agents
 * (docs/AGENTS.md) : le tableau change sous les yeux de la personne, par la synchro. Rien n'est gardé ici : le fil des
 * échanges est celui de l'outil, relu à chaque ouverture du panneau.
 *
 * Allumé pour une source de `NOTAK_RATTACHEMENTS` qui ouvre la porte des agents (`agents`, avec son `secret`) et dit où
 * relayer (`agentAdresse`). Sans elle, les routes répondent 404 et le panneau ne paraît pas. La personne doit pouvoir
 * modifier le tableau et avoir son compte lié au SSO de l'outil (`fournisseur`, à défaut le nom de la source) : c'est
 * ce lien qui la désigne là-bas, par son sujet, et à défaut par son adresse.
 *
 * Le contrat côté outil (Silak : `agents/notak_desk.py`) : `POST <agentAdresse>`, signé `Notak-Signature`, un corps
 * fermé sur `type` : `fram.demander` (rend `tour`), `fram.lire` (l'état et la réponse), `fram.fil` (les échanges).
 *
 * La bulle paraît à qui lit le tableau (le 22/11/2026, avant il fallait pouvoir le modifier) : l'agent agit avec les
 * droits de la personne, et la porte des agents refuse ce qu'elle ne pourrait pas faire. `fram.lire` peut dire ce que le
 * tour a créé (`crees`) et ce que l'agent veut ouvrir (`ouvrir`) : Notak en refait les adresses et tait ce que la
 * personne ne lit pas. Une demande faite depuis une page ou une carte ouverte en grand (`ouvert`) la porte en tête de
 * sa sélection, avec son lien, sans rien changer aux formes de l'outil.
 */

/** L'agent d'une source, tel que ce module le relaie. */
export interface AgentRelaye {
  source: string
  /** Son nom, tel que le panneau le montre (« Fram »). */
  nom: string
  /** Où relayer les demandes : en https, ou en http vers cette machine (un essai). */
  adresse: string
  /** Le fournisseur SSO dont les comptes liés désignent les personnes. */
  fournisseur: string
  secret: string
}

const NOM_MAX = 40
/** Ce qu'on écrit à l'agent, au plus ; l'outil borne de même. */
export const MESSAGE_MAX = 8000
const SELECTION_MAX = 50
const EXTRAIT_MAX = 300
/** Ce qu'une réponse de l'outil peut peser : le fil des derniers échanges tient bien en dessous. */
const REPONSE_MAX = 512 * 1024
const DELAI_MS = 15_000
const ID_TOUR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ID_ELEMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{5,63}$/
const ID_TABLEAU = /^[A-Za-z0-9_-]{8,64}$/
/** Ce qu'un tour dit avoir créé, au plus. */
const CREES_MAX = 20

/** Une chose que la personne peut ouvrir dans l'app : son adresse, son titre et son genre (`page`, `toile`, `dossier`…). */
export interface Ouvrable {
  adresse: string
  titre: string
  type: string
}

/** Un tableau, ou un élément qu'il porte. */
export interface Lieu {
  tableau: string
  element?: string | null
}

/** Ce que la personne peut ouvrir de ce lieu, s'il existe et qu'elle le lit ; `null` sinon. */
export type Ouvrabilite = (u: Utilisateur, lieu: Lieu) => Promise<Ouvrable | null>

/** Un lieu dit par l'outil : un tableau, et peut-être un élément, d'identifiants bien formés ; `null` sinon. */
function lieuLu(brut: unknown): Lieu | null {
  const o = brut && typeof brut === 'object' ? (brut as Record<string, unknown>) : {}
  if (typeof o.tableau !== 'string' || !ID_TABLEAU.test(o.tableau)) return null
  if (o.element !== undefined && o.element !== null && (typeof o.element !== 'string' || !ID_ELEMENT.test(o.element))) return null
  return { tableau: o.tableau, ...(typeof o.element === 'string' ? { element: o.element } : {}) }
}

/**
 * Ce que le tour a créé, tel que l'outil le dit, revu ici : chaque chose que la personne lit, avec son titre, son genre
 * et son adresse refaits par Notak (pas ceux de l'outil), sans doublon ; le reste est tu.
 */
export async function creesLus(brute: unknown, ouvrable: (lieu: Lieu) => Promise<Ouvrable | null>): Promise<(Ouvrable & Lieu)[]> {
  if (!Array.isArray(brute)) return []
  const vus = new Set<string>()
  const sortie: (Ouvrable & Lieu)[] = []
  for (const x of brute.slice(0, CREES_MAX)) {
    const lieu = lieuLu(x)
    if (!lieu) continue
    const cle = `${lieu.tableau}/${lieu.element ?? ''}`
    if (vus.has(cle)) continue
    vus.add(cle)
    const o = await ouvrable(lieu)
    if (!o) continue
    const dit = (x as { titre?: unknown }).titre
    const titre = o.titre || (typeof dit === 'string' ? dit.replace(/\s+/g, ' ').trim().slice(0, 200) : '')
    sortie.push({ type: o.type, titre, tableau: lieu.tableau, ...(lieu.element ? { element: lieu.element } : {}), adresse: o.adresse })
  }
  return sortie
}

/** Ce que l'agent veut ouvrir, revu de même ; `null` : rien, ou rien que la personne lise. */
export async function ouvrirLu(brut: unknown, ouvrable: (lieu: Lieu) => Promise<Ouvrable | null>): Promise<(Ouvrable & Lieu) | null> {
  const lieu = lieuLu(brut)
  const o = lieu ? await ouvrable(lieu) : null
  return lieu && o ? { type: o.type, titre: o.titre, tableau: lieu.tableau, ...(lieu.element ? { element: lieu.element } : {}), adresse: o.adresse } : null
}

/** La page ou la carte ouverte en grand d'où l'on écrit, en tête de la sélection : ce qu'elle est, et son lien. */
export function enTeteOuverte(id: string, o: Ouvrable): { id: string; texte: string } {
  const genre = o.type === 'page' ? 'La page' : o.type === 'carte_mentale' ? 'La carte mentale' : 'L’élément'
  const fin = ` est ouverte en grand : ${o.adresse}`
  const place = Math.max(10, EXTRAIT_MAX - genre.length - fin.length - 4)
  const titre = o.titre.length > place ? `${o.titre.slice(0, place - 1)}…` : o.titre
  return { id, texte: `${genre} « ${titre} »${fin}`.slice(0, EXTRAIT_MAX) }
}

/**
 * Les agents à relayer : les sources qui ouvrent la porte des agents, avec leur secret, et disent où relayer. Tout est
 * lu et validé une fois, avec le reste de la source, par `sourcesDe` (`rattachements.ts`).
 */
export function agentsRelayes(sources: readonly SourceRattachement[]): AgentRelaye[] {
  return sources.flatMap((s) =>
    s.agents && s.secret && s.agentAdresse
      ? [{ source: s.source, nom: (s.agent ?? AGENT_PAR_DEFAUT).slice(0, NOM_MAX), adresse: s.agentAdresse, fournisseur: s.fournisseur ?? s.source, secret: s.secret }]
      : [],
  )
}

/** Le sujet et l'adresse de la personne chez l'outil : son compte lié au SSO du fournisseur. `null` : pas liée. */
export function personneLiee(base: Base, u: Utilisateur, fournisseur: string): { sub: string; email: string } | null {
  const ligne = base.db.prepare('SELECT accountId FROM account WHERE userId = ? AND providerId = ? LIMIT 1').get(u.id, fournisseur) as { accountId?: unknown } | undefined
  return typeof ligne?.accountId === 'string' && ligne.accountId ? { sub: ligne.accountId, email: u.email } : null
}

/** La sélection envoyée par le panneau : des éléments du tableau, chacun avec ce qu'il dit, bornés. */
export function selectionLue(brute: unknown): { id: string; texte: string }[] {
  if (!Array.isArray(brute)) return []
  return brute.slice(0, SELECTION_MAX).flatMap((e) => {
    const o = e && typeof e === 'object' ? (e as Record<string, unknown>) : {}
    const id = typeof o.id === 'string' ? o.id : ''
    const texte = typeof o.texte === 'string' ? o.texte.replace(/\s+/g, ' ').trim().slice(0, EXTRAIT_MAX) : ''
    return ID_ELEMENT.test(id) ? [{ id, texte: texte || 'élément' }] : []
  })
}

type Reponse = { statut: number; corps: Record<string, unknown> | null }

/** Envoie un corps à l'agent, signé ; rend son statut et son JSON (borné), ou `null` s'il est injoignable. */
export async function relayer(agent: AgentRelaye, corps: Record<string, unknown>, maintenant: number, envoyer: typeof fetch = fetch): Promise<Reponse | null> {
  const texte = JSON.stringify(corps)
  try {
    const r = await envoyer(agent.adresse, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'notak-signature': signer(agent.secret, texte, maintenant) },
      body: texte,
      redirect: 'error',
      signal: AbortSignal.timeout(DELAI_MS),
    })
    const lu = await r.text()
    if (lu.length > REPONSE_MAX) return { statut: 502, corps: null }
    let json: unknown = null
    try {
      json = lu ? JSON.parse(lu) : null
    } catch {
      json = null
    }
    return { statut: r.status, corps: json && typeof json === 'object' && !Array.isArray(json) ? (json as Record<string, unknown>) : null }
  } catch {
    return null
  }
}

type Garde = (c: Context, minimum: Role) => Promise<{ u: Utilisateur; id: string; role: Role } | Response>

/**
 * Les routes du panneau, sur un tableau qu'on lit :
 *
 * - `GET /api/tableaux/:id/agent` : l'agent est-il là pour cette personne, et le fil de ses échanges sur ce tableau ;
 * - `POST /api/tableaux/:id/agent` `{ message, selection? }` : une demande, qui rend le tour à suivre ;
 * - `GET /api/tableaux/:id/agent/tours/:tour` : où en est ce tour, et la réponse une fois au repos.
 * - `POST /api/tableaux/:id/agent/tours/:tour/cartes` `{ cartes: [{ id, accord, toujours }] }` : les cartes d'un tour
 *   arrêté sur elles, répondues depuis le panneau (`fram.decider`).
 */
export function routesAgent(
  app: Hono,
  o: {
    garde: Garde
    base: Base
    sources: () => readonly SourceRattachement[]
    maintenant: () => number
    origine?: string | undefined
    /** À défaut, ceux des sources, lus à l'enregistrement. */
    agents?: readonly AgentRelaye[]
    envoyer?: typeof fetch
    /** Ce que la personne peut ouvrir (`app.ts`) ; sans lui, rien de ce que l'outil dit avoir créé ou vouloir ouvrir ne passe. */
    ouvrable?: Ouvrabilite
  },
): void {
  const agents = o.agents ?? agentsRelayes(o.sources())
  const agent = agents[0]
  const introuvable = (c: Context) => c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
  const ouvrablePour = (u: Utilisateur) => (lieu: Lieu) => (o.ouvrable ? o.ouvrable(u, lieu) : Promise.resolve(null))

  /** La personne, le tableau et l'agent ; ou la réponse à rendre. La bulle paraît à qui lit le tableau. */
  const entrer = async (c: Context) => {
    if (!agent) return introuvable(c)
    const g = await o.garde(c, 'lecture')
    if (g instanceof Response) return g
    const personne = personneLiee(o.base, g.u, agent.fournisseur)
    return { ...g, personne }
  }

  /** Une réponse de l'outil qui n'est pas un succès : la porte fermée (rubrique cachée, compte inconnu) n'est pas une panne. */
  const echec = (c: Context, r: Reponse | null) => {
    if (r === null) return c.json({ erreur: `${agent!.nom} est injoignable pour l’instant.`, code: 'injoignable' }, 502)
    if (r.statut === 404) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    if (r.statut === 409) return c.json({ erreur: `${agent!.nom} ne peut pas prendre ce message maintenant.`, code: 'occupe' }, 409)
    return c.json({ erreur: `${agent!.nom} n’a pas pu répondre.`, code: 'injoignable' }, 502)
  }

  app.get('/api/tableaux/:id/agent', async (c) => {
    const g = await entrer(c)
    if (g instanceof Response) return g
    if (!g.personne) return c.json({ agent: agent!.nom, disponible: false }, 200, { 'cache-control': 'no-store' })
    const r = await relayer(agent!, { type: 'fram.fil', personne: g.personne, tableau: g.id }, o.maintenant(), o.envoyer)
    // L'outil ne connaît pas cette personne, ou ne lui ouvre pas encore l'agent : le panneau ne paraît pas.
    if (r?.statut === 404) return c.json({ agent: agent!.nom, disponible: false }, 200, { 'cache-control': 'no-store' })
    if (!r || r.statut !== 200 || !r.corps) return echec(c, r)
    return c.json({ agent: agent!.nom, disponible: true, echanges: r.corps.echanges ?? [], tour: r.corps.tour ?? null }, 200, { 'cache-control': 'no-store' })
  })

  app.post('/api/tableaux/:id/agent', async (c) => {
    const g = await entrer(c)
    if (g instanceof Response) return g
    if (!g.personne) return introuvable(c)
    const b = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    const message = typeof b?.message === 'string' ? b.message.trim() : ''
    if (!message) return c.json({ erreur: 'message vide', code: 'message_vide' }, 400)
    if (message.length > MESSAGE_MAX) return c.json({ erreur: 'message trop long', code: 'message_trop_long' }, 400)
    const titre = o.base.tableau(g.id)?.titre?.trim() || 'Sans titre'
    // Le lien du tableau, comme l'app l'ouvre : un dossier dans la bibliothèque, une toile en toile.
    const ici = await ouvrablePour(g.u)({ tableau: g.id })
    const lien = ici?.adresse ?? (o.origine ? `${o.origine.replace(/\/$/, '')}/t/${encodeURIComponent(g.id)}` : `/t/${encodeURIComponent(g.id)}`)
    // La page ou la carte ouverte en grand d'où l'on écrit : en tête de la sélection, avec son lien.
    let selection = selectionLue(b?.selection)
    const ouvert = typeof b?.ouvert === 'string' && ID_ELEMENT.test(b.ouvert) ? b.ouvert : null
    const lu = ouvert ? await ouvrablePour(g.u)({ tableau: g.id, element: ouvert }) : null
    if (ouvert && lu) selection = [enTeteOuverte(ouvert, lu), ...selection.filter((x) => x.id !== ouvert)].slice(0, SELECTION_MAX)
    const corps = {
      type: 'fram.demander',
      id: randomUUID(),
      personne: g.personne,
      tableau: { id: g.id, titre: titre.slice(0, 200), lien },
      selection,
      message,
    }
    const r = await relayer(agent!, corps, o.maintenant(), o.envoyer)
    if (!r || r.statut !== 200 || typeof r.corps?.tour !== 'string') return echec(c, r)
    return c.json({ tour: r.corps.tour, etat: r.corps.etat ?? 'queued' }, 202)
  })

  app.get('/api/tableaux/:id/agent/tours/:tour', async (c) => {
    const g = await entrer(c)
    if (g instanceof Response) return g
    const tour = c.req.param('tour') ?? ''
    if (!g.personne || !ID_TOUR.test(tour)) return introuvable(c)
    const r = await relayer(agent!, { type: 'fram.lire', personne: g.personne, tableau: g.id, tour }, o.maintenant(), o.envoyer)
    if (!r || r.statut !== 200 || !r.corps) return echec(c, r)
    const { etat, fini, texte, echec: raison, cartes } = r.corps
    const ouvrable = ouvrablePour(g.u)
    return c.json(
      {
        tour,
        etat,
        fini: fini === true,
        texte: typeof texte === 'string' ? texte : null,
        echec: raison ?? null,
        cartes: cartesLues(cartes),
        crees: await creesLus(r.corps.crees, ouvrable),
        ouvrir: await ouvrirLu(r.corps.ouvrir, ouvrable),
      },
      200,
      { 'cache-control': 'no-store' },
    )
  })

  // Les cartes d'un tour arrêté sur elles, répondues depuis le panneau : l'outil les décide par sa propre porte.
  app.post('/api/tableaux/:id/agent/tours/:tour/cartes', async (c) => {
    const g = await entrer(c)
    if (g instanceof Response) return g
    const tour = c.req.param('tour') ?? ''
    if (!g.personne || !ID_TOUR.test(tour)) return introuvable(c)
    const b = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    const cartes = reponsesLues(b?.cartes)
    if (cartes.length === 0) return c.json({ erreur: 'aucune carte', code: 'cartes_vides' }, 400)
    const r = await relayer(agent!, { type: 'fram.decider', id: randomUUID(), personne: g.personne, tableau: g.id, tour, cartes }, o.maintenant(), o.envoyer)
    if (!r || r.statut !== 200 || !r.corps) return echec(c, r)
    return c.json({ tour, etat: r.corps.etat ?? 'queued' }, 202)
  })
}

const ID_CARTE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/

/** Les cartes qu'un tour attend, telles que l'outil les dit : un identifiant, une phrase, et si c'est définitif. */
export function cartesLues(brute: unknown): { id: string; resume: string; definitif: boolean }[] {
  if (!Array.isArray(brute)) return []
  return brute.slice(0, 20).flatMap((e) => {
    const o = e && typeof e === 'object' ? (e as Record<string, unknown>) : {}
    return typeof o.id === 'string' && ID_CARTE.test(o.id) ? [{ id: o.id, resume: typeof o.resume === 'string' ? o.resume.slice(0, 500) : '', definitif: o.definitif === true }] : []
  })
}

/** Les réponses du panneau : une carte, oui ou non, et « toujours » (pour la conversation de ce tableau). */
export function reponsesLues(brute: unknown): { id: string; accord: boolean; toujours: boolean }[] {
  if (!Array.isArray(brute)) return []
  return brute.slice(0, 20).flatMap((e) => {
    const o = e && typeof e === 'object' ? (e as Record<string, unknown>) : {}
    return typeof o.id === 'string' && ID_CARTE.test(o.id) && typeof o.accord === 'boolean' ? [{ id: o.id, accord: o.accord, toujours: o.accord && o.toujours === true }] : []
  })
}
