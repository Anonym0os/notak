import { randomBytes, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import type { Hocuspocus } from '@hocuspocus/server'
import { getConnInfo } from '@hono/node-server/conninfo'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import type { Context } from 'hono'
import sharp from 'sharp'
import * as Y from 'yjs'
import { regrouper } from './activite.ts'
import { type ElementArrive, elementImage, elementsDeTexte, poserDansNonTries } from './arrivee.ts'
import { ErreurApercu, apercuDePage, rapatrierImage } from './apercu.ts'
import { type Base, DUREE_ACCES_PUBLIC_MS, type Fichier, type Utilisateur } from './base.ts'
import { type Auth, CHEMIN_AUTH, type Fournisseur, utilisateurDeSession } from './auth.ts'
import { type Autorisation, objetElement } from './autorisation.ts'
import { normaliserEmail } from './comptes.ts'
import { type Cle, duDisque, pourLeDisque } from './chiffrement.ts'
import { type TableauLu, fichiersDe, idsDeFichiers, lireEtat, lireTableau } from './contenu.ts'
import type { Limiteur } from './debit.ts'
import { type Role, auMoins, role, roleDeRelation } from './droits.ts'
import { decouvrirOidc } from './sso.ts'
import { estFormatExport, exporterTexte, langueExport } from './exporter.ts'
import { ErreurBanque, chercherImages } from './images.ts'
import { indexerDocument, requeteIndex } from './indexation.ts'
import { hacher, verifier } from './motsDePasse.ts'
import { cookieAccesPublic, empreinteDe, lireCookie, nouveauJeton } from './sessions.ts'
import { TYPE_NOTAK, ecrireCopie } from './copie.ts'
import { nomDuDocument } from './synchro.ts'
import { largeurDemandee, nomReduit, reduire, reductible } from './tailles.ts'
import { INSTANCE_PAR_DEFAUT, type Instance } from './instance.ts'
import { verrouPar } from './verrou.ts'
import { creerZip, nommerLesMedias } from './zip.ts'

export interface Contexte {
  base: Base
  auth: Auth
  /** Les droits, évalués par OpenFGA. */
  autorisation: Autorisation
  /** Ce que l'écran de connexion propose, au-delà du mot de passe. */
  moyens: MoyensConnexion
  /** Les origines de fournisseurs d'identité sur le réseau interne, que la découverte OIDC peut joindre. */
  idpInternes?: readonly string[]
  dossierFichiers: string
  limiteur: Limiteur
  /** Pour `POST /api/arrivee`, appelée à la chaîne par des raccourcis : à défaut, le limiteur commun. */
  limiteurArrivee?: Limiteur
  maintenant: () => number
  /** Lu à chaque requête : le serveur de synchro naît après l'application. */
  synchro: () => Hocuspocus | null
  /** Derrière un relais de confiance : l'adresse du client vient de `X-Forwarded-For`. */
  relaisFiable: boolean
  cookieSecurise: boolean
  /** Le build de `apps/web`, servi à côté de l'API ; absent en développement, où Vite s'en charge. */
  dossierWeb?: string
  /** Son nom, ses inscriptions, ses habillages ; absente, celle d'origine (`INSTANCE_PAR_DEFAUT`). */
  instance?: Instance
  /** La clé du chiffrement au repos : les fichiers déposés et leurs copies réduites sont écrits chiffrés. */
  cle?: Cle | null
}

export interface MoyensConnexion {
  fournisseurs: Fournisseur[]
  /** Les courriels partent (réinitialisation du mot de passe, vérification d'adresse). */
  courriel: boolean
}

export const FICHIER_MAX = 25 * 1024 * 1024
const ID_TABLEAU = /^[A-Za-z0-9_-]{8,64}$/
const ID_FICHIER = /^[0-9a-f-]{36}$/
const COULEUR_COMPTE = /^#[0-9a-f]{6}$/i
/** Les formats d'une photo de compte : ceux qu'un navigateur affiche sans script (pas de SVG). */
const TYPES_PHOTO = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
/** Combien de tableaux récents la liste montre. */
const RECENTS_AFFICHES = 12
/** Combien de résultats la recherche dans tous les tableaux rend au plus. */
const RESULTATS_RECHERCHE = 30
/** Combien de gestes l'activité d'un tableau rend, par défaut et au plus. */
const ACTIVITE_DEFAUT = 100
const ACTIVITE_MAX = 200
/** Combien de notifications la liste rend au plus. */
const NOTIFICATIONS_AFFICHEES = 50
/** Combien de jetons d'arrivée un compte garde au plus, et la longueur de leur nom. */
const JETONS_ARRIVEE_MAX = 20
const NOM_JETON_MAX = 60
/** Ce que `POST /api/arrivee` lit de plus qu'un fichier : le texte, les adresses et les noms de champs. */
const ARRIVEE_TEXTE_MAX = 256 * 1024
const ARRIVEE_CHAMP_MAX = 20_000
/** Les formats qu'une arrivée accepte en image, par leur nom chez `sharp`. Un HEIC d'iPhone n'y est pas. */
const FORMATS_ARRIVEE: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }
/** Ce qui ouvre un jeton d'arrivée : de quoi le reconnaître dans un presse-papiers ou un dépôt. */
const PREFIXE_JETON = 'nk_'
const JETON_PUBLIC = /^[A-Za-z0-9_-]{16,64}$/
/** Les mots de passe d'un tableau : ni trop courts pour valoir quelque chose, ni assez longs pour coûter au hachage. */
const MOT_DE_PASSE_MIN = 6
const MOT_DE_PASSE_MAX = 200
/** Le cookie qui porte l'accès à la lecture publique d'un tableau protégé. */
export const NOM_COOKIE_PUBLIC = 'notak_public'

/** Un nom de fichier sûr à partir d'un titre, et l'en-tête qui le propose au téléchargement. */
export function enTeteTelechargement(titre: string, extension: string): string {
  const net = titre.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim().slice(0, 100) || 'tableau'
  const ascii = net.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\x20-\x7e]/g, '_').replace(/[%"]/g, '_')
  return `attachment; filename="${ascii}.${extension}"; filename*=UTF-8''${encodeURIComponent(`${net}.${extension}`)}`
}

const moi = (u: Utilisateur) => ({ id: u.id, email: u.email, nom: u.nom, couleur: u.couleur, racine: u.racine, photo: u.photo ?? null })

/** Lit un corps de requête jusqu'à `max` octets : `null` s'il est vide, `'trop gros'` s'il dépasse (la lecture s'arrête alors). */
async function lireBorne(flux: ReadableStream<Uint8Array> | null, max: number): Promise<Buffer | null | 'trop gros'> {
  if (!flux) return null
  const morceaux: Uint8Array[] = []
  let taille = 0
  const lecteur = flux.getReader()
  for (;;) {
    const { done, value } = await lecteur.read()
    if (done) break
    taille += value.length
    if (taille > max) {
      void lecteur.cancel().catch(() => {})
      return 'trop gros'
    }
    morceaux.push(value)
  }
  return taille === 0 ? null : Buffer.concat(morceaux)
}

export function creerApp(ctx: Contexte): Hono {
  const { base } = ctx
  const cle = ctx.cle ?? null
  const app = new Hono()

  const utilisateurCourant = (c: Context): Promise<Utilisateur | null> => utilisateurDeSession(ctx.auth, base, c.req.raw.headers)

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

  const limiter = (c: Context, route: string, limiteur: Limiteur = ctx.limiteur): Response | null => {
    const cle = `${route}:${adresseIp(c)}`
    const maintenant = ctx.maintenant()
    if (limiteur.autoriser(cle, maintenant)) return null
    const secondes = Math.ceil(limiteur.attente(cle, maintenant) / 1000)
    return c.json({ erreur: 'trop d’essais', code: 'trop_d_essais' }, 429, { 'retry-after': String(secondes) })
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

  // ---- Comptes : Better Auth ----

  // Les essais de mot de passe et les demandes de courriel se limitent par adresse, comme le reste.
  const LIMITES_AUTH: Record<string, string> = {
    '/sign-in/email': 'connexion',
    '/sign-up/email': 'inscription',
    '/request-password-reset': 'reinitialisation',
    '/sign-in/sso': 'connexion',
  }
  // Le SSO d'un espace : seul un espace d'équipe en a un, et la découverte OIDC se fait ici, sous la garde réseau
  // de Notak, plutôt que par Better Auth, qui ne l'accepte que d'origines déclarées d'avance. La demande, complétée
  // des adresses découvertes, repart ensuite vers Better Auth, qui vérifie le reste (admin de l'espace, domaine).
  /**
   * Envoie à OpenFGA les droits qui viennent de changer, et ferme les connexions en direct sur les tableaux des espaces
   * touchés : chacun y relit son rôle. Un OpenFGA injoignable n'empêche pas de répondre : la boîte garde le reste.
   */
  const droitsAJour = async () => {
    try {
      for (const espace of await ctx.autorisation.vider()) {
        for (const t of base.tableauxDeLEspace(espace)) ctx.synchro()?.closeConnections(nomDuDocument(t))
      }
    } catch (e) {
      console.warn(`Notak : envoi des droits à OpenFGA différé (${(e as Error).message})`)
    }
  }

  const instance = ctx.instance ?? INSTANCE_PAR_DEFAUT
  // Ce que l'écran de connexion lit avant tout compte : il se règle dessus (nom, inscription, thème).
  app.get('/api/instance', (c) => c.json(instance))

  const versSso = async (c: Context, b: Record<string, unknown>): Promise<Response> => {
    const oidc = b.oidcConfig as Record<string, unknown> | undefined
    if (oidc && !oidc.skipDiscovery) {
      try {
        // Une mise à jour sans émetteur garde celui du fournisseur déjà déclaré.
        const emetteur = texte(b.issuer) || (base.emetteurSso(texte(b.providerId)) ?? '')
        b.oidcConfig = { ...oidc, ...(await decouvrirOidc(emetteur, ctx.idpInternes ?? [])), skipDiscovery: true }
      } catch (e) {
        return c.json({ message: (e as Error).message, code: 'DECOUVERTE_OIDC_IMPOSSIBLE' }, 400)
      }
    }
    const entetes = new Headers(c.req.raw.headers)
    entetes.delete('content-length')
    const reponse = await ctx.auth.handler(new Request(c.req.raw.url, { method: 'POST', headers: entetes, body: JSON.stringify(b) }))
    await droitsAJour()
    return reponse
  }
  app.post(`${CHEMIN_AUTH}/sso/register`, async (c) => {
    const refus = limiter(c, 'sso')
    if (refus) return refus
    const b = await corps(c)
    const espace = typeof b?.organizationId === 'string' ? base.espace(b.organizationId) : null
    if (!b || !espace || espace.personnel) return c.json({ message: 'espace d’équipe requis', code: 'ESPACE_EQUIPE_REQUIS' }, 400)
    return versSso(c, b)
  })
  app.post(`${CHEMIN_AUTH}/sso/update-provider`, async (c) => {
    const refus = limiter(c, 'sso')
    if (refus) return refus
    const b = await corps(c)
    if (!b) return c.json({ message: 'corps invalide', code: 'CORPS_INVALIDE' }, 400)
    return versSso(c, b)
  })

  app.on(['GET', 'POST'], `${CHEMIN_AUTH}/*`, async (c) => {
    const route = LIMITES_AUTH[c.req.path.slice(CHEMIN_AUTH.length)]
    const refus = c.req.method === 'POST' && route ? limiter(c, route) : null
    if (refus) return refus
    const reponse = await ctx.auth.handler(c.req.raw)
    // Un membre, un rôle ou une équipe a pu changer (une invitation acceptée, un SSO qui fait entrer quelqu'un) :
    // les droits suivent avant que la réponse parte.
    await droitsAJour()
    return reponse
  })

  // Les espaces du compte, avec leur accueil et son rôle.
  app.get('/api/espaces', async (c) => {
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    return c.json(base.espacesDe(u.id))
  })

  // Ce que l'écran de connexion peut proposer : les fournisseurs configurés, et si les courriels partent.
  app.get('/api/connexion/moyens', async (c) => c.json(ctx.moyens))

  app.get('/api/moi', async (c) => {
    const u = await utilisateurCourant(c)
    return u ? c.json(moi(u)) : c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
  })

  // Les réglages du compte : sa couleur (curseur, pastille) et sa photo, un fichier que le compte a déposé.
  app.patch('/api/moi', async (c) => {
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    const b = await corps(c)
    if (!b) return c.json({ erreur: 'corps invalide', code: 'corps_invalide' }, 400)
    const reglages: { couleur?: string; photo?: string | null } = {}
    if ('couleur' in b) {
      if (typeof b.couleur !== 'string' || !COULEUR_COMPTE.test(b.couleur)) return c.json({ erreur: 'couleur invalide', code: 'couleur_invalide' }, 400)
      reglages.couleur = b.couleur.toLowerCase()
    }
    if ('photo' in b) {
      if (b.photo === null) reglages.photo = null
      else {
        const f = typeof b.photo === 'string' && ID_FICHIER.test(b.photo) ? base.fichier(b.photo) : null
        // Un fichier qu'on n'a pas déposé soi-même n'est pas une photo qu'on peut prendre.
        if (!f || f.auteur !== u.id) return c.json({ erreur: 'photo introuvable', code: 'photo_introuvable' }, 400)
        if (!TYPES_PHOTO.has(f.type)) return c.json({ erreur: 'format de photo refusé', code: 'photo_format_refuse' }, 415)
        reglages.photo = f.id
      }
    }
    if (Object.keys(reglages).length === 0) return c.json({ erreur: 'rien à régler', code: 'rien_a_regler' }, 400)
    base.reglerCompte(u.id, reglages)
    return c.json(moi(base.utilisateurParId(u.id) ?? u))
  })

  // ---- Tableaux ----

  /** Le rôle hérité : un accès donné sur un tableau vaut pour tout ce qu'il contient. */
  const roleSur = (utilisateur: string, id: string): Promise<Role | null> => ctx.autorisation.roleSur(`user:${utilisateur}`, id)
  /** Ferme les connexions ouvertes sur un tableau et ses descendants : chacun y relira son rôle. */
  const fermerConnexions = (id: string) => {
    for (const t of [id, ...base.descendants(id)]) ctx.synchro()?.closeConnections(nomDuDocument(t))
  }

  app.post('/api/tableaux', async (c) => {
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    const b = await corps(c)
    const id = texte(b?.id)
    const titre = texte(b?.titre).slice(0, 200)
    const parent = typeof b?.parent === 'string' && b.parent ? b.parent : null
    if (!ID_TABLEAU.test(id)) return c.json({ erreur: 'id invalide', code: 'id_invalide' }, 400)

    const existant = base.tableau(id)
    if (existant) {
      if ((await roleSur(u.id, id)) !== 'proprietaire') return c.json({ erreur: 'id pris', code: 'id_pris' }, 409)
      return c.json({ id, titre: existant.titre, role: 'proprietaire' }, 201)
    }
    // Placé sous un parent qu'on peut éditer, le tableau en hérite les accès, présents et à venir, et son espace.
    // Sinon il va dans l'espace demandé, si l'on peut y créer, et à défaut dans son espace personnel.
    const heritage = parent !== null && auMoins(await roleSur(u.id, parent), 'edition')
    const demande = typeof b?.espace === 'string' ? b.espace : null
    if (!heritage && demande && !(await ctx.autorisation.verifier(`user:${u.id}`, 'peut_creer', `espace:${demande}`))) {
      return c.json({ erreur: 'interdit', code: 'interdit' }, 403)
    }
    const espace = heritage ? undefined : (demande ?? base.espacePersonnel(u.id))
    base.transaction(() => {
      base.creerTableau({ id, titre, proprietaire: u.id, parent: heritage ? parent : null, espace })
      base.definirAcces({ tableau: id, utilisateur: u.id, role: 'proprietaire' })
    })
    await droitsAJour()
    return c.json({ id, titre, role: 'proprietaire' }, 201)
  })

  app.get('/api/tableaux', async (c) => {
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    return c.json(base.tableauxAccessibles(u.id).filter((t) => t.id !== u.racine))
  })

  /** Ces tableaux, avec le titre et le rôle de `u` ; ceux qu'il ne peut plus ouvrir et son accueil sont écartés. */
  const resumes = async (u: Utilisateur, ids: readonly string[]) =>
    (
      await Promise.all(
        ids.map(async (id) => {
          const r = await roleSur(u.id, id)
          const t = base.tableau(id)
          return r && t && id !== u.racine ? [{ id, titre: t.titre, role: r }] : []
        }),
      )
    ).flat()

  /**
   * Le tableau, et l'utilisateur s'il atteint au moins `minimum` ; sinon la réponse d'erreur à rendre.
   * Un tableau protégé que ce compte n'a pas ouvert répond 423 (`par` : le tableau dont il faut le mot de passe),
   * sauf pour les routes qui servent justement à l'ouvrir ou à gérer son mot de passe (`horsVerrou`).
   */
  const garde = async (c: Context, minimum: Role, horsVerrou = false): Promise<{ u: Utilisateur; id: string } | Response> => {
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    const id = c.req.param('id') ?? ''
    const droit = await roleSur(u.id, id)
    // Un tableau qu'on ne peut pas voir n'existe pas.
    if (droit === null) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    if (!auMoins(droit, minimum)) return c.json({ erreur: 'interdit', code: 'interdit' }, 403)
    if (!horsVerrou) {
      const par = verrouPar(base, u.id, id)
      if (par !== null) return c.json({ erreur: 'verrouillé', code: 'verrouille', par }, 423)
    }
    return { u, id }
  }

  // ---- Mot de passe d'un tableau ----

  /** Un mot de passe valable dans la demande, ou la réponse d'erreur. */
  const motDePasseDemande = async (c: Context): Promise<string | Response> => {
    const m = texte((await corps(c))?.motDePasse)
    return m.length < MOT_DE_PASSE_MIN || m.length > MOT_DE_PASSE_MAX ? c.json({ erreur: 'mot de passe invalide', code: 'mot_de_passe_invalide' }, 400) : m
  }

  // Où en est ce tableau pour ce compte : protégé lui-même, et barré (par lui ou par un tableau au-dessus).
  app.get('/api/tableaux/:id/verrou', async (c) => {
    const g = await garde(c, 'lecture', true)
    if (g instanceof Response) return g
    const par = verrouPar(base, g.u.id, g.id)
    return c.json({ protege: base.motDePasse(g.id, 'tableau') !== null, verrouille: par !== null, par })
  })

  app.put('/api/tableaux/:id/mot-de-passe', async (c) => {
    const g = await garde(c, 'proprietaire', true)
    if (g instanceof Response) return g
    const m = await motDePasseDemande(c)
    if (m instanceof Response) return m
    const empreinte = await hacher(m)
    base.transaction(() => {
      base.definirMotDePasse(g.id, 'tableau', empreinte)
      // Celui qui le pose n'a pas à le redonner tout de suite.
      base.noterOuverture(g.u.id, g.id)
    })
    // Les autres sont renvoyés à la porte : ils relisent leur droit à la prochaine connexion.
    fermerConnexions(g.id)
    return c.body(null, 204)
  })

  app.delete('/api/tableaux/:id/mot-de-passe', async (c) => {
    const g = await garde(c, 'proprietaire', true)
    if (g instanceof Response) return g
    if (!base.retirerMotDePasse(g.id, 'tableau')) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    return c.body(null, 204)
  })

  // Donner le mot de passe ouvre le tableau, pour ce compte, tant que le mot de passe ne change pas.
  app.post('/api/tableaux/:id/deverrouiller', async (c) => {
    const refus = limiter(c, 'deverrouillage')
    if (refus) return refus
    const g = await garde(c, 'lecture', true)
    if (g instanceof Response) return g
    const par = verrouPar(base, g.u.id, g.id)
    if (par === null) return c.json({ verrouille: false, par: null })
    const empreinte = base.motDePasse(par, 'tableau')
    const bon = empreinte !== null && (await verifier(empreinte, texte((await corps(c))?.motDePasse)))
    if (!bon) return c.json({ erreur: 'mot de passe incorrect', code: 'mot_de_passe_incorrect' }, 401)
    base.noterOuverture(g.u.id, par)
    const reste = verrouPar(base, g.u.id, g.id)
    return c.json({ verrouille: reste !== null, par: reste })
  })

  app.get('/api/tableaux/:id/acces', async (c) => {
    const g = await garde(c, 'lecture')
    if (g instanceof Response) return g
    // Les accès du tableau et ceux de ses ancêtres ; `herite` : donné plus haut, il se retire là-haut.
    const chaine: string[] = []
    for (let t: string | null = g.id; t !== null && !chaine.includes(t); t = base.tableau(t)?.parent ?? null) chaine.push(t)
    const meilleurs = new Map<string, { role: Role; herite: boolean }>()
    for (const t of chaine) {
      for (const a of base.acces(t)) {
        if (meilleurs.has(a.utilisateur)) continue
        const r = await roleSur(a.utilisateur, g.id)
        if (r) meilleurs.set(a.utilisateur, { role: r, herite: role(base.acces(g.id), a.utilisateur, g.id) !== r })
      }
    }
    // Les équipes qui ont reçu le tableau (ou un tableau au-dessus) : leur rôle donné, le plus proche l'emporte.
    const equipes = new Map<string, { equipe: string; nom: string; role: Role; herite: boolean }>()
    for (const t of chaine) {
      for (const r of base.relationsSur(`tableau:${t}`)) {
        const m = /^equipe:(.+)#membre$/.exec(r.sujet)
        const donne = roleDeRelation(r.relation)
        const eq = m ? base.equipe(m[1]!) : null
        if (eq && donne && !equipes.has(eq.id)) equipes.set(eq.id, { equipe: eq.id, nom: eq.nom, role: donne, herite: t !== g.id })
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
    return c.json([...membres, ...[...equipes.values()].map((e) => ({ ...e, email: '', enAttente: false })), ...attente])
  })

  app.post('/api/tableaux/:id/partage', async (c) => {
    const g = await garde(c, 'proprietaire')
    if (g instanceof Response) return g
    const b = await corps(c)
    const email = normaliserEmail(texte(b?.email))
    const nouveau = b?.role
    if (nouveau !== 'edition' && nouveau !== 'commentaire' && nouveau !== 'lecture') return c.json({ erreur: 'demande invalide', code: 'demande_invalide' }, 400)
    // À une équipe : celle d'un espace dont on est membre.
    if (typeof b?.equipe === 'string') {
      const eq = base.equipe(b.equipe)
      if (!eq || !base.roleMembre(eq.espace, g.u.id)) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
      base.definirRoleDe(g.id, `equipe:${eq.id}#membre`, nouveau)
      await droitsAJour()
      fermerConnexions(g.id)
      return c.json({ equipe: eq.id, nom: eq.nom, role: nouveau, enAttente: false })
    }
    if (!email) return c.json({ erreur: 'demande invalide', code: 'demande_invalide' }, 400)
    const cible = base.utilisateurParEmail(email)
    if (cible) {
      const avant = role(base.acces(g.id), cible.id, g.id)
      if (avant === 'proprietaire') return c.json({ erreur: 'propriétaire', code: 'proprietaire' }, 409)
      base.definirAcces({ tableau: g.id, utilisateur: cible.id, role: nouveau })
      await droitsAJour()
      if (avant !== null && avant !== nouveau) fermerConnexions(g.id)
      if (avant === null && cible.id !== g.u.id) {
        base.noterNotification({
          destinataire: cible.id,
          genre: 'partage',
          tableau: g.id,
          element: '',
          auteur: g.u.id,
          extrait: base.tableau(g.id)?.titre ?? '',
          instant: ctx.maintenant(),
        })
      }
    } else {
      base.definirInvitation({ tableau: g.id, email, role: nouveau })
    }
    return c.json({ email, role: nouveau, enAttente: !cible })
  })

  app.delete('/api/tableaux/:id/partage', async (c) => {
    const g = await garde(c, 'proprietaire')
    if (g instanceof Response) return g
    const b = await corps(c)
    if (typeof b?.equipe === 'string') {
      const sujet = `equipe:${b.equipe}#membre`
      if (!base.relationsSur(`tableau:${g.id}`).some((r) => r.sujet === sujet)) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
      base.definirRoleDe(g.id, sujet, null)
      await droitsAJour()
      fermerConnexions(g.id)
      return c.body(null, 204)
    }
    const email = normaliserEmail(texte(b?.email))
    if (!email) return c.json({ erreur: 'demande invalide', code: 'demande_invalide' }, 400)
    const cible = base.utilisateurParEmail(email)
    const acces = base.acces(g.id)
    if (cible && role(acces, cible.id, g.id)) {
      const proprietaires = acces.filter((a) => a.role === 'proprietaire')
      if (proprietaires.length === 1 && proprietaires[0]!.utilisateur === cible.id) return c.json({ erreur: 'dernier propriétaire', code: 'dernier_proprietaire' }, 409)
      base.retirerAcces(g.id, cible.id)
      await droitsAJour()
      fermerConnexions(g.id)
    } else if (!base.retirerInvitation(g.id, email)) {
      return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    }
    return c.body(null, 204)
  })

  // Bloquer un tableau (et ce qu'il contient) pour quelqu'un, une équipe ou tout le monde, ou lever plus bas un
  // blocage venu d'au-dessus. Les propriétaires ne se bloquent pas. `{ tous: true }`, `{ email }` ou `{ equipe }`,
  // et `etat` : `bloque`, `debloque`, ou `null` pour revenir à l'héritage.
  app.post('/api/tableaux/:id/blocage', async (c) => {
    const g = await garde(c, 'proprietaire')
    if (g instanceof Response) return g
    const b = await corps(c)
    const etat = b?.etat
    if (etat !== 'bloque' && etat !== 'debloque' && etat !== null) return c.json({ erreur: 'demande invalide', code: 'demande_invalide' }, 400)
    let sujets: string[]
    if (b?.tous === true) sujets = ['user:*', 'lien:*']
    else if (typeof b?.equipe === 'string' && base.equipe(b.equipe)) sujets = [`equipe:${b.equipe}#membre`]
    else {
      const cible = typeof b?.email === 'string' ? base.utilisateurParEmail(normaliserEmail(b.email)) : null
      if (!cible) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
      sujets = [`user:${cible.id}`]
    }
    base.transaction(() => {
      for (const sujet of sujets) {
        for (const relation of ['bloque', 'debloque'] as const) {
          const r = { objet: `tableau:${g.id}`, relation, sujet }
          if (relation === etat) base.ajouterRelation(r)
          else base.retirerRelation(r)
        }
      }
    })
    await droitsAJour()
    fermerConnexions(g.id)
    return c.json({ etat })
  })

  // Ce que ce compte peut faire ici, et sur les éléments qui ont leurs propres droits : la toile s'y règle.
  app.get('/api/tableaux/:id/droits', async (c) => {
    const g = await garde(c, 'lecture', true)
    if (g instanceof Response) return g
    return c.json(await ctx.autorisation.droitsSur(`user:${g.u.id}`, g.id), 200, { 'cache-control': 'no-store' })
  })

  // ---- Droits d'un élément ----

  const ID_ELEMENT = /^[A-Za-z0-9_-]{1,64}$/
  /** La relation qui porte chaque droit d'un élément (`autorisation/modele.fga`). */
  const RELATION_DROIT_ELEMENT = { edition: 'editeur', commentaire: 'commentateur', bloque: 'bloque' } as const
  type DroitElement = keyof typeof RELATION_DROIT_ELEMENT

  // Qui a des droits propres sur cet élément : ce qu'on lui a rendu (écrire, commenter) ou retiré (bloqué).
  app.get('/api/tableaux/:id/elements/:element/droits', async (c) => {
    const g = await garde(c, 'proprietaire')
    if (g instanceof Response) return g
    const element = c.req.param('element')
    if (!ID_ELEMENT.test(element)) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    return c.json(
      base.relationsSur(objetElement(g.id, element)).flatMap((r): ({ droit: DroitElement } & ({ tous: true } | { equipe: string; nom: string } | { email: string; nom: string }))[] => {
        const droit = (Object.keys(RELATION_DROIT_ELEMENT) as DroitElement[]).find((d) => RELATION_DROIT_ELEMENT[d] === r.relation)
        if (!droit) return []
        if (r.sujet === 'user:*') return [{ tous: true, droit }]
        const equipe = /^equipe:(.+)#membre$/.exec(r.sujet)?.[1]
        if (equipe) return [{ equipe, nom: base.equipe(equipe)?.nom ?? '', droit }]
        const u = base.utilisateurParId(r.sujet.slice(5))
        return u ? [{ email: u.email, nom: u.nom, droit }] : []
      }),
    )
  })

  // Donner à quelqu'un (une adresse, une équipe) le droit d'écrire ou de commenter cet élément, ou le lui retirer ;
  // bloquer l'élément pour tout le monde (`tous`) : seuls ceux qu'on a nommés et les propriétaires l'écrivent encore.
  app.post('/api/tableaux/:id/elements/:element/droits', async (c) => {
    const g = await garde(c, 'proprietaire')
    if (g instanceof Response) return g
    const element = c.req.param('element')
    const b = await corps(c)
    const droit = b?.droit
    if (!ID_ELEMENT.test(element) || (droit !== null && droit !== 'edition' && droit !== 'commentaire' && droit !== 'bloque')) {
      return c.json({ erreur: 'demande invalide', code: 'demande_invalide' }, 400)
    }
    let sujet: string
    if (b?.tous === true) {
      if (droit !== 'bloque' && droit !== null) return c.json({ erreur: 'demande invalide', code: 'demande_invalide' }, 400)
      sujet = 'user:*'
    } else if (typeof b?.equipe === 'string' && base.equipe(b.equipe)) sujet = `equipe:${b.equipe}#membre`
    else {
      const cible = typeof b?.email === 'string' ? base.utilisateurParEmail(normaliserEmail(b.email)) : null
      if (!cible) return c.json({ erreur: 'adresse inconnue', code: 'adresse_inconnue' }, 404)
      sujet = `user:${cible.id}`
    }
    const objet = objetElement(g.id, element)
    base.transaction(() => {
      for (const d of Object.keys(RELATION_DROIT_ELEMENT) as DroitElement[]) {
        const r = { objet, relation: RELATION_DROIT_ELEMENT[d], sujet }
        if (d === droit) base.ajouterRelation(r)
        else base.retirerRelation(r)
      }
      // L'élément tient au tableau tant qu'il a des droits propres ; sans eux, il redevient un élément comme un autre.
      const lien = { objet, relation: 'tableau', sujet: `tableau:${g.id}` }
      if (base.relationsSur(objet).some((r) => r.relation !== 'tableau')) base.ajouterRelation(lien)
      else base.retirerRelation(lien)
    })
    await droitsAJour()
    fermerConnexions(g.id)
    return c.json({ droit })
  })

  // Les blocages posés sur ce tableau : qui, et dans quel sens.
  app.get('/api/tableaux/:id/blocage', async (c) => {
    const g = await garde(c, 'proprietaire')
    if (g instanceof Response) return g
    return c.json(
      base
        .relationsSur(`tableau:${g.id}`)
        .filter((r) => (r.relation === 'bloque' || r.relation === 'debloque') && r.sujet !== 'lien:*')
        .map((r) => {
          const etat = r.relation
          if (r.sujet === 'user:*') return { tous: true, etat }
          const equipe = /^equipe:(.+)#membre$/.exec(r.sujet)?.[1]
          if (equipe) return { equipe, nom: base.equipe(equipe)?.nom ?? '', etat }
          const u = base.utilisateurParId(r.sujet.slice(5))
          return { email: u?.email ?? '', nom: u?.nom ?? '', etat }
        }),
    )
  })

  /** Le tableau tel qu'il est maintenant : le document en direct s'il est ouvert, sinon le dernier état enregistré. */
  const lireLe = (id: string): TableauLu => {
    const vivant = ctx.synchro()?.documents.get(nomDuDocument(id))
    if (vivant) return lireTableau(vivant)
    const etat = base.document(nomDuDocument(id))
    return etat ? lireEtat(etat) : { titre: base.tableau(id)?.titre ?? '', elements: [] }
  }
  const titreDe = (id: string) => base.tableau(id)?.titre

  // ---- Recherche dans tous les tableaux ----

  app.get('/api/recherche', async (c) => {
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    const requete = requeteIndex(c.req.query('q') ?? '')
    if (!requete) return c.json([])
    // Tout ce que le compte peut lire, d'après OpenFGA : ses partages, leurs sous-tableaux, ses espaces.
    const ouverts = await ctx.autorisation.lister(`user:${u.id}`, 'peut_lire', 'tableau')
    const trouves = base.chercher(requete, ouverts, RESULTATS_RECHERCHE)
    return c.json(
      (
        await Promise.all(
          trouves.map(async (t) => {
            const ligne = base.tableau(t.tableau)
            // Ce qui est dans un tableau protégé ne se trouve pas sans son mot de passe.
            if (!ligne || verrouPar(base, u.id, t.tableau) !== null) return []
            const r = await roleSur(u.id, t.tableau)
            return r ? [{ tableau: t.tableau, titre: ligne.titre, element: t.element || null, extrait: t.extrait, role: r }] : []
          }),
        )
      ).flat(),
    )
  })

  // ---- Activité et notifications ----

  const entier = (v: string | undefined, defaut: number, min: number, max: number): number => {
    const n = Number(v)
    return v !== undefined && Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : defaut
  }

  app.get('/api/tableaux/:id/activite', async (c) => {
    const g = await garde(c, 'lecture')
    if (g instanceof Response) return g
    const limite = entier(c.req.query('limite'), ACTIVITE_DEFAUT, 1, ACTIVITE_MAX)
    const apres = entier(c.req.query('depuis'), 0, 0, Number.MAX_SAFE_INTEGER)
    const evenements = base.activite(g.id, limite, apres)
    return c.json({ evenements, groupes: regrouper(evenements), dernier: evenements[0]?.id ?? apres }, 200, { 'cache-control': 'no-store' })
  })

  app.get('/api/notifications', async (c) => {
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    const limite = entier(c.req.query('limite'), NOTIFICATIONS_AFFICHEES, 0, NOTIFICATIONS_AFFICHEES)
    // Un tableau qu'on ne peut plus ouvrir ne se devine pas par ses notifications.
    const notifications = (
      await Promise.all(
        base.notifications(u.id, limite).map(async (n) => {
          const t = base.tableau(n.tableau)
          return t && (await roleSur(u.id, n.tableau)) ? [{ ...n, titreTableau: t.titre }] : []
        }),
      )
    ).flat()
    return c.json({ notifications, nonLues: base.nonLues(u.id) }, 200, { 'cache-control': 'no-store' })
  })

  // `{ ids: [...] }` marque celles-là, `{ tout: true }` toutes les siennes ; jamais celles d'un autre.
  app.post('/api/notifications/lues', async (c) => {
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    const b = await corps(c)
    if (b?.tout === true) return c.json({ marquees: base.marquerLues(u.id, null) })
    const ids = Array.isArray(b?.ids) ? b.ids : null
    if (!ids || ids.length > 200 || !ids.every((i) => Number.isInteger(i))) return c.json({ erreur: 'demande invalide', code: 'demande_invalide' }, 400)
    return c.json({ marquees: base.marquerLues(u.id, ids as number[]) })
  })

  // ---- Favoris et récents ----

  app.get('/api/favoris', async (c) => {
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    return c.json(await resumes(u, base.favoris(u.id)))
  })

  app.put('/api/tableaux/:id/favori', async (c) => {
    const g = await garde(c, 'lecture')
    if (g instanceof Response) return g
    if (g.id === g.u.racine) return c.json({ erreur: 'accueil', code: 'accueil_pas_favori' }, 400)
    base.definirFavori(g.u.id, g.id, ctx.maintenant())
    return c.body(null, 204)
  })

  app.delete('/api/tableaux/:id/favori', async (c) => {
    const g = await garde(c, 'lecture')
    if (g instanceof Response) return g
    base.retirerFavori(g.u.id, g.id)
    return c.body(null, 204)
  })

  app.get('/api/recents', async (c) => {
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    return c.json(await resumes(u, base.recents(u.id, RECENTS_AFFICHES)))
  })

  // Le client note chaque tableau qu'il ouvre ; l'accueil n'entre pas dans la liste.
  app.post('/api/tableaux/:id/vu', async (c) => {
    const g = await garde(c, 'lecture')
    if (g instanceof Response) return g
    if (g.id !== g.u.racine) base.noterVu(g.u.id, g.id, ctx.maintenant())
    return c.body(null, 204)
  })

  // Et chaque carte mentale ou document qu'il ouvre en grand.
  app.post('/api/tableaux/:id/elements/:element/vu', async (c) => {
    const g = await garde(c, 'lecture')
    if (g instanceof Response) return g
    const element = c.req.param('element')
    if (!base.contenus([g.id]).some((x) => x.element === element && x.genre !== 'toile')) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    base.noterElementVu(g.u.id, g.id, element, ctx.maintenant())
    return c.body(null, 204)
  })

  /**
   * La bibliothèque : chaque toile que le compte peut lire (sauf son accueil), et chaque carte mentale et
   * document qu'elles portent, avec la toile qui les porte, la dernière fois qu'il les a ouverts, et ses favoris et
   * partages. Ce qui est sous un mot de passe pas encore donné n'y est pas.
   */
  app.get('/api/bibliotheque', async (c) => {
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    const lisibles = (await ctx.autorisation.lister(`user:${u.id}`, 'peut_lire', 'tableau')).filter((id) => verrouPar(base, u.id, id) === null)
    const ouvrables = new Set(lisibles)
    const vus = new Map(base.vus(u.id).map((v) => [`${v.tableau}/${v.element}`, v.vu]))
    const favoris = new Set(base.favoris(u.id))
    const partages = new Set(base.tableauxAccessibles(u.id).flatMap((t) => (t.role === 'proprietaire' ? [] : [t.id])))
    const titres = new Map<string, string>()
    const titreDe = (id: string) => {
      if (!titres.has(id)) titres.set(id, base.tableau(id)?.titre ?? '')
      return titres.get(id)!
    }
    const entrees = base.contenus(lisibles).flatMap((l) => {
      if (l.genre === 'toile' && l.tableau === u.racine) return []
      const ligne = base.tableau(l.tableau)
      if (!ligne) return []
      const parent = l.genre === 'toile' ? ligne.parent : l.tableau
      const toile = l.genre === 'toile'
      return [
        {
          tableau: l.tableau,
          element: toile ? null : l.element,
          genre: l.genre,
          titre: toile ? ligne.titre : l.titre,
          resume: JSON.parse(l.resume) as unknown,
          ou: parent && ouvrables.has(parent) ? titreDe(parent) : null,
          vu: vus.get(`${l.tableau}/${l.element}`) ?? null,
          favori: toile && favoris.has(l.tableau),
          partage: toile && partages.has(l.tableau),
        },
      ]
    })
    return c.json(entrees)
  })

  // ---- Lien public ----

  app.get('/api/tableaux/:id/lien', async (c) => {
    const g = await garde(c, 'proprietaire')
    if (g instanceof Response) return g
    return c.json({ jeton: base.jetonPublic(g.id), niveau: base.niveauPublic(g.id) })
  })

  app.post('/api/tableaux/:id/lien', async (c) => {
    const g = await garde(c, 'proprietaire')
    if (g instanceof Response) return g
    // Un lien déjà publié reste le même : pour en changer, on le retire d'abord.
    let jeton = base.jetonPublic(g.id)
    if (!jeton) {
      jeton = randomBytes(16).toString('base64url')
      base.definirJetonPublic(g.id, jeton, ctx.maintenant())
      await droitsAJour()
    }
    return c.json({ jeton, niveau: base.niveauPublic(g.id) }, 201)
  })

  // Ce que permet le lien : lire (par défaut), commenter, ou modifier.
  app.put('/api/tableaux/:id/lien/niveau', async (c) => {
    const g = await garde(c, 'proprietaire')
    if (g instanceof Response) return g
    const niveau = (await corps(c))?.niveau
    if (niveau !== 'lecture' && niveau !== 'commentaire' && niveau !== 'edition') return c.json({ erreur: 'demande invalide', code: 'demande_invalide' }, 400)
    if (!base.jetonPublic(g.id)) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    base.definirNiveauPublic(g.id, niveau)
    await droitsAJour()
    fermerConnexions(g.id)
    return c.json({ niveau })
  })

  app.delete('/api/tableaux/:id/lien', async (c) => {
    const g = await garde(c, 'proprietaire')
    if (g instanceof Response) return g
    if (!base.retirerJetonPublic(g.id)) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    await droitsAJour()
    fermerConnexions(g.id)
    // Un lien retiré emporte son mot de passe : le prochain sera libre, à moins d'en poser un.
    base.retirerMotDePasse(g.id, 'public')
    return c.body(null, 204)
  })

  // Le mot de passe du lien public : il se pose à part de celui qui ferme le tableau aux comptes.
  app.get('/api/tableaux/:id/lien/mot-de-passe', async (c) => {
    const g = await garde(c, 'proprietaire')
    if (g instanceof Response) return g
    return c.json({ protege: base.motDePasse(g.id, 'public') !== null })
  })

  app.put('/api/tableaux/:id/lien/mot-de-passe', async (c) => {
    const g = await garde(c, 'proprietaire')
    if (g instanceof Response) return g
    const m = await motDePasseDemande(c)
    if (m instanceof Response) return m
    base.definirMotDePasse(g.id, 'public', await hacher(m))
    return c.body(null, 204)
  })

  app.delete('/api/tableaux/:id/lien/mot-de-passe', async (c) => {
    const g = await garde(c, 'proprietaire')
    if (g instanceof Response) return g
    if (!base.retirerMotDePasse(g.id, 'public')) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    return c.body(null, 204)
  })

  /**
   * Ce que voit quelqu'un qui n'a pas de compte : le tableau sans la corbeille, les non triés ni les commentaires
   * (ce sont les échanges de ceux qui y travaillent, y compris le fil accroché à un élément, ses réactions et la
   * personne à qui il est confié), et les lignes qui n'ont plus leurs deux bouts.
   */
  const vuePublique = (id: string) => {
    const t = lireLe(id)
    const visibles = t.elements.filter((e) => e.corbeille === undefined && e.nonTrie === undefined && e.contenu.type !== 'commentaire')
    const ids = new Set(visibles.map((e) => e.id))
    const bout = (b: unknown) => !(b && typeof b === 'object' && 'element' in b) || ids.has(String((b as { element: unknown }).element))
    const elements = visibles
      .filter((e) => e.contenu.type !== 'ligne' || (bout(e.contenu.depart) && bout(e.contenu.arrivee)))
      .map(({ commentaire: _c, reactions: _r, assigne: _a, ...e }) => e)
    const titres: Record<string, string> = {}
    for (const e of elements) {
      if (e.contenu.type !== 'tableau' || typeof e.contenu.cible !== 'string') continue
      const titre = titreDe(e.contenu.cible)
      if (titre !== undefined) titres[e.contenu.cible] = titre
    }
    return { titre: t.titre, ...(t.couleur ? { couleur: t.couleur } : {}), elements, titres }
  }

  /** Le tableau de ce lien, s'il existe et si OpenFGA le laisse lire (un blocage pour tous vaut aussi pour les liens). */
  const tableauPublic = async (c: Context): Promise<string | null> => {
    const jeton = c.req.param('jeton') ?? ''
    const id = JETON_PUBLIC.test(jeton) ? base.tableauDuJeton(jeton) : null
    return id && (await ctx.autorisation.verifier(`lien:${jeton}`, 'peut_lire', `tableau:${id}`)) ? id : null
  }

  /** Le lien est protégé et ce lecteur n'a pas donné le mot de passe : la réponse à rendre, sinon `null`. */
  const motDePasseRequis = (c: Context, id: string): Response | null => {
    if (base.motDePasse(id, 'public') === null) return null
    const acces = lireCookie(c.req.header('cookie'), NOM_COOKIE_PUBLIC)
    if (acces && base.accesPublicValide(empreinteDe(acces), id, ctx.maintenant())) return null
    return c.json({ erreur: 'mot de passe requis', code: 'mot_de_passe_requis', protege: true }, 401, { 'cache-control': 'no-store' })
  }

  // Donner le mot de passe du lien : le serveur remet un accès, porté par un cookie limité à ce lien.
  app.post('/api/public/:jeton/deverrouiller', async (c) => {
    const refus = limiter(c, 'deverrouillage-public')
    if (refus) return refus
    const id = await tableauPublic(c)
    if (!id) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    const empreinte = base.motDePasse(id, 'public')
    if (empreinte === null) return c.body(null, 204)
    if (!(await verifier(empreinte, texte((await corps(c))?.motDePasse)))) return c.json({ erreur: 'mot de passe incorrect', code: 'mot_de_passe_incorrect' }, 401)
    const { jeton: acces, empreinte: trace } = nouveauJeton()
    base.creerAccesPublic(trace, id, ctx.maintenant() + DUREE_ACCES_PUBLIC_MS)
    c.header('set-cookie', cookieAccesPublic(NOM_COOKIE_PUBLIC, c.req.param('jeton') ?? '', acces, DUREE_ACCES_PUBLIC_MS / 1000, ctx.cookieSecurise))
    return c.body(null, 204)
  })

  app.get('/api/public/:jeton', async (c) => {
    const id = await tableauPublic(c)
    if (!id) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    const ferme = motDePasseRequis(c, id)
    if (ferme) return ferme
    return c.json(vuePublique(id), 200, { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' })
  })

  // Seuls les fichiers que le tableau montre se lisent par son lien.
  app.get('/api/public/:jeton/fichiers/:fichier', async (c) => {
    const id = await tableauPublic(c)
    const fichier = c.req.param('fichier') ?? ''
    const ferme = id ? motDePasseRequis(c, id) : null
    if (ferme) return ferme
    if (!id || !ID_FICHIER.test(fichier) || !idsDeFichiers(vuePublique(id).elements).has(fichier)) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    const f = base.fichier(fichier)
    if (!f) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    return await servirFichier(f, 'private, max-age=300')
  })

  // ---- Export ----

  app.get('/api/tableaux/:id/export', async (c) => {
    const g = await garde(c, 'lecture')
    if (g instanceof Response) return g
    const format = c.req.query('format') ?? 'md'
    if (!estFormatExport(format)) return c.json({ erreur: 'format inconnu', code: 'format_inconnu' }, 400)
    const tableau = lireLe(g.id)
    return c.body(exporterTexte(tableau, format, titreDe, langueExport(c.req.query('langue'))), 200, {
      'content-type': format === 'md' ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8',
      'content-disposition': enTeteTelechargement(tableau.titre, format),
      'cache-control': 'no-store',
    })
  })

  app.get('/api/tableaux/:id/medias', async (c) => {
    const g = await garde(c, 'lecture')
    if (g instanceof Response) return g
    const tableau = lireLe(g.id)
    const medias = nommerLesMedias(fichiersDe(tableau.elements), (id) => base.fichier(id)?.type)
    const entrees: { nom: string; octets: Uint8Array; type: string }[] = []
    for (const m of medias) {
      const f = base.fichier(m.id)
      if (!f) continue
      // Un fichier absent du disque ne fait pas échouer toute l'archive.
      const octets = await readFile(join(ctx.dossierFichiers, f.id)).catch(() => null)
      if (octets) entrees.push({ nom: m.nom, octets: duDisque(cle, octets), type: f.type })
    }
    if (entrees.length === 0) return c.json({ erreur: 'aucun média', code: 'aucun_media' }, 404)
    return c.body(creerZip(entrees) as Uint8Array<ArrayBuffer>, 200, {
      'content-type': 'application/zip',
      'content-disposition': enTeteTelechargement(`${tableau.titre} (${langueExport(c.req.query('langue')) === 'en' ? 'media' : 'médias'})`, 'zip'),
      'cache-control': 'no-store',
    })
  })

  // Une image d'un autre site, relue pour la capture d'un tableau en PNG ou en PDF : le navigateur refuse de lire
  // lui-même une image d'une autre origine. Rien n'est gardé ; les adresses privées sont refusées comme pour l'aperçu.
  app.get('/api/image-distante', async (c) => {
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    const adresse = c.req.query('url') ?? ''
    if (!/^https?:\/\//.test(adresse)) return c.json({ erreur: 'url manquante', code: 'url_manquante' }, 400)
    try {
      const { octets, type } = await rapatrierImage(adresse, FICHIER_MAX)
      return c.body(new Uint8Array(octets), 200, { 'content-type': type, 'cache-control': 'private, max-age=600', 'x-content-type-options': 'nosniff' })
    } catch (e) {
      if (e instanceof ErreurApercu) return c.json({ erreur: 'image indisponible', code: 'image_indisponible' }, 422)
      throw e
    }
  })

  // Le format natif : le fichier `.notak` du tableau, de ses sous-tableaux (ceux qu'on peut ouvrir) et de ses fichiers.
  app.get('/api/tableaux/:id/notak', async (c) => {
    const g = await garde(c, 'lecture')
    if (g instanceof Response) return g
    const options = { sousTableaux: c.req.query('sousTableaux') !== '0', fichiers: c.req.query('fichiers') !== '0' }
    const octets = await ecrireCopie(
      g.id,
      {
        etat: async (id) => {
          // Un sous-tableau qu'on ne peut pas voir, ou barré par un mot de passe, reste dehors.
          if (id !== g.id && ((await roleSur(g.u.id, id)) === null || verrouPar(base, g.u.id, id) !== null)) return null
          const vivant = ctx.synchro()?.documents.get(nomDuDocument(id))
          // Un tableau jamais ouvert n'a pas encore d'état : le sien est vide.
          return vivant ? Y.encodeStateAsUpdate(vivant) : (base.document(nomDuDocument(id)) ?? (id === g.id ? Y.encodeStateAsUpdate(new Y.Doc()) : null))
        },
        titre: titreDe,
        fichier: async (id) => {
          const f = base.fichier(id)
          const o = f ? await readFile(join(ctx.dossierFichiers, f.id)).catch(() => null) : null
          return f && o ? { octets: o, type: f.type } : null
        },
      },
      options,
    )
    return c.body(octets as Uint8Array<ArrayBuffer>, 200, {
      'content-type': TYPE_NOTAK,
      'content-disposition': enTeteTelechargement(lireLe(g.id).titre, 'notak'),
      'cache-control': 'no-store',
    })
  })

  // ---- Fichiers ----

  app.post('/api/fichiers', async (c) => {
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    const annonce = Number(c.req.header('content-length') ?? 0)
    if (annonce > FICHIER_MAX) return c.json({ erreur: 'trop gros', code: 'trop_gros' }, 413)
    const octets = await lireBorne(c.req.raw.body, FICHIER_MAX)
    if (octets === 'trop gros') return c.json({ erreur: 'trop gros', code: 'trop_gros' }, 413)
    if (!octets) return c.json({ erreur: 'fichier vide', code: 'fichier_vide' }, 400)

    const type = (c.req.header('content-type') ?? 'application/octet-stream').slice(0, 200)
    return c.json({ id: await ranger(octets, type, u.id) }, 201)
  })

  /** Range un fichier reçu sur le disque et dans la base ; rend son id. */
  const ranger = async (octets: Buffer, type: string, auteur: string): Promise<string> => {
    const id = randomUUID()
    await mkdir(ctx.dossierFichiers, { recursive: true })
    await writeFile(join(ctx.dossierFichiers, id), pourLeDisque(cle, octets))
    try {
      base.creerFichier({ id, type, taille: octets.length, auteur })
    } catch (e) {
      await rm(join(ctx.dossierFichiers, id), { force: true })
      throw e
    }
    return id
  }

  // Une adresse d'image collée sur la toile : le serveur la rapatrie, pour qu'elle ne dépende plus de son site.
  app.post('/api/fichiers/rapatrier', async (c) => {
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    const adresse = texte((await corps(c))?.url)
    if (!adresse) return c.json({ erreur: 'url manquante', code: 'url_manquante' }, 400)
    try {
      const { octets, type } = await rapatrierImage(adresse, FICHIER_MAX)
      return c.json({ id: await ranger(octets, type, u.id), type }, 201)
    } catch (e) {
      if (e instanceof ErreurApercu) return c.json({ erreur: 'image indisponible', code: 'image_indisponible', cause: e.cause }, 422)
      throw e
    }
  })

  /** Le contenu d'un fichier rangé, servi pour qu'il ne s'exécute jamais dans l'origine de l'application. */
  const servirFichier = async (f: Fichier, cache: string): Promise<Response> => {
    const chemin = join(ctx.dossierFichiers, f.id)
    if (!cle) {
      const flux = Readable.toWeb(createReadStream(chemin)) as ReadableStream
      return new Response(flux, { headers: { ...entetesFichier(cache, f.type), 'content-type': f.type, 'content-length': String(f.taille) } })
    }
    // Chiffré, le fichier se déchiffre d'un bloc (25 Mo au plus) : GCM ne rend rien avant d'avoir vérifié le tout.
    const octets = duDisque(cle, await readFile(chemin))
    return new Response(new Uint8Array(octets), {
      headers: { ...entetesFichier(cache, f.type), 'content-type': f.type, 'content-length': String(octets.length) },
    })
  }
  const entetesFichier = (cache: string, type = '') => ({
    'cache-control': cache,
    'x-content-type-options': 'nosniff',
    // Un PDF garde le lecteur du navigateur, qui refuse le bac à sable, mais rien d'autre : ni script, ni requête.
    'content-security-policy':
      type === 'application/pdf'
        ? "default-src 'none'; frame-ancestors 'self'"
        : "sandbox; default-src 'none'; img-src data:; media-src 'self'; style-src 'unsafe-inline'",
  })

  /** La copie réduite d'une image, fabriquée à la première demande puis gardée à côté de l'original ; `null` : servir l'original. */
  const copieReduite = async (id: string, type: string, largeur: number): Promise<Buffer | null> => {
    if (!reductible(type)) return null
    const chemin = join(ctx.dossierFichiers, nomReduit(id, largeur))
    try {
      return duDisque(cle, await readFile(chemin))
    } catch {
      // pas encore fabriquée, ou illisible : on la refait d'après l'original
    }
    const fabriquee = await reduire(duDisque(cle, await readFile(join(ctx.dossierFichiers, id))), type, largeur)
    if (!fabriquee) return null
    // Écrite sous un nom provisoire, puis posée d'un coup : deux demandes ensemble ne se lisent jamais à moitié.
    const provisoire = `${chemin}.${randomUUID()}.tmp`
    await writeFile(provisoire, pourLeDisque(cle, fabriquee))
    await rename(provisoire, chemin)
    return fabriquee
  }

  /**
   * Un fichier se lit par celui qui l'a déposé, par qui peut lire un tableau qui le montre, et par tous s'il est la
   * photo d'un compte (elle s'affiche dans la présence des autres). Les autres ne savent même pas qu'il existe.
   */
  const peutLireFichier = async (u: Utilisateur, f: Fichier): Promise<boolean> => {
    if (f.auteur === u.id || base.estPhoto(f.id)) return true
    for (const t of base.tableauxDuFichier(f.id)) {
      if (await ctx.autorisation.verifier(`user:${u.id}`, 'peut_lire', `tableau:${t}`)) return true
    }
    return false
  }

  app.get('/api/fichiers/:id', async (c) => {
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    const id = c.req.param('id')
    const f = ID_FICHIER.test(id) ? base.fichier(id) : null
    if (!f || !(await peutLireFichier(u, f))) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    const cache = 'private, max-age=31536000, immutable'

    // `?l=800` : l'image réduite à cette largeur (400, 800 ou 1600), quand elle y gagne.
    const demande = c.req.query('l')
    if (demande !== undefined) {
      const largeur = largeurDemandee(demande)
      if (largeur === null) return c.json({ erreur: 'largeur invalide', code: 'largeur_invalide' }, 400)
      const reduite = await copieReduite(f.id, f.type, largeur)
      if (reduite) {
        return new Response(new Uint8Array(reduite), {
          headers: { ...entetesFichier(cache), 'content-type': f.type, 'content-length': String(reduite.length) },
        })
      }
    }
    return await servirFichier(f, cache)
  })

  // ---- Aperçus ----

  app.get('/api/apercu', async (c) => {
    if (!(await utilisateurCourant(c))) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    const adresse = c.req.query('url')
    if (!adresse) return c.json({ erreur: 'url manquante', code: 'url_manquante' }, 400)
    try {
      return c.json(await apercuDePage(adresse))
    } catch (e) {
      const cause = e instanceof ErreurApercu ? e.cause : 'injoignable'
      return c.json({ erreur: 'aperçu indisponible', code: 'apercu_indisponible', cause }, 502)
    }
  })

  // ---- Banque d'images ----

  // La clé Pexels vit ici et nulle part ailleurs ; sans elle, le panneau d'images le sait (503) et ne propose que l'envoi.
  app.get('/api/images/recherche', async (c) => {
    if (!(await utilisateurCourant(c))) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    try {
      return c.json(await chercherImages({ cle: process.env.PEXELS_API_KEY, requete: c.req.query('q') ?? '', page: Number(c.req.query('page') ?? 1) }))
    } catch (e) {
      if (!(e instanceof ErreurBanque)) throw e
      return e.code === 'non_configuree'
        ? c.json({ erreur: 'recherche d’images non configurée', code: 'images_non_configurees' }, 503)
        : c.json({ erreur: 'recherche d’images indisponible', code: 'images_indisponibles' }, 502)
    }
  })

  // ---- Jetons d'arrivée ----
  // Un jeton personnel ne sert qu'à `POST /api/arrivee` : de quoi poser un élément dans les non triés de l'accueil
  // depuis un Raccourci iOS ou un favori, là où Safari ne reçoit pas les partages. Il est aléatoire sur 256 bits, donc
  // une empreinte SHA-256 suffit (pas d'argon2, fait pour des mots de passe devinables : il coûterait un hachage de
  // 20 Mo à chaque appel d'un raccourci pour rien) ; elle sert aussi de clé de recherche, ce qu'argon2 interdit.
  // Le jeton n'est montré qu'à sa création.

  app.get('/api/jetons', async (c) => {
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    return c.json(base.jetonsArrivee(u.id))
  })

  app.post('/api/jetons', async (c) => {
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    const nom = texte((await corps(c))?.nom).trim()
    if (!nom || nom.length > NOM_JETON_MAX) return c.json({ erreur: `nom de 1 à ${NOM_JETON_MAX} caractères`, code: 'nom_jeton_invalide' }, 400)
    if (base.jetonsArrivee(u.id).length >= JETONS_ARRIVEE_MAX) return c.json({ erreur: 'trop de jetons : révoquez-en un', code: 'trop_de_jetons' }, 409)
    const jeton = PREFIXE_JETON + nouveauJeton().jeton
    const j = { id: randomUUID(), nom, cree: ctx.maintenant() }
    base.creerJetonArrivee({ ...j, utilisateur: u.id, empreinte: empreinteDe(jeton) })
    return c.json({ ...j, dernierUsage: null, jeton }, 201)
  })

  app.delete('/api/jetons/:id', async (c) => {
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    return base.retirerJetonArrivee(u.id, c.req.param('id')) ? c.body(null, 204) : c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
  })

  // ---- Arrivée ----

  // Un favori sur une autre page appelle cette route d'une autre origine : le jeton est dans un en-tête, jamais dans
  // un cookie, donc n'importe quelle origine peut la demander sans rien risquer.
  const ouverte = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'retry-after' }
  app.options('/api/arrivee', (c) =>
    c.body(null, 204, { ...ouverte, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'authorization, content-type', 'access-control-max-age': '86400' }),
  )

  /** Pose les éléments dans les non triés de l'accueil : le document en direct s'il est ouvert (ceux qui l'ont devant eux le voient arriver), sinon l'état enregistré. */
  const poserDansLAccueil = async (u: Utilisateur, elements: readonly ElementArrive[]) => {
    const nom = nomDuDocument(u.racine)
    const synchro = ctx.synchro()
    if (synchro) {
      const liaison = await synchro.openDirectConnection(nom, { utilisateur: { id: u.id, nom: u.nom, couleur: u.couleur } })
      try {
        await liaison.transact((doc) => poserDansNonTries(doc, elements))
      } finally {
        await liaison.disconnect()
      }
      return
    }
    const doc = new Y.Doc()
    try {
      const etat = base.document(nom)
      if (etat) Y.applyUpdate(doc, etat)
      poserDansNonTries(doc, elements)
      base.enregistrerDocument(nom, Y.encodeStateAsUpdate(doc))
      indexerDocument(base, u.racine, doc)
    } finally {
      doc.destroy()
    }
  }

  app.post('/api/arrivee', async (c) => {
    const repondre = (donnees: object, statut: 200 | 201 | 400 | 401 | 413 | 415 | 429, entetes: Record<string, string> = {}) =>
      c.json(donnees, statut, { ...ouverte, ...entetes })
    const refus = limiter(c, 'arrivee', ctx.limiteurArrivee)
    if (refus) {
      for (const [k, v] of Object.entries(ouverte)) refus.headers.set(k, v)
      return refus
    }
    const porteur = /^Bearer +(\S+)$/i.exec(c.req.header('authorization') ?? '')?.[1]
    const u = porteur ? base.utilisateurDuJetonArrivee(empreinteDe(porteur), ctx.maintenant()) : null
    if (!u) return repondre({ erreur: 'jeton absent ou révoqué', code: 'jeton_invalide' }, 401, { 'www-authenticate': 'Bearer' })

    const multipart = /^multipart\/form-data/i.test(c.req.header('content-type') ?? '')
    const octets = await lireBorne(c.req.raw.body, multipart ? FICHIER_MAX + ARRIVEE_TEXTE_MAX : ARRIVEE_TEXTE_MAX)
    if (octets === 'trop gros') return repondre({ erreur: 'trop gros', code: 'trop_gros' }, 413)
    if (!octets) return repondre({ erreur: 'corps vide', code: 'corps_vide' }, 400)

    // Le même sens des champs, en JSON ou en formulaire : `texte`, `url`, `titre`, et `image` pour un fichier.
    let champs: Record<string, unknown>
    let image: File | null = null
    try {
      if (multipart) {
        const formulaire = await new Response(octets, { headers: { 'content-type': c.req.header('content-type')! } }).formData()
        champs = Object.fromEntries([...formulaire.entries()].filter(([, v]) => typeof v === 'string'))
        const f = formulaire.get('image')
        image = f && typeof f !== 'string' && f.size > 0 ? f : null
      } else {
        const valeur: unknown = JSON.parse(octets.toString('utf8'))
        if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) throw new Error('pas un objet')
        champs = valeur as Record<string, unknown>
      }
    } catch {
      return repondre({ erreur: 'corps invalide', code: 'corps_invalide' }, 400)
    }
    const champ = (nom: string) => texte(champs[nom]).slice(0, ARRIVEE_CHAMP_MAX)
    const maintenant = ctx.maintenant()
    const elements = elementsDeTexte({ titre: champ('titre'), texte: champ('texte'), adresse: champ('url') }, maintenant)

    if (image) {
      if (image.size > FICHIER_MAX) return repondre({ erreur: 'trop gros', code: 'trop_gros' }, 413)
      const brut = Buffer.from(await image.arrayBuffer())
      const lu = await sharp(brut).metadata().catch(() => null)
      const type = lu?.format ? FORMATS_ARRIVEE[lu.format] : undefined
      if (!lu || !type || !lu.width || !lu.height) {
        return repondre({ erreur: 'image illisible : PNG, JPEG, WebP ou GIF (un HEIC se convertit en JPEG avant l’envoi)', code: 'image_illisible' }, 415)
      }
      // Une photo d'iPhone est enregistrée couchée, avec un indicateur de rotation : l'affichage la redresse.
      const tournee = (lu.orientation ?? 1) >= 5
      const fichier = await ranger(brut, type, u.id)
      elements.push(
        elementImage({ fichier, largeur: tournee ? lu.height : lu.width, hauteur: tournee ? lu.width : lu.height, typeMime: type }, maintenant, elements.length),
      )
    }
    if (elements.length === 0) return repondre({ erreur: 'rien à poser : ni texte, ni adresse, ni image', code: 'rien_a_poser' }, 400)

    await poserDansLAccueil(u, elements)
    return repondre({ ajoutes: elements.length }, 201)
  })

  app.all('/api/*', (c) => c.json({ erreur: 'introuvable', code: 'introuvable' }, 404))

  // En production, le même serveur sert l'application web construite ; toute autre adresse (`/t/…`) reçoit la page.
  if (ctx.dossierWeb) {
    // Un partage vers Notak est reçu par le service worker ; sans lui (pas encore installé), on ne perd que le partage, pas la page.
    app.post('/partage', async (c) => c.redirect('/', 303))
    app.use('*', serveStatic({ root: ctx.dossierWeb }))
    app.get('*', serveStatic({ root: ctx.dossierWeb, path: 'index.html' }))
  }
  return app
}
