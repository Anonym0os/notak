import type { Context, Hono } from 'hono'
import type { Base, Utilisateur } from './base.ts'
import type { Role } from './droits.ts'
import { type AgentRelaye, agentsRelayes, personneLiee, relayer } from './fram.ts'
import { type SourceRattachement, dossierDeLaSource } from './rattachements.ts'

/**
 * Les tâches d'une fiche, tenues par l'outil (23/11/2026) : le dossier d'une fiche d'un autre outil (un client de
 * Silak) montre les tâches que l'outil tient sur elle, et l'on y en ajoute et en coche. Rien n'est gardé ici : les
 * tâches restent chez l'outil, qui les rappelle, les sonne et les attribue comme toutes les autres. Notak relaie, au nom
 * de la personne, à la même adresse que l'agent (`agentAdresse`, signée du `secret` de la source), un corps fermé sur
 * `type` : `taches.lister`, `taches.ajouter`, `taches.cocher` (côté Silak : `agents/notak_tasks.py`).
 *
 * Une fenêtre étroite sur l'outil, pas un second éditeur de tâches : une tâche dit son titre, son jour (et son retard),
 * qui la fait et son projet ; on en ajoute une d'un titre, et d'un jour si l'on veut. Rappels, récurrence, description,
 * sous-tâches et attribution s'ouvrent chez l'outil, par le lien de chaque tâche.
 *
 * Le panneau paraît à qui lit le dossier et dont le compte est lié au SSO de l'outil ; l'outil décide du reste. Son 404
 * veut dire « pas pour cette personne » (ni compte, ni droit, ni fiche qu'elle lise) : le panneau ne paraît pas. Un outil
 * qui ne connaît pas ces types répond de même.
 */

/** Ce qu'une tâche dit d'elle-même dans le panneau. */
export interface TacheDeLOutil {
  id: string
  titre: string
  fait: boolean
  /** Son jour est passé, ou la règle de retard de l'outil (une limite dépassée). */
  enRetard: boolean
  /** Le jour où elle est prévue (`AAAA-MM-JJ`), ou `null`. */
  echeance: string | null
  /** Cochée, elle revient à son prochain jour au lieu de se fermer. */
  recurrente: boolean
  projet: string | null
  /** Le nom de qui la fait, une par personne. */
  personnes: string[]
  /** Son adresse chez l'outil, sur son origine déclarée ; `null` : aucune. */
  lien: string | null
}

/** Le panneau d'un dossier de fiche. */
export type PanneauTaches =
  | { disponible: false }
  | {
      disponible: true
      /** Le nom de l'outil (« Silak »). */
      outil: string
      taches: TacheDeLOutil[]
      /** Les tâches ouvertes de la fiche, sous-tâches comprises, comme l'outil les compte. */
      total: number
      /** Tout est là ; sinon, la suite se lit chez l'outil (`lien`). */
      complet: boolean
      /** Le jour de la personne chez l'outil (`AAAA-MM-JJ`), ou `null`. */
      aujourdhui: string | null
      /** Elle peut ajouter et cocher. */
      ecrire: boolean
      /** Les tâches de la fiche chez l'outil. */
      lien: string | null
    }

const ID_DEMANDE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ID_TACHE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const JOUR = /^\d{4}-\d{2}-\d{2}$/
/** Le titre d'une tâche, au plus ; l'outil borne de même (Silak : 200). */
export const TITRE_MAX = 200
const TACHES_MAX = 200
const NOM_MAX = 80
const LIEN_MAX = 500

type Garde = (c: Context, minimum: Role) => Promise<{ u: Utilisateur; id: string; role: Role } | Response>

const objet = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {})
const court = (x: unknown, max: number): string | null => {
  const s = typeof x === 'string' ? x.replace(/\s+/g, ' ').trim() : ''
  return s ? s.slice(0, max) : null
}

/**
 * Une adresse que l'outil donne : un chemin chez lui, qu'on pose sur son origine déclarée. Rien d'autre ne passe, ni
 * une adresse entière, ni un chemin qui partirait ailleurs (`//hôte`).
 */
export function lienDeLOutil(chemin: unknown, origine: string): string | null {
  if (typeof chemin !== 'string' || !chemin.startsWith('/') || chemin.startsWith('//') || chemin.length > LIEN_MAX) return null
  try {
    const u = new URL(chemin, origine)
    return u.origin === new URL(origine).origin ? u.href : null
  } catch {
    return null
  }
}

/** Une tâche telle que l'outil la dit, revue : un identifiant et un titre, ou rien ; le reste borné. */
export function tacheLue(brute: unknown, origine: string): TacheDeLOutil | null {
  const o = objet(brute)
  const titre = court(o.titre, TITRE_MAX)
  if (typeof o.id !== 'string' || !ID_TACHE.test(o.id) || !titre) return null
  return {
    id: o.id,
    titre,
    fait: o.fait === true,
    enRetard: o.en_retard === true && o.fait !== true,
    echeance: typeof o.echeance === 'string' && JOUR.test(o.echeance) ? o.echeance : null,
    recurrente: o.recurrente === true,
    projet: court(o.projet, NOM_MAX),
    personnes: Array.isArray(o.personnes) ? o.personnes.flatMap((p) => court(p, NOM_MAX) ?? []).slice(0, 10) : [],
    lien: lienDeLOutil(o.lien, origine),
  }
}

/** La liste que l'outil rend, revue : ce qui ne se lit pas est laissé de côté, jamais deviné. */
export function listeLue(corps: Record<string, unknown>, outil: string, origine: string): PanneauTaches {
  const taches = Array.isArray(corps.taches) ? corps.taches.slice(0, TACHES_MAX).flatMap((t) => tacheLue(t, origine) ?? []) : []
  const total = typeof corps.total === 'number' && Number.isInteger(corps.total) && corps.total >= 0 ? corps.total : taches.length
  return {
    disponible: true,
    outil,
    taches,
    total,
    complet: corps.complet !== false,
    aujourdhui: typeof corps.aujourdhui === 'string' && JOUR.test(corps.aujourdhui) ? corps.aujourdhui : null,
    ecrire: corps.ecrire === true,
    lien: lienDeLOutil(objet(corps.societe).lien, origine),
  }
}

/** Un jour civil réel (`AAAA-MM-JJ`) : `2026-02-30` n'en est pas un. */
export function jourValable(jour: string): boolean {
  if (!JOUR.test(jour)) return false
  const d = new Date(`${jour}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === jour
}

/**
 * Les routes du panneau, sur un dossier qu'on lit :
 *
 * - `GET /api/tableaux/:id/taches` : le panneau, `{ disponible: false }` s'il n'est pas pour ce dossier ou cette personne ;
 * - `POST /api/tableaux/:id/taches` `{ id, titre, echeance? }` : une tâche ajoutée chez l'outil ;
 * - `POST /api/tableaux/:id/taches/:tache` `{ id, fait }` : une tâche cochée, ou remise à faire.
 *
 * `id` est un UUID neuf par geste, le même quand l'app renvoie le geste : l'outil y répond une fois.
 */
export function routesTaches(
  app: Hono,
  o: {
    garde: Garde
    base: Base
    sources: () => readonly SourceRattachement[]
    maintenant: () => number
    /** À défaut, ceux des sources, lus à l'enregistrement. */
    agents?: readonly AgentRelaye[]
    envoyer?: typeof fetch
  },
): void {
  const agents = o.agents ?? agentsRelayes(o.sources())
  const sansCache = { 'cache-control': 'no-store' }
  const introuvable = (c: Context) => c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)

  /** La personne, le dossier, sa fiche et l'outil qui la tient ; ou la réponse à rendre. `null` : pas de panneau ici. */
  const entrer = async (c: Context) => {
    const g = await o.garde(c, 'lecture')
    if (g instanceof Response) return g
    const sources = o.sources()
    const fiche = o.base.rattachementsDe([g.id]).find((r) => r.cle !== '' && r.tableau === g.id && r.corbeille === null && dossierDeLaSource(sources, r))
    const source = fiche ? sources.find((s) => s.source === fiche.source) : undefined
    const agent = source ? agents.find((a) => a.source === source.source) : undefined
    const personne = agent ? personneLiee(o.base, g.u, agent.fournisseur) : null
    if (!fiche || !source || !agent || !personne) return null
    return { ...g, cle: fiche.cle, source, agent, personne }
  }

  /** Une réponse de l'outil qui n'est pas un succès. */
  const echec = (c: Context, nom: string, r: { statut: number } | null) => {
    if (r === null) return c.json({ erreur: `${nom} est injoignable pour l’instant.`, code: 'injoignable' }, 502)
    if (r.statut === 404) return introuvable(c)
    if (r.statut === 409) return c.json({ erreur: `${nom} a déjà reçu ce geste autrement.`, code: 'deja_recu' }, 409)
    if (r.statut === 422) return c.json({ erreur: `${nom} refuse ce geste.`, code: 'refuse' }, 422)
    return c.json({ erreur: `${nom} n’a pas pu répondre.`, code: 'injoignable' }, 502)
  }

  /** La tâche que l'outil rend après un geste, revue ; sans elle, le geste n'a pas abouti. */
  const apresGeste = (c: Context, e: { source: SourceRattachement; agent: AgentRelaye }, r: Awaited<ReturnType<typeof relayer>>) => {
    if (!r || r.statut !== 200 || !r.corps) return echec(c, e.source.nom, r)
    const tache = tacheLue(objet(r.corps).tache, e.source.origine)
    return tache ? c.json({ tache }, 200, sansCache) : echec(c, e.source.nom, { statut: 502 })
  }

  app.get('/api/tableaux/:id/taches', async (c) => {
    const e = await entrer(c)
    if (e instanceof Response) return e
    if (e === null) return c.json({ disponible: false }, 200, sansCache)
    const r = await relayer(e.agent, { type: 'taches.lister', personne: e.personne, cle: e.cle }, o.maintenant(), o.envoyer)
    // L'outil ne connaît pas cette personne, ne lui ouvre pas ses tâches, ou ne sait pas ce qu'on lui demande.
    if (r?.statut === 404) return c.json({ disponible: false }, 200, sansCache)
    if (!r || r.statut !== 200 || !r.corps) return echec(c, e.source.nom, r)
    return c.json(listeLue(r.corps, e.source.nom, e.source.origine), 200, sansCache)
  })

  app.post('/api/tableaux/:id/taches', async (c) => {
    const e = await entrer(c)
    if (e instanceof Response) return e
    if (e === null) return introuvable(c)
    const b = objet(await c.req.json().catch(() => null))
    const id = typeof b.id === 'string' && ID_DEMANDE.test(b.id) ? b.id.toLowerCase() : null
    const titre = typeof b.titre === 'string' ? b.titre.replace(/\s+/g, ' ').trim() : ''
    const echeance = b.echeance === undefined || b.echeance === null ? null : typeof b.echeance === 'string' && jourValable(b.echeance) ? b.echeance : undefined
    if (!id) return c.json({ erreur: 'identifiant de geste invalide', code: 'id_invalide' }, 400)
    if (!titre) return c.json({ erreur: 'titre vide', code: 'titre_vide' }, 400)
    if (titre.length > TITRE_MAX) return c.json({ erreur: 'titre trop long', code: 'titre_trop_long' }, 400)
    if (echeance === undefined) return c.json({ erreur: 'jour invalide', code: 'jour_invalide' }, 400)
    const corps = { type: 'taches.ajouter', id, personne: e.personne, cle: e.cle, tableau: e.id, titre, ...(echeance ? { echeance } : {}) }
    return apresGeste(c, e, await relayer(e.agent, corps, o.maintenant(), o.envoyer))
  })

  app.post('/api/tableaux/:id/taches/:tache', async (c) => {
    const e = await entrer(c)
    if (e instanceof Response) return e
    const tache = c.req.param('tache') ?? ''
    if (e === null || !ID_TACHE.test(tache)) return introuvable(c)
    const b = objet(await c.req.json().catch(() => null))
    const id = typeof b.id === 'string' && ID_DEMANDE.test(b.id) ? b.id.toLowerCase() : null
    if (!id) return c.json({ erreur: 'identifiant de geste invalide', code: 'id_invalide' }, 400)
    if (typeof b.fait !== 'boolean') return c.json({ erreur: 'fait ou pas fait', code: 'fait_invalide' }, 400)
    const corps = { type: 'taches.cocher', id, personne: e.personne, cle: e.cle, tache, fait: b.fait }
    return apresGeste(c, e, await relayer(e.agent, corps, o.maintenant(), o.envoyer))
  })
}
