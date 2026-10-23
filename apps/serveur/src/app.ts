import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { Hocuspocus } from '@hocuspocus/server'
import { getConnInfo } from '@hono/node-server/conninfo'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { apercuDePage } from './apercu.ts'
import type { Base, Utilisateur } from './base.ts'
import { ErreurCompte, inscrire, normaliserEmail } from './comptes.ts'
import type { Limiteur } from './debit.ts'
import { type Role, auMoins, role, roleHerite } from './droits.ts'
import { hacher, verifier } from './motsDePasse.ts'
import { DUREE_SESSION_S, NOM_COOKIE, cookieEfface, cookieSession, empreinteDe, lireCookie, nouveauJeton } from './sessions.ts'
import { nomDuDocument } from './synchro.ts'

export interface Contexte {
  base: Base
  dossierFichiers: string
  limiteur: Limiteur
  maintenant: () => number
  /** Lu à chaque requête : le serveur de synchro naît après l'application. */
  synchro: () => Hocuspocus | null
  /** Derrière un relais de confiance : l'adresse du client vient de `X-Forwarded-For`. */
  relaisFiable: boolean
  cookieSecurise: boolean
  /** Le build de `apps/web`, servi à côté de l'API ; absent en développement, où Vite s'en charge. */
  dossierWeb?: string
}

export const FICHIER_MAX = 25 * 1024 * 1024
const ID_TABLEAU = /^[A-Za-z0-9_-]{8,64}$/
const ID_FICHIER = /^[0-9a-f-]{36}$/

const moi = (u: Utilisateur) => ({ id: u.id, email: u.email, nom: u.nom, couleur: u.couleur, racine: u.racine })

export function creerApp(ctx: Contexte): Hono {
  const { base } = ctx
  const app = new Hono()

  const utilisateurCourant = (c: Context): Utilisateur | null => {
    const jeton = lireCookie(c.req.header('cookie'), NOM_COOKIE)
    return jeton ? base.utilisateurDeSession(empreinteDe(jeton), ctx.maintenant()) : null
  }

  const adresseIp = (c: Context): string => {
    if (ctx.relaisFiable) {
      const transmis = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
      if (transmis) return transmis
    }
    try {
      return getConnInfo(c).remote.address ?? 'inconnue'
    } catch {
      return 'inconnue'
    }
  }

  const limiter = (c: Context, route: string): Response | null => {
    const cle = `${route}:${adresseIp(c)}`
    const maintenant = ctx.maintenant()
    if (ctx.limiteur.autoriser(cle, maintenant)) return null
    const secondes = Math.ceil(ctx.limiteur.attente(cle, maintenant) / 1000)
    return c.json({ erreur: 'trop d’essais' }, 429, { 'retry-after': String(secondes) })
  }

  const corps = async (c: Context): Promise<Record<string, unknown> | null> => {
    try {
      const valeur: unknown = await c.req.json()
      return valeur && typeof valeur === 'object' && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  const texte = (v: unknown): string => (typeof v === 'string' ? v : '')

  const ouvrirSession = (c: Context, u: Utilisateur) => {
    const { jeton, empreinte } = nouveauJeton()
    base.creerSession(empreinte, u.id, ctx.maintenant() + DUREE_SESSION_S * 1000)
    c.header('set-cookie', cookieSession(jeton, ctx.cookieSecurise))
  }

  // Une empreinte réelle, pour que « adresse inconnue » coûte autant de temps que « mauvais mot de passe ».
  const empreinteLeurre = hacher('leurre')

  app.post('/api/inscription', async (c) => {
    const refus = limiter(c, 'inscription')
    if (refus) return refus
    const b = await corps(c)
    if (!b) return c.json({ erreur: 'corps invalide' }, 400)
    try {
      const u = await inscrire(base, { email: texte(b.email), motDePasse: texte(b.motDePasse), nom: texte(b.nom) })
      ouvrirSession(c, u)
      return c.json(moi(u), 201)
    } catch (e) {
      if (e instanceof ErreurCompte) return c.json({ erreur: e.message }, e.code === 'existe' ? 409 : 400)
      throw e
    }
  })

  app.post('/api/connexion', async (c) => {
    const refus = limiter(c, 'connexion')
    if (refus) return refus
    const b = await corps(c)
    const u = b ? base.utilisateurParEmail(normaliserEmail(texte(b.email))) : null
    const bon = await verifier(u?.hash ?? (await empreinteLeurre), texte(b?.motDePasse))
    if (!u || !bon) return c.json({ erreur: 'identifiants incorrects' }, 401)
    ouvrirSession(c, u)
    return c.json(moi(u), 200)
  })

  app.post('/api/deconnexion', (c) => {
    const jeton = lireCookie(c.req.header('cookie'), NOM_COOKIE)
    if (jeton) base.supprimerSession(empreinteDe(jeton))
    c.header('set-cookie', cookieEfface(ctx.cookieSecurise))
    return c.body(null, 204)
  })

  app.get('/api/moi', (c) => {
    const u = utilisateurCourant(c)
    return u ? c.json(moi(u)) : c.json({ erreur: 'non connecté' }, 401)
  })

  // ---- Tableaux ----

  /** Le rôle hérité : un accès donné sur un tableau vaut pour tout ce qu'il contient. */
  const roleSur = (utilisateur: string, id: string) =>
    roleHerite((t) => base.acces(t), (t) => base.tableau(t)?.parent ?? null, utilisateur, id)
  /** Ferme les connexions ouvertes sur un tableau et ses descendants : chacun y relira son rôle. */
  const fermerConnexions = (id: string) => {
    for (const t of [id, ...base.descendants(id)]) ctx.synchro()?.closeConnections(nomDuDocument(t))
  }

  app.post('/api/tableaux', async (c) => {
    const u = utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté' }, 401)
    const b = await corps(c)
    const id = texte(b?.id)
    const titre = texte(b?.titre).slice(0, 200)
    const parent = typeof b?.parent === 'string' && b.parent ? b.parent : null
    if (!ID_TABLEAU.test(id)) return c.json({ erreur: 'id invalide' }, 400)

    const existant = base.tableau(id)
    if (existant) {
      if (roleSur(u.id, id) !== 'proprietaire') return c.json({ erreur: 'id pris' }, 409)
      return c.json({ id, titre: existant.titre, role: 'proprietaire' }, 201)
    }
    // Placé sous un parent qu'on peut éditer, le tableau en hérite les accès, présents et à venir.
    const heritage = parent !== null && auMoins(roleSur(u.id, parent), 'edition')
    base.transaction(() => {
      base.creerTableau({ id, titre, proprietaire: u.id, parent: heritage ? parent : null })
      base.definirAcces({ tableau: id, utilisateur: u.id, role: 'proprietaire' })
    })
    return c.json({ id, titre, role: 'proprietaire' }, 201)
  })

  app.get('/api/tableaux', (c) => {
    const u = utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté' }, 401)
    return c.json(base.tableauxAccessibles(u.id).filter((t) => t.id !== u.racine))
  })

  /** Le tableau, et l'utilisateur s'il atteint au moins `minimum` ; sinon la réponse d'erreur à rendre. */
  const garde = (c: Context, minimum: Role): { u: Utilisateur; id: string } | Response => {
    const u = utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté' }, 401)
    const id = c.req.param('id') ?? ''
    const droit = roleSur(u.id, id)
    // Un tableau qu'on ne peut pas voir n'existe pas.
    if (droit === null) return c.json({ erreur: 'introuvable' }, 404)
    if (!auMoins(droit, minimum)) return c.json({ erreur: 'interdit' }, 403)
    return { u, id }
  }

  app.get('/api/tableaux/:id/acces', (c) => {
    const g = garde(c, 'lecture')
    if (g instanceof Response) return g
    // Les accès du tableau et ceux de ses ancêtres ; `herite` : donné plus haut, il se retire là-haut.
    const chaine: string[] = []
    for (let t: string | null = g.id; t !== null && !chaine.includes(t); t = base.tableau(t)?.parent ?? null) chaine.push(t)
    const meilleurs = new Map<string, { role: Role; herite: boolean }>()
    for (const t of chaine) {
      for (const a of base.acces(t)) {
        const r = roleSur(a.utilisateur, g.id)
        if (r && !meilleurs.has(a.utilisateur)) meilleurs.set(a.utilisateur, { role: r, herite: role(base.acces(g.id), a.utilisateur, g.id) !== r })
      }
    }
    const membres = [...meilleurs].flatMap(([id, { role: r, herite }]) => {
      const m = base.utilisateurParId(id)
      return m ? [{ utilisateur: m.id, email: m.email, nom: m.nom, role: r, enAttente: false, herite }] : []
    })
    const emails = new Set<string>()
    const attente = chaine.flatMap((t) =>
      base.invitations(t).flatMap((i) => {
        if (emails.has(i.email)) return []
        emails.add(i.email)
        return [{ email: i.email, role: i.role, enAttente: true, herite: t !== g.id }]
      }),
    )
    return c.json([...membres, ...attente])
  })

  app.post('/api/tableaux/:id/partage', async (c) => {
    const g = garde(c, 'proprietaire')
    if (g instanceof Response) return g
    const b = await corps(c)
    const email = normaliserEmail(texte(b?.email))
    const nouveau = b?.role
    if (!email || (nouveau !== 'edition' && nouveau !== 'lecture')) return c.json({ erreur: 'demande invalide' }, 400)
    const cible = base.utilisateurParEmail(email)
    if (cible) {
      const avant = role(base.acces(g.id), cible.id, g.id)
      if (avant === 'proprietaire') return c.json({ erreur: 'propriétaire' }, 409)
      base.definirAcces({ tableau: g.id, utilisateur: cible.id, role: nouveau })
      if (avant !== null && avant !== nouveau) fermerConnexions(g.id)
    } else {
      base.definirInvitation({ tableau: g.id, email, role: nouveau })
    }
    return c.json({ email, role: nouveau, enAttente: !cible })
  })

  app.delete('/api/tableaux/:id/partage', async (c) => {
    const g = garde(c, 'proprietaire')
    if (g instanceof Response) return g
    const b = await corps(c)
    const email = normaliserEmail(texte(b?.email))
    if (!email) return c.json({ erreur: 'demande invalide' }, 400)
    const cible = base.utilisateurParEmail(email)
    const acces = base.acces(g.id)
    if (cible && role(acces, cible.id, g.id)) {
      const proprietaires = acces.filter((a) => a.role === 'proprietaire')
      if (proprietaires.length === 1 && proprietaires[0]!.utilisateur === cible.id) return c.json({ erreur: 'dernier propriétaire' }, 409)
      base.retirerAcces(g.id, cible.id)
      fermerConnexions(g.id)
    } else if (!base.retirerInvitation(g.id, email)) {
      return c.json({ erreur: 'introuvable' }, 404)
    }
    return c.body(null, 204)
  })

  // ---- Fichiers ----

  app.post('/api/fichiers', async (c) => {
    const u = utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté' }, 401)
    const annonce = Number(c.req.header('content-length') ?? 0)
    if (annonce > FICHIER_MAX) return c.json({ erreur: 'trop gros' }, 413)
    const flux = c.req.raw.body
    if (!flux) return c.json({ erreur: 'fichier vide' }, 400)

    const morceaux: Uint8Array[] = []
    let taille = 0
    const lecteur = flux.getReader()
    for (;;) {
      const { done, value } = await lecteur.read()
      if (done) break
      taille += value.length
      if (taille > FICHIER_MAX) {
        void lecteur.cancel().catch(() => {})
        return c.json({ erreur: 'trop gros' }, 413)
      }
      morceaux.push(value)
    }
    if (taille === 0) return c.json({ erreur: 'fichier vide' }, 400)

    const id = randomUUID()
    const type = (c.req.header('content-type') ?? 'application/octet-stream').slice(0, 200)
    await mkdir(ctx.dossierFichiers, { recursive: true })
    await writeFile(join(ctx.dossierFichiers, id), Buffer.concat(morceaux))
    try {
      base.creerFichier({ id, type, taille, auteur: u.id })
    } catch (e) {
      await rm(join(ctx.dossierFichiers, id), { force: true })
      throw e
    }
    return c.json({ id }, 201)
  })

  app.get('/api/fichiers/:id', (c) => {
    if (!utilisateurCourant(c)) return c.json({ erreur: 'non connecté' }, 401)
    const id = c.req.param('id')
    const f = ID_FICHIER.test(id) ? base.fichier(id) : null
    if (!f) return c.json({ erreur: 'introuvable' }, 404)
    const flux = Readable.toWeb(createReadStream(join(ctx.dossierFichiers, f.id))) as ReadableStream
    return new Response(flux, {
      headers: {
        'content-type': f.type,
        'content-length': String(f.taille),
        'cache-control': 'private, max-age=31536000, immutable',
        // Un fichier déposé ne doit jamais s'exécuter dans l'origine de l'application.
        'x-content-type-options': 'nosniff',
        'content-security-policy': "sandbox; default-src 'none'; img-src data:; media-src 'self'; style-src 'unsafe-inline'",
      },
    })
  })

  // ---- Aperçus ----

  app.get('/api/apercu', async (c) => {
    if (!utilisateurCourant(c)) return c.json({ erreur: 'non connecté' }, 401)
    const adresse = c.req.query('url')
    if (!adresse) return c.json({ erreur: 'url manquante' }, 400)
    try {
      return c.json(await apercuDePage(adresse))
    } catch {
      return c.json({ erreur: 'aperçu indisponible' }, 502)
    }
  })

  app.all('/api/*', (c) => c.json({ erreur: 'introuvable' }, 404))

  // En production, le même serveur sert l'application web construite ; toute autre adresse (`/t/…`) reçoit la page.
  if (ctx.dossierWeb) {
    app.use('*', serveStatic({ root: ctx.dossierWeb }))
    app.get('*', serveStatic({ root: ctx.dossierWeb, path: 'index.html' }))
  }
  return app
}
