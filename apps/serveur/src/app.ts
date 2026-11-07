import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { isIP } from 'node:net'
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
import { type ElementArrive, elementImage, elementsDeTexte, nouvelId, poserDansNonTries } from './arrivee.ts'
import { ErreurApercu, apercuDePage, rapatrierImage } from './apercu.ts'
import { type Base, DUREE_ACCES_PUBLIC_MS, DUREE_INVITATION_MS, type Fichier, type Invitation, type LienVisiteur, type NiveauVisiteur, type Rattachement, type Utilisateur } from './base.ts'
import { type Auth, CHEMIN_AUTH, type Fournisseur, normaliserOrigine, utilisateurDeSession } from './auth.ts'
import { type Demandes, creerDemandes, normaliserCode } from './demandesBureau.ts'
import { type Autorisation, objetElement } from './autorisation.ts'
import { accorderInvitation, activerInvitations, entrerParLeSso, invitationValable, normaliserEmail } from './comptes.ts'
import type { Courrier } from './courriel.ts'
import { creerExpiration } from './echeances.ts'
import { type Cle, duDisque, pourLeDisque } from './chiffrement.ts'
import { type TableauLu, fichiersDe, idsDeFichiers, lireEtat, lireTableau } from './contenu.ts'
import { rangerLesToiles } from './catalogue.ts'
import {
  ACTIONS_OUTIL,
  ACTIONS_SIGNALEMENT,
  type ActionOutil,
  CLE_FICHE,
  ID_DEMANDE,
  type SourceRattachement,
  adresseDeLaFiche,
  annoncerSignalement,
  dossierDeLaSource,
  ecrireDossierNeuf,
  marquerCarte,
  mettreEnFile,
  poserCarteDeToile,
  signatureValable,
  suivreLesDossiers,
  titreDuDossier,
} from './rattachements.ts'
import type { Limiteur } from './debit.ts'
import { AUCUN_CHANGEMENT, bilanDuRangement, rienNeChange } from './rangement.ts'
import { RELATION_DU_ROLE, type Role, auMoins, role, roleDeRelation } from './droits.ts'
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
import type { Verificateur } from './misesAJour.ts'
import { VERSION_NOTAK } from '../../../packages/tableau/src/version.ts'
import {
  A_TRAITER,
  CAPTURES_MAX,
  CAPTURE_MAX,
  CONTEXTE_MAX,
  ID_SIGNALEMENT,
  TEXTE_MAX,
  classerSignalement,
  deposerSignalement,
  listerSignalements,
  relireSignalement,
} from './signalements.ts'
import { entetesSecurite } from '@notak/tableau/securite'
import { verrouPar } from './verrou.ts'
import { CLE_VISITEUR, auteurVisiteur, ecrireChangements, jugerChangements, nomVisiteur } from './visiteurs.ts'
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
  /** Pour les commentaires d'un visiteur, dont le brouillon part pendant qu'il écrit : à défaut, le limiteur commun. */
  limiteurVisiteurs?: Limiteur
  /**
   * Par compte, en plus de la limite par adresse IP : les essais de mot de passe et les demandes de lien visant une même
   * adresse e-mail, d'où qu'ils viennent. À défaut, aucun.
   */
  limiteurCompte?: Limiteur
  maintenant: () => number
  /** Lu à chaque requête : le serveur de synchro naît après l'application. */
  synchro: () => Hocuspocus | null
  /**
   * Combien de relais de confiance sont devant le serveur (`NOTAK_RELAIS`) : l'adresse du client vient alors de
   * `X-Forwarded-For` (voir `adresseTransmise`). 0 : aucun, c'est celle de la connexion.
   */
  relais: number
  cookieSecurise: boolean
  /**
   * L'adresse publique du serveur : celle des liens qui partent par courriel, et celle où la CSP de ses pages laisse
   * passer la synchro en direct (WebSocket).
   */
  origine?: string
  /**
   * D'autres origines dont les pages appellent l'API (`NOTAK_AUTRES_ORIGINES` : le serveur de Vite en développement) :
   * avec `origine`, les seules d'où une écriture est reçue (`ecritureEtrangere`).
   */
  autresOrigines?: readonly string[]
  /** Le build de `apps/web`, servi à côté de l'API ; absent en développement, où Vite s'en charge. */
  dossierWeb?: string
  /** Son nom, ses inscriptions, ses habillages ; absente, celle d'origine (`INSTANCE_PAR_DEFAUT`). */
  instance?: Instance
  /** La clé du chiffrement au repos : les fichiers déposés et leurs copies réduites sont écrits chiffrés. */
  cle?: Cle | null
  /** Où ranger les signalements de bugs (⇧⌘S) ; absent, la route n'existe pas. */
  dossierSignalements?: string | null
  /** Pour écrire à qui l'on invite sur un tableau ; absent, l'invitation ne se donne que par son lien. */
  courrier?: Courrier
  /** Fait tomber les accès arrivés à échéance (`echeances.ts`) ; à défaut, l'application en fabrique un. */
  expirer?: () => Promise<string[]>
  /** Les adresses des admins du serveur (`NOTAK_ADMINS`), en minuscules. */
  admins?: readonly string[]
  /** Ce que sait la vérification des mises à jour ; absente, elle ne se fait pas. */
  misesAJour?: Pick<Verificateur, 'etat'> | null
  /**
   * Pour `POST /api/auth/device/token`, que l'app de bureau interroge toutes les cinq secondes en attendant qu'on
   * confirme son code : à défaut, le limiteur commun.
   */
  limiteurJeton?: Limiteur
  /** D'où et quand chaque code de connexion a été demandé ; à défaut, une mémoire à elle. */
  demandesBureau?: Demandes
  /** Les autres outils dont les fiches ont chacune leur dossier ici (`NOTAK_RATTACHEMENTS`) ; à défaut, aucun. */
  rattachements?: readonly SourceRattachement[]
}

export interface MoyensConnexion {
  fournisseurs: Fournisseur[]
  /** Les courriels partent (réinitialisation du mot de passe, vérification d'adresse). */
  courriel: boolean
}

export const FICHIER_MAX = 25 * 1024 * 1024
/** Le corps d'une requête de la connexion par code (`/api/auth/device/*`), ouverte à tous : quelques champs courts. */
export const CORPS_APPAREIL_MAX = 2048
const ID_TABLEAU = /^[A-Za-z0-9_-]{8,64}$/
const ID_FICHIER = /^[0-9a-f-]{36}$/
const COULEUR_COMPTE = /^#[0-9a-f]{6}$/i
/** Les formats d'une photo de compte : ceux qu'un navigateur affiche sans script (pas de SVG). */
const TYPES_PHOTO = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
/** Combien de tableaux récents la liste montre. */
const RECENTS_AFFICHES = 12
/** Ce que `/api/bibliotheque` rend sans `?genres=` : les genres qu'une app d'avant les photos, liens et fichiers sait montrer. */
const GENRES_D_AVANT = ['toile', 'arbre', 'document']
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
const JETON_INVITATION = /^[A-Za-z0-9_-]{40,64}$/
const ID_LIEN = /^[0-9a-f]{24}$/
/** Combien de liens visiteurs un tableau garde au plus, et la longueur de leur nom. */
const LIENS_MAX = 20
const NOM_LIEN_MAX = 60
/** Une échéance ne se pose pas plus loin que ça : au-delà, c'est « sans limite » qu'on veut dire. */
const ECHEANCE_MAX_MS = 3 * 365 * 24 * 3600 * 1000
/** Le corps d'un envoi de commentaires d'un visiteur, au plus. */
const COMMENTAIRES_MAX = 128 * 1024
/** L'en-tête qui porte la clé d'un visiteur (`visiteurs.ts`). */
const ENTETE_VISITEUR = 'x-notak-visiteur'
/** Une visite se note au plus une fois par minute et par lien. */
const VISITE_NOTEE_MS = 60_000
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

/** `NOTAK_RELAIS` : le nombre de relais de confiance devant le serveur (`1` : Caddy ou Traefik). Absent, `0` ou illisible : aucun. */
export function relaisDe(valeur: string | undefined): number {
  const n = Number(valeur?.trim() || 0)
  return Number.isInteger(n) && n > 0 ? n : 0
}

/**
 * L'adresse du client d'après `X-Forwarded-For`, derrière `relais` relais de confiance. Chaque relais ajoute à droite
 * l'adresse qui l'a joint : seules les `relais` dernières entrées viennent d'eux, celles de gauche sont ce que le client
 * a bien voulu écrire. La n-ième en partant de la droite est donc celle du client. `null` quand elle manque ou n'est pas
 * une adresse IP : on s'en tient alors à celle de la connexion.
 */
export function adresseTransmise(entete: string | undefined, relais: number): string | null {
  if (!entete || relais < 1) return null
  const entrees = entete.split(',')
  const adresse = entrees[entrees.length - relais]?.trim()
  return adresse && isIP(adresse) ? adresse : null
}

/**
 * La clé sous laquelle une adresse compte ses essais. Un client IPv6 tient d'ordinaire tout un /64, et peut prendre une
 * adresse neuve à chaque requête : il compte pour son /64. Une IPv4 compte telle quelle, même écrite en IPv6
 * (`::ffff:203.0.113.5`, ce que donne une prise qui écoute en IPv6). L'adresse exacte reste celle qu'on montre.
 */
export function cleDAdresse(adresse: string): string {
  if (isIP(adresse) !== 6) return adresse
  const groupes = (s: string): number[] =>
    s
      ? s.split(':').flatMap((g) => {
          if (!g.includes('.')) return [parseInt(g, 16)]
          const [a = 0, b = 0, c = 0, d = 0] = g.split('.').map(Number)
          return [(a << 8) | b, (c << 8) | d]
        })
      : []
  const [gauche = '', droite] = adresse.toLowerCase().split('::')
  const g = groupes(gauche)
  const d = droite === undefined ? [] : groupes(droite)
  const n = droite === undefined ? g : [...g, ...new Array<number>(8 - g.length - d.length).fill(0), ...d]
  if (n.slice(0, 5).every((x) => x === 0) && n[5] === 0xffff) return [n[6]! >> 8, n[6]! & 255, n[7]! >> 8, n[7]! & 255].join('.')
  return `${n.slice(0, 4).map((x) => x.toString(16)).join(':')}::/64`
}

const moi = (u: Utilisateur, admin: boolean) => ({ id: u.id, email: u.email, nom: u.nom, couleur: u.couleur, racine: u.racine, photo: u.photo ?? null, admin })

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

/** Les méthodes qui écrivent : celles qu'une page d'ailleurs ne doit pas pouvoir faire partir avec le cookie de quelqu'un. */
const METHODES_QUI_ECRIVENT = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Une écriture vers l'API venue d'une page qui n'est pas de Notak : à refuser. Le cookie de session (`SameSite=Lax`)
 * part aussi avec les requêtes du même site : sur `notak.exemple.fr`, une page de `client.exemple.fr` peut poster un
 * formulaire ou un `text/plain` sans rien demander d'abord, cookie compris. Le type du corps ne suffirait pas à l'écarter
 * (un fichier déposé arrive sous son propre type) ; d'où vient la requête, si.
 *
 * - `Origin` présent : il doit être l'une des `pages` (l'origine du serveur et `NOTAK_AUTRES_ORIGINES`). Un navigateur
 *   l'envoie avec toute requête qui écrit, formulaire compris ; `null` (un cadre isolé, un `data:`) n'en est pas une.
 * - Sans `Origin` : `Sec-Fetch-Site`, s'il est là, doit dire la même origine.
 * - Ni l'un ni l'autre : ce n'est pas un navigateur (un script, `curl`) ; il n'a pas de cookie à emprunter.
 *
 * Hors de la garde : `/api/auth/*`, que Better Auth contrôle déjà (`disableOriginCheck: false`, `auth.ts`), et
 * `/api/arrivee`, ouverte à toute origine, qui ne lit que son jeton `Bearer`, jamais un cookie.
 */
export function ecritureEtrangere(methode: string, chemin: string, entetes: Headers, pages: ReadonlySet<string>): boolean {
  if (!METHODES_QUI_ECRIVENT.has(methode.toUpperCase())) return false
  if (!chemin.startsWith('/api/') || chemin === '/api/arrivee' || chemin.startsWith(`${CHEMIN_AUTH}/`)) return false
  const origine = entetes.get('origin')
  if (origine !== null) return !pages.has(origine)
  const site = entetes.get('sec-fetch-site')
  return site !== null && site !== 'same-origin'
}

export function creerApp(ctx: Contexte): Hono {
  const { base } = ctx
  const cle = ctx.cle ?? null
  const admins = new Set(ctx.admins ?? [])
  const demandesBureau = ctx.demandesBureau ?? creerDemandes()
  const app = new Hono()

  const utilisateurCourant = (c: Context): Promise<Utilisateur | null> => utilisateurDeSession(ctx.auth, base, c.req.raw.headers)
  const estAdmin = (u: Utilisateur) => admins.has(normaliserEmail(u.email))

  // Avant toute route : une écriture n'est reçue que des pages de Notak (`ecritureEtrangere`). Comparées à `Origin`,
  // que le navigateur écrit toujours de la même façon (`normaliserOrigine`).
  const pages = new Set([ctx.origine, ...(ctx.autresOrigines ?? [])].filter((o): o is string => !!o).map((o) => normaliserOrigine(o) ?? o))
  app.use('/api/*', async (c, suite) => {
    if (ecritureEtrangere(c.req.method, c.req.path, c.req.raw.headers, pages)) return c.json({ erreur: 'origine refusée', code: 'origine_refusee' }, 403)
    await suite()
  })

  // Dit une fois : un relais qui n'ajoute pas l'adresse attendue (un CDN devant Caddy, sans que Caddy le croie) met
  // tous les clients sous celle de la connexion, et dix connexions par minute ferment la porte à tout le monde.
  let relaisMuetDit = false
  const adresseIp = (c: Context): string => {
    const entete = c.req.header('x-forwarded-for')
    const transmise = adresseTransmise(entete, ctx.relais)
    if (transmise) return transmise
    if (entete && ctx.relais > 0 && !relaisMuetDit) {
      relaisMuetDit = true
      console.warn(
        `Notak : NOTAK_RELAIS=${ctx.relais}, mais X-Forwarded-For (${entete.split(',').length} entrée(s)) n'a pas d'adresse IP à cette place : ` +
          'l’adresse de la connexion est prise, et tous les clients du relais comptent pour un seul. Voir docs/AUTO-HEBERGER.md, « Le relais HTTPS ».',
      )
    }
    try {
      return getConnInfo(c).remote.address ?? 'inconnue'
    } catch {
      return 'inconnue'
    }
  }

  const limiter = (c: Context, route: string, limiteur: Limiteur = ctx.limiteur): Response | null => {
    const cle = `${route}:${cleDAdresse(adresseIp(c))}`
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
    '/reset-password': 'reinitialisation',
    '/sign-in/sso': 'connexion',
    // L'app de bureau qui demande un code, et la page où on le confirme : un code ne se devine pas à dix essais la minute.
    '/device/code': 'code-appareil',
    '/device/approve': 'accord-appareil',
    '/device/deny': 'accord-appareil',
  }
  // Ouvrir la page de confirmation lit le code et le prend en main pour son compte : il se limite comme le reste.
  const LIMITES_AUTH_GET: Record<string, string> = { '/device': 'accord-appareil' }
  // Ces gestes visent un compte par son adresse e-mail : ils se limitent aussi par compte. Mille machines qui se
  // partagent les essais ne devinent pas plus vite un mot de passe, et ne remplissent pas la boîte de quelqu'un de
  // liens qu'il n'a pas demandés. La limite tombe que le compte existe ou non : elle ne dit rien de lui.
  const PAR_COMPTE = new Set(['/sign-in/email', '/request-password-reset'])
  const limiterCompte = async (c: Context, chemin: string): Promise<Response | null> => {
    if (!ctx.limiteurCompte || !PAR_COMPTE.has(chemin)) return null
    const b: unknown = await c.req.raw
      .clone()
      .json()
      .catch(() => null)
    const email = b && typeof b === 'object' && 'email' in b ? normaliserEmail(texte(b.email)) : ''
    if (!email) return null
    const maintenant = ctx.maintenant()
    const cle = `${chemin}:${email}`
    if (ctx.limiteurCompte.autoriser(cle, maintenant)) return null
    const secondes = Math.ceil(ctx.limiteurCompte.attente(cle, maintenant) / 1000)
    return c.json({ erreur: 'trop d’essais', code: 'trop_d_essais' }, 429, { 'retry-after': String(secondes) })
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

  /** Un outil déclaré par `NOTAK_RATTACHEMENTS`, par ce qu'il écrit dans l'adresse. */
  const sourceNommee = (nom: string) => ctx.rattachements?.find((r) => r.source === nom)
  /** Ce que deviennent les dossiers rattachés quand une personne en jette ou remet la carte (le même que la synchro). */
  const suiviDesDossiers = suivreLesDossiers({ base, sources: () => ctx.rattachements ?? [], maintenant: ctx.maintenant })

  const instance = ctx.instance ?? INSTANCE_PAR_DEFAUT
  // Ce que l'écran de connexion lit avant tout compte : il se règle dessus (nom, inscription, thème). Et si l'instance
  // reçoit les signalements de bugs : l'app d'iPhone n'ouvre la fenêtre d'une secousse ou d'une capture d'écran que là
  // où l'envoi aboutira (la route, elle, le dit déjà par son 404).
  app.get('/api/instance', (c) => c.json({ ...instance, version: VERSION_NOTAK, signalements: ctx.dossierSignalements != null }))

  // « Est-ce bien un serveur Notak, et lequel ? » : l'app de bureau avant de s'y connecter, la surveillance du
  // conteneur (HEALTHCHECK). Sans compte, sans base, sans limite : rien n'y coûte.
  app.get('/api/sante', (c) => c.json({ produit: 'notak', version: VERSION_NOTAK, origine: ctx.origine ?? null, ok: true }, 200, { 'cache-control': 'no-store' }))

  // Une version plus récente existe-t-elle ? Les admins du serveur seulement : c'est à eux de tirer la nouvelle image.
  app.get('/api/instance/mise-a-jour', async (c) => {
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    if (!estAdmin(u)) return c.json({ erreur: 'interdit', code: 'interdit' }, 403)
    return c.json(ctx.misesAJour?.etat() ?? { actuelle: VERSION_NOTAK, active: false }, 200, { 'cache-control': 'no-store' })
  })

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
    const chemin = c.req.path.slice(CHEMIN_AUTH.length)
    const poste = c.req.method === 'POST'
    const route = (poste ? LIMITES_AUTH : LIMITES_AUTH_GET)[chemin]
    // Le jeton de l'app de bureau a sa propre limite, large : elle le redemande toutes les cinq secondes, dix minutes
    // durant, et Better Auth refuse déjà, code par code, qui le demande plus vite (`slow_down`).
    const refus =
      poste && chemin === '/device/token'
        ? limiter(c, 'jeton-appareil', ctx.limiteurJeton)
        : route
          ? (limiter(c, route) ?? (poste ? await limiterCompte(c, chemin) : null))
          : null
    if (refus) return refus
    let requete = c.req.raw
    // La connexion par code s'ouvre à qui n'a pas de compte : son corps ne se lit pas au-delà de quelques champs, ni en
    // mémoire ni dans la base. Un corps sans longueur annoncée (envoi par morceaux) s'arrête aussi à la borne.
    if (poste && chemin.startsWith('/device/')) {
      const annonce = Number(c.req.header('content-length') ?? 0)
      const lu = annonce > CORPS_APPAREIL_MAX ? 'trop gros' : await lireBorne(c.req.raw.body, CORPS_APPAREIL_MAX)
      if (lu === 'trop gros') return c.json({ error: 'invalid_request', error_description: 'corps trop gros' }, 413)
      const entetes = new Headers(c.req.raw.headers)
      entetes.delete('content-length')
      requete = new Request(c.req.raw.url, { method: 'POST', headers: entetes, body: lu })
    }
    const reponse = await ctx.auth.handler(requete)
    if (poste && chemin === '/device/code' && reponse.ok) await noterDemande(c, reponse)
    // Un membre, un rôle ou une équipe a pu changer (une invitation acceptée, un SSO qui fait entrer quelqu'un) :
    // les droits suivent avant que la réponse parte.
    await droitsAJour()
    return reponse
  })

  /** Retient d'où vient la demande d'un code de connexion, pour la montrer à qui le confirme. */
  const noterDemande = async (c: Context, reponse: Response) => {
    const lu: unknown = await reponse
      .clone()
      .json()
      .catch(() => null)
    const code = lu && typeof lu === 'object' && 'user_code' in lu ? lu.user_code : null
    if (typeof code === 'string') demandesBureau.noter(code, adresseIp(c), ctx.maintenant())
    base.oublierDemandesAppareilExpirees(Date.now())
  }

  // La page qui fait confirmer un code : d'où et quand l'app l'a demandé, et d'où l'on confirme. Seulement pour le
  // compte qui a ouvert la page de ce code (`GET /api/auth/device?user_code=…` le prend en main) : l'adresse d'une
  // app ne se montre pas à qui devinerait son code.
  app.get('/api/bureau/demande', async (c) => {
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    const code = normaliserCode(c.req.query('user_code') ?? '')
    const maintenant = ctx.maintenant()
    const enBase = code ? base.demandeAppareil(code) : null
    // L'expiration est celle de Better Auth, à l'heure de la machine.
    const demande = enBase && enBase.compte === u.id && enBase.expire > Date.now() ? demandesBureau.lire(code, maintenant) : null
    if (!demande) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    return c.json({ ip: demande.ip, quand: demande.quand, ipActuelle: adresseIp(c) }, 200, { 'cache-control': 'no-store' })
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
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    // Une adresse tout juste vérifiée (le lien du courriel, un fournisseur relié) ouvre ce qui l'attendait ; le SSO d'un
    // espace qui l'avait invité l'y fait entrer.
    const ouverts = base.invitationsPour(u.email).length > 0 ? activerInvitations(base, u, ctx.maintenant()).length : 0
    if (ouverts + entrerParLeSso(base, u, ctx.maintenant()).length > 0) await droitsAJour()
    return c.json(moi(u, estAdmin(u)))
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
    return c.json(moi(base.utilisateurParId(u.id) ?? u, estAdmin(u)))
  })

  // ---- Tableaux ----

  const expirer = ctx.expirer ?? creerExpiration(base, ctx.autorisation, ctx.synchro, ctx.maintenant)
  /** Un accès arrivé à échéance tombe avant qu'on lise un droit : le passage ne coûte qu'une requête indexée sinon. */
  const echus = async () => {
    if (base.echeanceAtteinte(ctx.maintenant())) await expirer()
  }
  /** Le rôle hérité : un accès donné sur un tableau vaut pour tout ce qu'il contient. */
  const roleSur = async (utilisateur: string, id: string): Promise<Role | null> => {
    await echus()
    return ctx.autorisation.roleSur(`user:${utilisateur}`, id)
  }
  /** Les tableaux que ce compte peut lire, d'après OpenFGA. */
  const lisibles = async (utilisateur: string): Promise<string[]> => {
    await echus()
    return ctx.autorisation.lister(`user:${utilisateur}`, 'peut_lire', 'tableau')
  }
  /** Ferme les connexions ouvertes sur un tableau et ses descendants : chacun y relira son rôle. */
  const fermerConnexions = (id: string) => {
    for (const t of [id, ...base.descendants(id)]) ctx.synchro()?.closeConnections(nomDuDocument(t))
  }
  /**
   * Jusqu'à quand le créateur d'un tableau posé sous `parent` le garde : il ne le tient pas plus longtemps que l'édition
   * qui lui permet de l'y créer. C'est la plus tardive des échéances des accès qui la lui donnent, sur le parent ou
   * plus haut, à lui ou à une équipe dont il est membre ; `null` si l'un d'eux n'en a pas, ou s'il l'a par l'espace.
   */
  const echeanceHeritee = (utilisateur: string, parent: string): number | null => {
    const sujet = `user:${utilisateur}`
    const membre = (equipe: string) => base.relationExiste({ objet: `equipe:${equipe}`, relation: 'membre', sujet })
    const parLEspace = (espace: string) =>
      base
        .relationsSur(`espace:${espace}`)
        .some((r) => (r.relation === 'modifie_tableaux' || r.relation === 'administre_tableaux') && r.sujet.endsWith('#assignee') && base.relationExiste({ objet: r.sujet.slice(0, -'#assignee'.length), relation: 'assignee', sujet }))
    let plusTardive: number | null = null
    const vus = new Set<string>()
    for (let t: string | null = parent; t !== null && !vus.has(t); t = base.tableau(t)?.parent ?? null) {
      vus.add(t)
      const espace = base.tableau(t)?.espace
      if (espace && parLEspace(espace)) return null
      for (const r of base.relationsSur(`tableau:${t}`)) {
        if (r.relation !== RELATION_DU_ROLE.edition && r.relation !== RELATION_DU_ROLE.proprietaire) continue
        const equipe = /^equipe:(.+)#membre$/.exec(r.sujet)?.[1]
        if (r.sujet !== sujet && !(equipe && membre(equipe))) continue
        const fin = base.echeance(t, r.sujet)
        if (fin === null) return null
        plusTardive = Math.max(plusTardive ?? fin, fin)
      }
    }
    return plusTardive
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
    // Créé pendant un accès temporaire, il tombe avec lui.
    const fin = heritage && parent !== null ? echeanceHeritee(u.id, parent) : null
    base.transaction(() => {
      base.creerTableau({ id, titre, proprietaire: u.id, parent: heritage ? parent : null, espace })
      base.definirAcces({ tableau: id, utilisateur: u.id, role: 'proprietaire' })
      if (fin !== null) base.definirEcheance(id, `user:${u.id}`, fin)
    })
    await droitsAJour()
    return c.json({ id, titre, role: 'proprietaire' }, 201)
  })

  app.get('/api/tableaux', async (c) => {
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    await echus()
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
  const garde = async (c: Context, minimum: Role, horsVerrou = false): Promise<{ u: Utilisateur; id: string; role: Role } | Response> => {
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
    return { u, id, role: droit }
  }

  /**
   * L'échéance demandée (`expire`, en ms) : `null` sans limite, un instant à venir (trois ans au plus), ou `'invalide'`.
   * Absente, `undefined` : ne rien changer.
   */
  const echeanceDemandee = (b: Record<string, unknown> | null): number | null | undefined | 'invalide' => {
    if (!b || !('expire' in b)) return undefined
    const v = b.expire
    if (v === null) return null
    const maintenant = ctx.maintenant()
    return typeof v === 'number' && Number.isInteger(v) && v > maintenant && v <= maintenant + ECHEANCE_MAX_MS ? v : 'invalide'
  }

  /** L'adresse d'une invitation : le jeton voyage après `#`, il ne passe ni dans les journaux ni dans un référent. */
  const adresseInvitation = (jeton: string) => `${ctx.origine ?? ''}/invitation#${jeton}`

  /** Écrit l'invitation à son adresse, si les courriels partent ; rend vrai si elle est partie. */
  const envoyerInvitation = async (i: Invitation, jeton: string, par: Utilisateur): Promise<boolean> => {
    if (!ctx.courrier?.actif || !ctx.origine) return false
    const titre = base.tableau(i.tableau)?.titre || 'Sans titre'
    const droit = { edition: 'le modifier', commentaire: 'le commenter', lecture: 'le consulter', proprietaire: 'le gérer' }[i.role]
    const fin = i.echeance === null ? '' : `\nL'accès prendra fin le ${new Date(i.echeance).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.`
    try {
      await ctx.courrier.envoyer({
        a: i.email,
        sujet: `Notak : ${par.nom} vous invite sur « ${titre} »`,
        texte: `${par.nom} vous invite à ouvrir le tableau « ${titre} », pour ${droit}.${fin}\n\nPour l'accepter, ouvrez ce lien (valable trente jours) :\n${adresseInvitation(jeton)}\n\nSi vous ne vous attendiez pas à ce message, ignorez-le : sans ce lien, rien ne s'ouvre.`,
      })
      return true
    } catch (e) {
      console.warn(`Notak : l'invitation à ${i.email} n'est pas partie (${(e as Error).message})`)
      return false
    }
  }

  /**
   * Invite une adresse : l'invitation garde l'empreinte d'un jeton neuf (l'ancien lien ne vaut plus), part par
   * courriel si l'on peut, et rend le jeton, que celui qui invite peut transmettre lui-même.
   */
  const inviter = async (tableau: string, email: string, role: Role, echeance: number | null, par: Utilisateur) => {
    const { jeton, empreinte } = nouveauJeton()
    const i: Invitation = { tableau, email, role, cree: ctx.maintenant(), par: par.id, echeance }
    base.definirInvitation({ ...i, jeton: empreinte })
    return { jeton, envoye: await envoyerInvitation(i, jeton, par) }
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
    // Qui n'est pas propriétaire voit qui travaille ici, sans les adresses ni les invitations : un invité de
    // l'extérieur n'apprend pas les adresses de l'équipe. Il voit l'échéance de son propre accès.
    const gerant = g.role === 'proprietaire'
    // Les accès du tableau et ceux de ses ancêtres ; `herite` : donné plus haut, il se retire là-haut.
    const chaine: string[] = []
    for (let t: string | null = g.id; t !== null && !chaine.includes(t); t = base.tableau(t)?.parent ?? null) chaine.push(t)
    const meilleurs = new Map<string, { role: Role; herite: boolean; expire: number | null }>()
    for (const t of chaine) {
      for (const a of base.acces(t)) {
        if (meilleurs.has(a.utilisateur)) continue
        const r = await roleSur(a.utilisateur, g.id)
        if (r) meilleurs.set(a.utilisateur, { role: r, herite: role(base.acces(g.id), a.utilisateur, g.id) !== r, expire: base.echeance(t, `user:${a.utilisateur}`) })
      }
    }
    // Les équipes qui ont reçu le tableau (ou un tableau au-dessus) : leur rôle donné, le plus proche l'emporte.
    const equipes = new Map<string, { equipe: string; nom: string; role: Role; herite: boolean; expire: number | null }>()
    for (const t of chaine) {
      for (const r of base.relationsSur(`tableau:${t}`)) {
        const m = /^equipe:(.+)#membre$/.exec(r.sujet)
        const donne = roleDeRelation(r.relation)
        const eq = m ? base.equipe(m[1]!) : null
        if (eq && donne && !equipes.has(eq.id)) equipes.set(eq.id, { equipe: eq.id, nom: eq.nom, role: donne, herite: t !== g.id, expire: base.echeance(t, r.sujet) })
      }
    }
    const membres = [...meilleurs].flatMap(([id, { role: r, herite, expire }]) => {
      const m = base.utilisateurParId(id)
      if (!m) return []
      const soi = id === g.u.id
      return [{ utilisateur: m.id, email: gerant || soi ? m.email : '', nom: m.nom, role: r, enAttente: false, herite, expire: gerant || soi ? expire : null }]
    })
    if (!gerant) return c.json(membres)
    const emails = new Set<string>()
    const maintenant = ctx.maintenant()
    const attente = chaine.flatMap((t) =>
      base.invitations(t).flatMap((i) => {
        if (emails.has(i.email)) return []
        emails.add(i.email)
        return [{ email: i.email, role: i.role, enAttente: true, herite: t !== g.id, expire: i.echeance, invitation: { cree: i.cree, valable: invitationValable(i, maintenant) } }]
      }),
    )
    return c.json([...membres, ...[...equipes.values()].map((e) => ({ ...e, email: '', enAttente: false })), ...attente])
  })

  /**
   * Partager à une adresse ou à une équipe, avec un rôle et, s'il le faut, une échéance (`expire`, en ms ; `null` :
   * sans limite). Un compte dont l'adresse est vérifiée reçoit l'accès tout de suite. Sinon, une invitation : son lien
   * part par courriel si l'on peut, et la réponse le rend (`jeton`), pour que celui qui invite puisse le donner
   * lui-même. Un compte sous une adresse qu'il n'a jamais prouvée n'est pas la personne qu'on croit inviter.
   */
  app.post('/api/tableaux/:id/partage', async (c) => {
    const g = await garde(c, 'proprietaire')
    if (g instanceof Response) return g
    const b = await corps(c)
    const email = normaliserEmail(texte(b?.email))
    const nouveau = b?.role
    const expire = echeanceDemandee(b)
    if (nouveau !== 'edition' && nouveau !== 'commentaire' && nouveau !== 'lecture') return c.json({ erreur: 'demande invalide', code: 'demande_invalide' }, 400)
    if (expire === 'invalide') return c.json({ erreur: 'échéance invalide', code: 'echeance_invalide' }, 400)
    // À une équipe : celle d'un espace dont on est membre.
    if (typeof b?.equipe === 'string') {
      const eq = base.equipe(b.equipe)
      if (!eq || !base.roleMembre(eq.espace, g.u.id)) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
      const sujet = `equipe:${eq.id}#membre`
      base.transaction(() => {
        base.definirRoleDe(g.id, sujet, nouveau)
        base.definirEcheance(g.id, sujet, expire ?? null)
      })
      await droitsAJour()
      fermerConnexions(g.id)
      return c.json({ equipe: eq.id, nom: eq.nom, role: nouveau, enAttente: false, expire: expire ?? null })
    }
    if (!email || !/^[^\s@]+@[^\s@]+$/.test(email) || email.length > 254) return c.json({ erreur: 'demande invalide', code: 'demande_invalide' }, 400)
    const cible = base.utilisateurParEmail(email)
    // Quelqu'un déjà admis ici (par le lien d'une invitation) change seulement de rôle.
    if (cible && (base.emailVerifie(cible.id) || role(base.acces(g.id), cible.id, g.id) !== null)) {
      const avant = role(base.acces(g.id), cible.id, g.id)
      if (avant === 'proprietaire') return c.json({ erreur: 'propriétaire', code: 'proprietaire' }, 409)
      base.transaction(() => {
        base.definirAcces({ tableau: g.id, utilisateur: cible.id, role: nouveau })
        base.definirEcheance(g.id, `user:${cible.id}`, expire ?? null)
        base.retirerInvitation(g.id, email)
      })
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
      return c.json({ email, role: nouveau, enAttente: false, expire: expire ?? null })
    }
    const { jeton, envoye } = await inviter(g.id, email, nouveau, expire ?? null, g.u)
    // Une instance fermée aux inscriptions : la personne n'aura de compte que par l'administrateur.
    const fermee = !cible && ctx.instance?.inscriptions === 'fermees'
    return c.json({ email, role: nouveau, enAttente: true, expire: expire ?? null, jeton, envoye, ...(fermee ? { inscriptionsFermees: true } : {}) })
  })

  // Changer le rôle ou l'échéance d'un accès déjà donné, ou d'une invitation en attente, sans la renvoyer.
  app.patch('/api/tableaux/:id/partage', async (c) => {
    const g = await garde(c, 'proprietaire')
    if (g instanceof Response) return g
    const b = await corps(c)
    const nouveau = b?.role
    const expire = echeanceDemandee(b)
    if ((nouveau !== undefined && nouveau !== 'edition' && nouveau !== 'commentaire' && nouveau !== 'lecture') || expire === 'invalide') {
      return c.json({ erreur: 'demande invalide', code: 'demande_invalide' }, 400)
    }
    let sujet: string | null = null
    if (typeof b?.equipe === 'string') {
      sujet = `equipe:${b.equipe}#membre`
      if (!base.relationsSur(`tableau:${g.id}`).some((r) => r.sujet === sujet)) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    } else {
      const email = normaliserEmail(texte(b?.email))
      const cible = email ? base.utilisateurParEmail(email) : null
      const avant = cible ? role(base.acces(g.id), cible.id, g.id) : null
      if (cible && avant) {
        if (avant === 'proprietaire') return c.json({ erreur: 'propriétaire', code: 'proprietaire' }, 409)
        sujet = `user:${cible.id}`
      } else {
        const i = base.invitations(g.id).find((x) => x.email === email)
        if (!i) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
        base.modifierInvitation(g.id, email, { role: nouveau ?? i.role, echeance: expire === undefined ? i.echeance : expire })
        return c.body(null, 204)
      }
    }
    base.transaction(() => {
      if (nouveau !== undefined) base.definirRoleDe(g.id, sujet!, nouveau)
      if (expire !== undefined) base.definirEcheance(g.id, sujet!, expire)
    })
    await droitsAJour()
    fermerConnexions(g.id)
    return c.body(null, 204)
  })

  // Un nouveau lien pour une invitation en attente : l'ancien ne vaut plus, et le nouveau repart par courriel.
  app.post('/api/tableaux/:id/invitations/lien', async (c) => {
    const g = await garde(c, 'proprietaire')
    if (g instanceof Response) return g
    const email = normaliserEmail(texte((await corps(c))?.email))
    const i = base.invitations(g.id).find((x) => x.email === email)
    if (!i) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    if (i.echeance !== null && i.echeance <= ctx.maintenant()) return c.json({ erreur: 'échéance passée', code: 'echeance_passee' }, 409)
    return c.json(await inviter(g.id, i.email, i.role, i.echeance, g.u))
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
      // Une invitation restée pour la même adresse tombe avec l'accès.
      base.retirerInvitation(g.id, email)
      await droitsAJour()
      fermerConnexions(g.id)
    } else if (!base.retirerInvitation(g.id, email)) {
      return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    }
    return c.body(null, 204)
  })

  // ---- Accepter une invitation ----
  // Le lien d'une invitation (`/invitation#<jeton>`) : n'importe qui peut lire ce qu'elle propose, puisqu'il a le lien ;
  // l'accepter demande un compte, qui reçoit l'accès. Seule l'empreinte du jeton est gardée.

  /** L'invitation de ce jeton, si elle s'accepte encore ; sinon la réponse à rendre. */
  const invitationDe = (c: Context): Invitation | Response => {
    const jeton = c.req.param('jeton') ?? ''
    const i = JETON_INVITATION.test(jeton) ? base.invitationDuJeton(empreinteDe(jeton)) : null
    if (!i || !base.tableau(i.tableau)) return c.json({ erreur: 'invitation introuvable', code: 'invitation_introuvable' }, 404)
    if (!invitationValable(i, ctx.maintenant())) return c.json({ erreur: 'invitation expirée', code: 'invitation_expiree' }, 410)
    return i
  }

  app.get('/api/invitations/:jeton', async (c) => {
    const refus = limiter(c, 'invitation')
    if (refus) return refus
    const i = invitationDe(c)
    if (i instanceof Response) return i
    const par = i.par ? base.utilisateurParId(i.par) : null
    return c.json(
      { titre: base.tableau(i.tableau)?.titre ?? '', par: par?.nom ?? null, role: i.role, email: i.email, expire: i.echeance, valableJusquA: i.cree + DUREE_INVITATION_MS },
      200,
      { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' },
    )
  })

  app.post('/api/invitations/:jeton/accepter', async (c) => {
    const refus = limiter(c, 'invitation')
    if (refus) return refus
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    const i = invitationDe(c)
    if (i instanceof Response) return i
    accorderInvitation(base, i, u.id)
    await droitsAJour()
    fermerConnexions(i.tableau)
    return c.json({ tableau: i.tableau })
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
    await echus()
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
    const ouverts = await lisibles(u.id)
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

  // Une carte mentale, une page, une photo, un lien ou un fichier en favori : il doit être sur la toile, hors corbeille.
  app.put('/api/tableaux/:id/elements/:element/favori', async (c) => {
    const g = await garde(c, 'lecture')
    if (g instanceof Response) return g
    const element = c.req.param('element')
    if (!base.contenus([g.id]).some((x) => x.element === element && x.genre !== 'toile')) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    base.definirFavoriElement(g.u.id, g.id, element, ctx.maintenant())
    return c.body(null, 204)
  })

  app.delete('/api/tableaux/:id/elements/:element/favori', async (c) => {
    const g = await garde(c, 'lecture')
    if (g instanceof Response) return g
    base.retirerFavoriElement(g.u.id, g.id, c.req.param('element'))
    return c.body(null, 204)
  })

  /**
   * Range une toile dans une autre (la bibliothèque, ou sa carte glissée d'une toile à l'autre). Il faut posséder la
   * toile et pouvoir écrire dans la nouvelle ; ni l'accueil, ni dans elle-même ou ce qu'elle contient, ni d'un espace à
   * un autre. Ses accès hérités suivent : la réponse dit ce que cela change pour les autres (`Bilan` : qui y gagne ou y
   * perd l'accès, qui le garde désormais sans échéance, quels liens de visiteurs y mènent ou n'y mènent plus). `essai`
   * ne fait que compter ; `siPersonne` ne range que si cela ne change rien pour personne.
   */
  app.put('/api/tableaux/:id/parent', async (c) => {
    const g = await garde(c, 'proprietaire')
    if (g instanceof Response) return g
    const b = await corps(c)
    const parent = texte(b?.parent)
    const ligne = base.tableau(g.id)
    const cible = parent ? base.tableau(parent) : null
    if (!ligne || !cible) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    const racineDEspace = ligne.espace ? base.espace(ligne.espace)?.racine === g.id : false
    if (g.id === g.u.racine || racineDEspace) return c.json({ erreur: 'accueil', code: 'accueil_immobile' }, 400)
    const droit = await roleSur(g.u.id, parent)
    if (droit === null) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    if (!auMoins(droit, 'edition')) return c.json({ erreur: 'interdit', code: 'interdit' }, 403)
    if (parent === g.id || base.descendants(g.id).includes(parent)) return c.json({ erreur: 'boucle', code: 'dossier_dans_lui' }, 400)
    if ((cible.espace ?? null) !== (ligne.espace ?? null)) return c.json({ erreur: 'autre espace', code: 'autre_espace' }, 400)
    if (ligne.parent === parent) return c.json({ ...AUCUN_CHANGEMENT, fait: true })
    // Ce que chacun y gagne ou y perd. Celui qui range, et les membres d'un espace d'équipe (leur accès vient de
    // l'espace, qui ne change pas), n'y comptent pas.
    const espaceDEquipe = ligne.espace && !base.espace(ligne.espace)?.personnel ? ligne.espace : null
    const bilan = bilanDuRangement(base, g.id, ligne.parent, parent, (sujet) => {
      if (sujet === `user:${g.u.id}`) return true
      return espaceDEquipe !== null && sujet.startsWith('user:') && base.roleMembre(espaceDEquipe, sujet.slice(5)) !== null
    })
    if (b?.essai === true || (b?.siPersonne === true && !rienNeChange(bilan))) return c.json({ ...bilan, fait: false })
    base.changerParent(g.id, parent)
    // Les accès hérités de l'ancien parent ne valent plus, ici ni plus bas : chacun relit son rôle.
    await droitsAJour()
    fermerConnexions(g.id)
    return c.json({ ...bilan, fait: true })
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

  // Et chaque élément qu'il ouvre en grand : une carte mentale, une page, une photo, un lien, un fichier.
  app.post('/api/tableaux/:id/elements/:element/vu', async (c) => {
    const g = await garde(c, 'lecture')
    if (g instanceof Response) return g
    const element = c.req.param('element')
    if (!base.contenus([g.id]).some((x) => x.element === element && x.genre !== 'toile')) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    base.noterElementVu(g.u.id, g.id, element, ctx.maintenant())
    return c.body(null, 204)
  })

  /**
   * Ce que le compte lit, hors des mots de passe pas encore donnés, ce que portent ces toiles, et la règle du
   * rangement, la même que dans l'app (catalogue.ts) : chaque toile lue, son parent en base, ses cartes.
   */
  const rangementPour = async (u: Utilisateur) => {
    const ouverts = (await lisibles(u.id)).filter((id) => verrouPar(base, u.id, id) === null)
    const lignes = base.contenus(ouverts).map((l) => ({ ...l, lu: JSON.parse(l.resume) as { cartes?: string[]; jetees?: string[] } }))
    const resumesDesToiles = new Map(lignes.flatMap((l) => (l.genre === 'toile' ? [[l.tableau, l.lu] as const] : [])))
    // Un dossier rattaché à la corbeille y reste, sa carte effacée ou non : la table le dit (`rattachements.corbeille`).
    // Il entre dans la règle comme une carte jetée, et ce qu'il range le suit.
    const aLaCorbeille = base.rattachementsDe(ouverts).flatMap((r) => (r.cle && r.corbeille !== null ? [r.tableau] : []))
    const { dossierDe, cachees } = rangerLesToiles([
      ...ouverts.map((id) => {
        const lu = resumesDesToiles.get(id)
        return { id, parent: base.tableau(id)?.parent ?? null, ...(lu?.cartes ? { cartes: lu.cartes } : {}), ...(lu?.jetees ? { jetees: lu.jetees } : {}) }
      }),
      ...(aLaCorbeille.length ? [{ id: '\u0000corbeille', parent: null, jetees: aLaCorbeille }] : []),
    ])
    return { ouverts, lignes, dossierDe, cachees }
  }

  /**
   * La bibliothèque : chaque toile que le compte peut lire (sauf son accueil), et ce qu'elles portent (cartes mentales,
   * pages, et, si on les demande par `?genres=`, photos, liens et fichiers), avec la toile qui les porte (son titre,
   * `ou`, et son identifiant, `dans`), la dernière fois qu'il les a ouverts, et ses favoris et partages. Ce qui est sous
   * un mot de passe pas encore donné n'y est pas. Une toile est dans celle qui porte sa carte, où qu'on l'ait glissée ;
   * sa carte jetée, elle est à la corbeille et n'y est plus, ni rien de ce qu'elle contient. Sans `?genres=`, les
   * genres d'avant seulement : une app plus ancienne, branchée sur ce serveur, ne reçoit rien qu'elle ne sait montrer.
   */
  app.get('/api/bibliotheque', async (c) => {
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    await anciensDossiersRanges()
    const demandes = c.req.query('genres')?.split(',')
    const genres = new Set<string>(demandes?.length ? [...demandes, 'toile'] : GENRES_D_AVANT)
    const { ouverts, lignes, dossierDe, cachees } = await rangementPour(u)
    const ouvrables = new Set(ouverts)
    const vus = new Map(base.vus(u.id).map((v) => [`${v.tableau}/${v.element}`, v.vu]))
    const favoris = new Set(base.favoris(u.id))
    const favorisElements = new Set(base.favorisElements(u.id))
    const partages = new Set(base.tableauxAccessibles(u.id).flatMap((t) => (t.role === 'proprietaire' ? [] : [t.id])))
    const titres = new Map<string, string>()
    const titreDe = (id: string) => {
      if (!titres.has(id)) titres.set(id, base.tableau(id)?.titre ?? '')
      return titres.get(id)!
    }
    // Le dossier d'une fiche d'un autre outil mène à sa fiche, tant que l'outil est déclaré.
    const fiches = new Map(
      base.rattachementsDe(ouverts).flatMap((r) => {
        const source = sourceNommee(r.source)
        return r.cle && source && dossierDeLaSource(ctx.rattachements ?? [], r) ? [[r.tableau, { nom: source.nom, ...(r.adresse ? { adresse: r.adresse } : {}) }] as const] : []
      }),
    )
    const entrees = lignes.flatMap((l) => {
      if ((l.genre === 'toile' && l.tableau === u.racine) || cachees.has(l.tableau) || !genres.has(l.genre)) return []
      const ligne = base.tableau(l.tableau)
      if (!ligne) return []
      const toile = l.genre === 'toile'
      const parent = toile ? dossierDe(l.tableau) : l.tableau
      const { cartes: _c, jetees: _j, ...resume } = l.lu
      return [
        {
          tableau: l.tableau,
          element: toile ? null : l.element,
          genre: l.genre,
          titre: toile ? ligne.titre : l.titre,
          resume,
          ou: parent && ouvrables.has(parent) ? titreDe(parent) : null,
          dans: parent && ouvrables.has(parent) ? parent : null,
          vu: vus.get(`${l.tableau}/${l.element}`) ?? null,
          favori: toile ? favoris.has(l.tableau) : favorisElements.has(`${l.tableau}/${l.element}`),
          partage: toile && partages.has(l.tableau),
          ...(toile && fiches.has(l.tableau) ? { fiche: fiches.get(l.tableau) } : {}),
        },
      ]
    })
    return c.json(entrees)
  })

  // ---- Liens visiteurs ----
  // Pour quelqu'un sans compte. Un tableau en a autant qu'on veut en donner (vingt au plus) : un par destinataire, pour
  // en fermer un sans fermer les autres. Chacun voit le tableau, ou le voit et le commente ; aucun ne modifie rien.
  // Chacun peut avoir une échéance et un mot de passe. Un visiteur ne se synchronise jamais : il lit `vuePublique`.

  /** Ce que le propriétaire voit d'un lien : tout, sauf l'empreinte de son mot de passe. */
  const lienVu = (l: LienVisiteur) => ({
    id: l.id,
    jeton: l.jeton,
    nom: l.nom,
    niveau: l.niveau,
    cree: l.cree,
    expire: l.expire,
    echu: l.expire !== null && l.expire <= ctx.maintenant(),
    protege: l.motDePasse !== null,
    derniereVisite: l.derniereVisite,
  })

  /** Le lien désigné par l'adresse, s'il est bien un lien de ce tableau ; sinon la réponse à rendre. */
  const lienDuTableau = (c: Context, tableau: string): LienVisiteur | Response => {
    const id = c.req.param('lien') ?? ''
    const l = ID_LIEN.test(id) ? base.lienVisiteur(id) : null
    return l && l.tableau === tableau ? l : c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
  }

  const niveauDemande = (v: unknown): NiveauVisiteur | undefined | 'invalide' =>
    v === undefined ? undefined : v === 'lecture' || v === 'commentaire' ? v : 'invalide'
  const nomDemande = (v: unknown): string | undefined | 'invalide' =>
    v === undefined ? undefined : typeof v === 'string' && v.trim().length <= NOM_LIEN_MAX ? v.replace(/\s+/g, ' ').trim() : 'invalide'

  app.get('/api/tableaux/:id/liens', async (c) => {
    const g = await garde(c, 'proprietaire')
    if (g instanceof Response) return g
    return c.json(base.liensVisiteurs(g.id).map(lienVu), 200, { 'cache-control': 'no-store' })
  })

  // Un lien neuf : `niveau` (voir, par défaut, ou commenter), `nom`, `expire` (ms, `null` : sans limite), `motDePasse`.
  app.post('/api/tableaux/:id/liens', async (c) => {
    const g = await garde(c, 'proprietaire')
    if (g instanceof Response) return g
    const b = await corps(c)
    const niveau = niveauDemande(b?.niveau) ?? 'lecture'
    const nom = nomDemande(b?.nom) ?? ''
    const expire = echeanceDemandee(b)
    if (niveau === 'invalide' || nom === 'invalide' || expire === 'invalide') return c.json({ erreur: 'demande invalide', code: 'demande_invalide' }, 400)
    let motDePasse: string | null = null
    if (b?.motDePasse !== undefined && b.motDePasse !== null && b.motDePasse !== '') {
      const m = texte(b.motDePasse)
      if (m.length < MOT_DE_PASSE_MIN || m.length > MOT_DE_PASSE_MAX) return c.json({ erreur: 'mot de passe invalide', code: 'mot_de_passe_invalide' }, 400)
      motDePasse = await hacher(m)
    }
    if (base.liensVisiteurs(g.id).length >= LIENS_MAX) return c.json({ erreur: 'trop de liens : retirez-en un', code: 'trop_de_liens' }, 409)
    const l = {
      id: randomBytes(12).toString('hex'),
      tableau: g.id,
      jeton: randomBytes(16).toString('base64url'),
      nom,
      niveau,
      cree: ctx.maintenant(),
      par: g.u.id,
      expire: expire ?? null,
      motDePasse,
    }
    base.creerLienVisiteur(l)
    await droitsAJour()
    return c.json(lienVu({ ...l, derniereVisite: null }), 201)
  })

  app.patch('/api/tableaux/:id/liens/:lien', async (c) => {
    const g = await garde(c, 'proprietaire')
    if (g instanceof Response) return g
    const l = lienDuTableau(c, g.id)
    if (l instanceof Response) return l
    const b = await corps(c)
    const niveau = niveauDemande(b?.niveau)
    const nom = nomDemande(b?.nom)
    const expire = echeanceDemandee(b)
    if (niveau === 'invalide' || nom === 'invalide' || expire === 'invalide') return c.json({ erreur: 'demande invalide', code: 'demande_invalide' }, 400)
    base.modifierLienVisiteur(l.id, { ...(nom !== undefined ? { nom } : {}), ...(niveau !== undefined ? { niveau } : {}), ...(expire !== undefined ? { expire } : {}) })
    if (niveau !== undefined && niveau !== l.niveau) await droitsAJour()
    return c.json(lienVu(base.lienVisiteur(l.id)!))
  })

  app.put('/api/tableaux/:id/liens/:lien/mot-de-passe', async (c) => {
    const g = await garde(c, 'proprietaire')
    if (g instanceof Response) return g
    const l = lienDuTableau(c, g.id)
    if (l instanceof Response) return l
    const m = await motDePasseDemande(c)
    if (m instanceof Response) return m
    // Ceux qui avaient donné l'ancien doivent donner le nouveau.
    base.definirMotDePasseLien(l.id, await hacher(m))
    return c.json(lienVu(base.lienVisiteur(l.id)!))
  })

  app.delete('/api/tableaux/:id/liens/:lien/mot-de-passe', async (c) => {
    const g = await garde(c, 'proprietaire')
    if (g instanceof Response) return g
    const l = lienDuTableau(c, g.id)
    if (l instanceof Response) return l
    base.definirMotDePasseLien(l.id, null)
    return c.json(lienVu(base.lienVisiteur(l.id)!))
  })

  // Fermer un lien : son adresse n'ouvre plus rien, tout de suite, et pour toujours (un lien neuf a un autre jeton).
  app.delete('/api/tableaux/:id/liens/:lien', async (c) => {
    const g = await garde(c, 'proprietaire')
    if (g instanceof Response) return g
    const l = lienDuTableau(c, g.id)
    if (l instanceof Response) return l
    base.retirerLienVisiteur(l.id)
    await droitsAJour()
    return c.body(null, 204)
  })

  /**
   * Ce que voit un visiteur : le tableau sans la corbeille ni les non triés, sans la personne à qui un élément est
   * confié, et sans les lignes qui n'ont plus leurs deux bouts. Les fils de discussion (épingles, fils accrochés à un
   * élément, réactions) n'y sont que si le lien permet de commenter : ce sont les échanges de ceux qui y travaillent.
   */
  const vuePublique = (id: string, commentaires: boolean) => {
    const t = lireLe(id)
    const visibles = t.elements.filter((e) => e.corbeille === undefined && e.nonTrie === undefined && (commentaires || e.contenu.type !== 'commentaire'))
    const ids = new Set(visibles.map((e) => e.id))
    const bout = (b: unknown) => !(b && typeof b === 'object' && 'element' in b) || ids.has(String((b as { element: unknown }).element))
    const elements = visibles
      .filter((e) => e.contenu.type !== 'ligne' || (bout(e.contenu.depart) && bout(e.contenu.arrivee)))
      .map(({ commentaire, reactions, assigne: _a, ...e }) => (commentaires ? { ...e, ...(commentaire ? { commentaire } : {}), ...(reactions ? { reactions } : {}) } : e))
    // Une carte vers un tableau qui n'est pas sous celui-ci n'en dit rien : ni son titre, ni l'image ou l'icône
    // reprises de sa carte d'origine. Un éditeur ne lit pas ainsi, par un lien visiteur, un tableau qu'il ne peut pas ouvrir.
    const dessous = new Set(base.descendants(id))
    const titres: Record<string, string> = {}
    const cartes = elements.map((e) => {
      if (e.contenu.type !== 'tableau' || typeof e.contenu.cible !== 'string') return e
      if (!dessous.has(e.contenu.cible)) {
        const { titre: _t, icone: _i, image: _m, ...contenu } = e.contenu as Record<string, unknown>
        return { ...e, contenu: contenu as typeof e.contenu }
      }
      const titre = titreDe(e.contenu.cible)
      if (titre !== undefined) titres[e.contenu.cible] = titre
      return e
    })
    return { titre: t.titre, ...(t.couleur ? { couleur: t.couleur } : {}), elements: cartes, titres }
  }

  /**
   * Le lien de cette adresse, s'il ouvre encore son tableau ; sinon la réponse à rendre. Un blocage du tableau pour
   * tout le monde vaut aussi pour les liens (OpenFGA). Un lien échu le dit, pour qu'on sache en demander un autre.
   */
  const lienOuvert = async (c: Context): Promise<LienVisiteur | Response> => {
    const jeton = c.req.param('jeton') ?? ''
    const l = JETON_PUBLIC.test(jeton) ? base.lienDuJeton(jeton) : null
    const fermes = { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }
    if (!l || !base.tableau(l.tableau)) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404, fermes)
    if (l.expire !== null && l.expire <= ctx.maintenant()) return c.json({ erreur: 'lien expiré', code: 'lien_expire' }, 410, fermes)
    if (!(await ctx.autorisation.verifier(`lien:${jeton}`, 'peut_lire', `tableau:${l.tableau}`))) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404, fermes)
    return l
  }

  /** Le lien est protégé et ce visiteur n'a pas donné le mot de passe : la réponse à rendre, sinon `null`. */
  const motDePasseRequis = (c: Context, l: LienVisiteur): Response | null => {
    if (l.motDePasse === null) return null
    const acces = lireCookie(c.req.header('cookie'), NOM_COOKIE_PUBLIC)
    if (acces && base.accesLienValide(empreinteDe(acces), l.id, ctx.maintenant())) return null
    return c.json({ erreur: 'mot de passe requis', code: 'mot_de_passe_requis', protege: true }, 401, { 'cache-control': 'no-store' })
  }

  /**
   * La vue du visiteur, avec ce que sa page doit savoir : le niveau du lien, son échéance, et pour commenter, qui il
   * est (d'après sa clé) et les éléments qui ont leurs propres droits, qu'il ne commente pas. Une étiquette (`etag`)
   * lui évite de recharger ce qui n'a pas changé quand il relit le tableau toutes les vingt secondes.
   */
  const moiVisiteur = (lien: string, cle: string) => {
    const { id, couleur } = auteurVisiteur(lien, cle, '')
    return { id, couleur }
  }
  const reponsePublique = (c: Context, l: LienVisiteur): Response => {
    const commente = l.niveau === 'commentaire'
    const cle = c.req.header(ENTETE_VISITEUR)
    const donnees = {
      ...vuePublique(l.tableau, commente),
      niveau: l.niveau,
      expire: l.expire,
      ...(commente ? { figes: base.elementsAvecDroits(l.tableau), ...(cle && CLE_VISITEUR.test(cle) ? { moi: moiVisiteur(l.id, cle) } : {}) } : {}),
    }
    const json = JSON.stringify(donnees)
    const etiquette = `"${createHash('sha256').update(json).digest('base64url').slice(0, 27)}"`
    const maintenant = ctx.maintenant()
    if (l.derniereVisite === null || maintenant - l.derniereVisite > VISITE_NOTEE_MS) base.noterVisite(l.id, maintenant)
    const entetes = { etag: etiquette, 'cache-control': 'no-store', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' }
    if (c.req.header('if-none-match') === etiquette) return c.body(null, 304, entetes)
    return c.body(json, 200, { ...entetes, 'content-type': 'application/json; charset=utf-8' })
  }

  // Donner le mot de passe du lien : le serveur remet un accès, porté par un cookie limité à ce lien, qui ne dure pas
  // plus d'un jour ni plus longtemps que le lien.
  app.post('/api/public/:jeton/deverrouiller', async (c) => {
    const refus = limiter(c, 'deverrouillage-public')
    if (refus) return refus
    const l = await lienOuvert(c)
    if (l instanceof Response) return l
    if (l.motDePasse === null) return c.body(null, 204)
    if (!(await verifier(l.motDePasse, texte((await corps(c))?.motDePasse)))) return c.json({ erreur: 'mot de passe incorrect', code: 'mot_de_passe_incorrect' }, 401)
    const { jeton: acces, empreinte: trace } = nouveauJeton()
    const maintenant = ctx.maintenant()
    const fin = Math.min(maintenant + DUREE_ACCES_PUBLIC_MS, l.expire ?? Number.POSITIVE_INFINITY)
    base.creerAccesLien(trace, l.id, fin)
    c.header('set-cookie', cookieAccesPublic(NOM_COOKIE_PUBLIC, l.jeton, acces, Math.max(1, Math.floor((fin - maintenant) / 1000)), ctx.cookieSecurise))
    return c.body(null, 204)
  })

  app.get('/api/public/:jeton', async (c) => {
    const l = await lienOuvert(c)
    if (l instanceof Response) return l
    return motDePasseRequis(c, l) ?? reponsePublique(c, l)
  })

  // Seuls les fichiers que le tableau montre se lisent par son lien.
  app.get('/api/public/:jeton/fichiers/:fichier', async (c) => {
    const l = await lienOuvert(c)
    if (l instanceof Response) return l
    const ferme = motDePasseRequis(c, l)
    if (ferme) return ferme
    const fichier = c.req.param('fichier') ?? ''
    if (!ID_FICHIER.test(fichier) || !idsDeFichiers(vuePublique(l.tableau, false).elements).has(fichier)) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    const f = base.fichier(fichier)
    if (!f) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    return await servirFichier(f, 'private, max-age=300')
  })

  /**
   * Un visiteur commente, par un lien qui le permet : il envoie son nom (`nom`) et les éléments qu'il a changés, tels
   * qu'il les voit (`changements`, voir `visiteurs.ts`) ; sa clé voyage dans l'en-tête `x-notak-visiteur`. Ce qui
   * passe s'écrit dans le document, et la réponse est sa vue à jour.
   */
  app.post('/api/public/:jeton/commentaires', async (c) => {
    const refus = limiter(c, 'commentaire-visiteur', ctx.limiteurVisiteurs)
    if (refus) return refus
    const l = await lienOuvert(c)
    if (l instanceof Response) return l
    const ferme = motDePasseRequis(c, l)
    if (ferme) return ferme
    if (l.niveau !== 'commentaire' || !(await ctx.autorisation.verifier(`lien:${l.jeton}`, 'peut_commenter', `tableau:${l.tableau}`))) {
      return c.json({ erreur: 'ce lien ne permet pas de commenter', code: 'interdit' }, 403)
    }
    const cle = c.req.header(ENTETE_VISITEUR) ?? ''
    if (!CLE_VISITEUR.test(cle)) return c.json({ erreur: 'clé de visiteur invalide', code: 'cle_visiteur_invalide' }, 400)
    const octets = await lireBorne(c.req.raw.body, COMMENTAIRES_MAX)
    if (octets === 'trop gros') return c.json({ erreur: 'trop gros', code: 'trop_gros' }, 413)
    let b: Record<string, unknown> | null = null
    try {
      const v: unknown = octets ? JSON.parse(octets.toString('utf8')) : null
      if (v && typeof v === 'object' && !Array.isArray(v)) b = v as Record<string, unknown>
    } catch {
      b = null
    }
    if (!b) return c.json({ erreur: 'corps invalide', code: 'corps_invalide' }, 400)
    const nom = nomVisiteur(b.nom)
    if (!nom) return c.json({ erreur: 'nom requis', code: 'nom_requis' }, 400)
    const auteur = auteurVisiteur(l.id, cle, nom)
    // Il commente ce qu'il voit, sauf ce qui a ses propres droits : son propriétaire l'a voulu à part.
    const ouverts = new Set(vuePublique(l.tableau, true).elements.map((e) => e.id))
    for (const id of base.elementsAvecDroits(l.tableau)) ouverts.delete(id)
    let refuse: 'invalide' | 'interdit' | null = null
    await modifierDocument(l.tableau, undefined, (doc) => {
      const juge = jugerChangements(doc.getMap('elements'), b.changements, ouverts, auteur, ctx.maintenant())
      if (typeof juge === 'string') refuse = juge
      else ecrireChangements(doc, juge)
    })
    if (refuse === 'invalide') return c.json({ erreur: 'commentaire invalide', code: 'commentaire_invalide' }, 400)
    if (refuse === 'interdit') return c.json({ erreur: 'geste refusé', code: 'interdit' }, 403)
    return reponsePublique(c, l)
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
    await echus()
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

  // ---- Signalements de bugs ----
  // ⇧⌘S dans l'app : les mots, le contexte relevé et les captures (en base64), rangés en dossier (`signalements.ts`).
  // Sans dossier réglé (`NOTAK_SIGNALEMENTS`, ou le développement), la route répond comme une route qui n'existe pas.

  app.post('/api/signalements', async (c) => {
    const dossier = ctx.dossierSignalements
    if (!dossier) return c.json({ erreur: 'signalements fermés', code: 'signalements_fermes' }, 404)
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    const max = Math.ceil((CAPTURE_MAX * CAPTURES_MAX * 4) / 3) + CONTEXTE_MAX * 4 + TEXTE_MAX * 4 + 1024
    const octets = await lireBorne(c.req.raw.body, max)
    if (octets === 'trop gros') return c.json({ erreur: 'trop gros', code: 'trop_gros' }, 413)
    let b: Record<string, unknown> | null = null
    try {
      const v: unknown = octets ? JSON.parse(octets.toString('utf8')) : null
      if (v && typeof v === 'object' && !Array.isArray(v)) b = v as Record<string, unknown>
    } catch {
      b = null
    }
    if (!b) return c.json({ erreur: 'corps illisible', code: 'corps_illisible' }, 400)
    // `captures` : l'écran puis les images collées ; `capture`, une seule, pour une page d'avant.
    const brutes = (Array.isArray(b.captures) ? b.captures : [b.capture]).filter((x): x is string => typeof x === 'string' && x !== '').slice(0, CAPTURES_MAX)
    const captures = brutes.map((x) => Buffer.from(x.replace(/^data:image\/png;base64,/, ''), 'base64')).filter((x) => x.length > 0)
    if (captures.some((x) => x.length > CAPTURE_MAX)) return c.json({ erreur: 'trop gros', code: 'trop_gros' }, 413)
    const id = await deposerSignalement(dossier, {
      texte: texte(b.texte).slice(0, TEXTE_MAX),
      contexte: texte(b.contexte).slice(0, CONTEXTE_MAX),
      captures,
      auteur: { nom: u.nom, email: u.email },
      quand: new Date(ctx.maintenant()),
    })
    annoncerSignalement(base, ctx.rattachements ?? [], id, ctx.maintenant(), u.nom)
    return c.json({ id }, 201)
  })

  // Ceux qui attendaient déjà quand un outil s'est mis à recevoir les signalements lui sont annoncés au démarrage ;
  // l'identifiant de l'envoi, tiré du signalement, ne les met qu'une fois dans la file.
  if (ctx.dossierSignalements && (ctx.rattachements ?? []).some((s) => s.signalements)) {
    const dossier = ctx.dossierSignalements
    void listerSignalements(dossier, A_TRAITER)
      .then((file) => {
        for (const s of file) if (ID_SIGNALEMENT.test(s.id)) annoncerSignalement(base, ctx.rattachements ?? [], s.id, ctx.maintenant(), null)
      })
      .catch((e: unknown) => console.warn(`Notak : les signalements en attente n'ont pas été annoncés (${(e as Error).message})`))
  }

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
  /**
   * Change le document d'un tableau, qu'il soit ouvert ou non : par une connexion directe de la synchro, qui
   * l'enregistre et le diffuse à ceux qui y sont ; sans synchro (les essais), en relisant et réécrivant l'état.
   * `utilisateur` : qui le change, pour l'activité ; un visiteur n'y entre pas.
   */
  const modifierDocument = async (tableau: string, utilisateur: Utilisateur | undefined, f: (doc: Y.Doc) => void) => {
    const nom = nomDuDocument(tableau)
    const synchro = ctx.synchro()
    if (synchro) {
      const liaison = await synchro.openDirectConnection(nom, utilisateur ? { utilisateur: { id: utilisateur.id, nom: utilisateur.nom, couleur: utilisateur.couleur } } : {})
      try {
        await liaison.transact(f)
      } finally {
        await liaison.disconnect()
      }
      return
    }
    const doc = new Y.Doc()
    try {
      const etat = base.document(nom)
      if (etat) Y.applyUpdate(doc, etat)
      f(doc)
      base.enregistrerDocument(nom, Y.encodeStateAsUpdate(doc))
      suiviDesDossiers(indexerDocument(base, tableau, doc), utilisateur)
    } finally {
      doc.destroy()
    }
  }
  const poserDansLAccueil = (u: Utilisateur, elements: readonly ElementArrive[]) => modifierDocument(u.racine, u, (doc) => poserDansNonTries(doc, elements))

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

  // ---- Les dossiers des fiches d'un autre outil (rattachements.ts) ----

  type EtatFiche = { etat: 'present' | 'corbeille'; tableau: string; titre: string } | { etat: 'cache' } | { etat: 'absent' }
  /**
   * Où en est le dossier d'une fiche pour ce compte : là, et il le lit ; à la corbeille (on le remet, on n'en refait
   * pas un) ; là, mais il ne le voit pas (on n'en crée pas un second) ; ou absent.
   */
  const etatDuDossier = async (u: Utilisateur, r: Rattachement | null): Promise<EtatFiche> => {
    const ligne = r ? base.tableau(r.tableau) : null
    if (!r || !ligne) return { etat: 'absent' }
    if ((await roleSur(u.id, r.tableau)) === null) return { etat: 'cache' }
    const jete = r.corbeille !== null || (await rangementPour(u)).cachees.has(r.tableau)
    return { etat: jete ? 'corbeille' : 'present', tableau: r.tableau, titre: ligne.titre }
  }
  /**
   * La toile qui porte la carte d'un dossier : son parent en base, s'il la porte (même jetée) ; sinon celle de son
   * espace qui la porte ; à défaut, son parent, où l'on reposera une carte.
   */
  const porteurDe = (tableau: string): string | null => {
    const parent = base.tableau(tableau)?.parent ?? null
    const porte = (id: string) => {
      const l = base.contenus([id]).find((x) => x.genre === 'toile')
      const lu = l ? (JSON.parse(l.resume) as { cartes?: string[]; jetees?: string[] }) : null
      return Boolean(lu?.cartes?.includes(tableau) || lu?.jetees?.includes(tableau))
    }
    if (parent && porte(parent)) return parent
    const espace = base.tableau(tableau)?.espace
    return (espace ? base.tableauxDeLEspace(espace).find((id) => id !== tableau && porte(id)) : undefined) ?? parent
  }
  /** Remet un dossier : sa carte sort de la corbeille, ou une carte neuve est posée là où elle était (la corbeille vidée). */
  const remettreLeDossier = async (tableau: string, par: Utilisateur | undefined) => {
    const porteur = porteurDe(tableau)
    if (!porteur) return
    await modifierDocument(porteur, par, (doc) => {
      if (!marquerCarte(doc, tableau, null)) poserCarteDeToile(doc, tableau, ctx.maintenant())
    })
  }
  /** La source et la fiche demandées, et l'espace où la source range ses dossiers pour ce compte. */
  const ficheDemandee = async (c: Context) => {
    const u = await utilisateurCourant(c)
    if (!u) return c.json({ erreur: 'non connecté', code: 'non_connecte' }, 401)
    await anciensDossiersRanges()
    const source = sourceNommee(c.req.param('source') ?? '')
    if (!source) return c.json({ erreur: 'source inconnue', code: 'source_inconnue' }, 404)
    const cle = c.req.param('cle') ?? ''
    if (!CLE_FICHE.test(cle)) return c.json({ erreur: 'fiche invalide', code: 'fiche_invalide' }, 400)
    const espace = source.espace ?? base.espacePersonnel(u.id)
    const racine = espace ? base.espace(espace)?.racine : undefined
    if (!espace || !racine) return c.json({ erreur: 'espace introuvable', code: 'espace_introuvable' }, 404)
    return { u, source, cle, espace, racine }
  }
  // Une création à la fois : deux clics au même moment sur la même fiche ne font pas deux dossiers.
  let fileDesDossiers: Promise<unknown> = Promise.resolve()
  const aSonTour = <T>(f: () => Promise<T>): Promise<T> => {
    const tour = fileDesDossiers.then(f, f)
    fileDesDossiers = tour.catch(() => {})
    return tour
  }
  /** Une toile neuve, montrée en dossier, posée dans `parent` par sa carte ; elle en hérite les accès. */
  const creerDossierDans = async (u: Utilisateur, parent: string, titre: string): Promise<string> => {
    const id = nouvelId(ctx.maintenant())
    // Créé pendant un accès temporaire au parent, il tombe avec lui (comme `POST /api/tableaux`).
    const fin = echeanceHeritee(u.id, parent)
    base.transaction(() => {
      base.creerTableau({ id, titre, proprietaire: u.id, parent })
      base.definirAcces({ tableau: id, utilisateur: u.id, role: 'proprietaire' })
      if (fin !== null) base.definirEcheance(id, `user:${u.id}`, fin)
    })
    await droitsAJour()
    await modifierDocument(id, u, (doc) => ecrireDossierNeuf(doc, titre))
    await modifierDocument(parent, u, (doc) => poserCarteDeToile(doc, id, ctx.maintenant()))
    return id
  }

  /** Les toiles d'un espace que personne n'y voit plus : jetées, ou rangées dans une toile jetée. */
  const cacheesDeLEspace = (espace: string): ReadonlySet<string> => {
    const ids = base.tableauxDeLEspace(espace)
    const lus = new Map(
      base.contenus(ids).flatMap((l) => (l.genre === 'toile' ? [[l.tableau, JSON.parse(l.resume) as { cartes?: string[]; jetees?: string[] }] as const] : [])),
    )
    return rangerLesToiles(ids.map((id) => ({ id, parent: base.tableau(id)?.parent ?? null, cartes: lus.get(id)?.cartes ?? [], jetees: lus.get(id)?.jetees ?? [] }))).cachees
  }
  /**
   * Le dossier qui range ceux de la source dans cet espace, où ce compte crée le dossier d'une fiche : là, ou sorti de
   * la corbeille avec ce qu'il rangeait (un second « Clients » à côté du premier n'est jamais ce qu'on attend), ou créé
   * dans l'accueil de l'espace. `null` : ce compte n'y peut rien écrire, ou ne le voit pas (on n'en fait pas un second).
   */
  const dossierDeLaSourcePour = async (u: Utilisateur, source: SourceRattachement, espace: string, racine: string): Promise<string | null> => {
    if (!auMoins(await roleSur(u.id, racine), 'edition')) return null
    const range = await etatDuDossier(u, base.rattachement(espace, source.source, ''))
    if (range.etat === 'cache') return null
    if (range.etat === 'absent') {
      const parent = await creerDossierDans(u, racine, source.dossier)
      base.poserRattachement({ espace, source: source.source, cle: '', tableau: parent, adresse: null, cree: ctx.maintenant() })
      return parent
    }
    if (!auMoins(await roleSur(u.id, range.tableau), 'edition')) return null
    if (range.etat === 'corbeille') {
      const porteur = porteurDe(range.tableau)
      if (!porteur || !auMoins(await roleSur(u.id, porteur), 'edition')) return null
      base.marquerCorbeille({ espace, source: source.source, cle: '' }, null, null)
      await remettreLeDossier(range.tableau, u)
    }
    return range.tableau
  }
  /** Rien sur cette toile que des cartes de toiles elles-mêmes vides ; ce qu'elle a jeté ne compte pas. */
  const toileVide = (id: string, vues = new Set<string>()): boolean => {
    if (vues.has(id)) return true
    vues.add(id)
    const lignes = base.contenus([id])
    const toile = lignes.find((l) => l.genre === 'toile')
    if (!toile || lignes.some((l) => l.genre !== 'toile')) return false
    const lu = JSON.parse(toile.resume) as { boites?: unknown[][]; cartes?: string[] }
    return (lu.boites ?? []).every((b) => b[5] === 'tableau') && (lu.cartes ?? []).every((c) => toileVide(c, vues))
  }
  /**
   * Une source qui nomme son espace après coup (celui de l'équipe) laissait, dans l'espace personnel de qui les avait
   * créés, un « Clients » et les dossiers d'avant : deux « Clients » côte à côte dans la bibliothèque (vu le 05/11/2026).
   * Chacun de ces dossiers resté vide passe dans l'espace de l'équipe (recréé là, au même titre et par la même
   * personne, s'il n'y est pas déjà) ; puis l'ancien « Clients », qui ne retient plus rien, part à la corbeille de son
   * espace, d'où on le remet si l'on veut. Un dossier qui range quelque chose reste où il est, avec son « Clients » :
   * rien ne passe d'un espace à l'autre sans qu'on l'y range soi-même. Ce qui est déjà jeté y reste, et s'oublie.
   */
  const rangerLesAnciensDossiers = async () => {
    for (const source of ctx.rattachements ?? []) {
      const equipe = source.espace
      const racineEquipe = equipe ? base.espace(equipe)?.racine : undefined
      if (!equipe || !racineEquipe) continue
      const anciens = base.rattachementsDeLaSource(source.source).filter((r) => r.espace !== equipe)
      for (const espace of new Set(anciens.map((r) => r.espace))) {
        const cachees = cacheesDeLEspace(espace)
        const ici = anciens.filter((r) => r.espace === espace)
        /** Jette un ancien dossier, s'il se voit encore : sa carte, là où elle est, à la corbeille. */
        const jeter = async (tableau: string) => {
          const ligne = base.tableau(tableau)
          const porteur = ligne && !cachees.has(tableau) ? porteurDe(tableau) : null
          if (porteur) await modifierDocument(porteur, base.utilisateurParId(ligne!.proprietaire) ?? undefined, (doc) => void marquerCarte(doc, tableau, ctx.maintenant()))
        }
        let retenu = false
        for (const f of ici.filter((r) => r.cle !== '')) {
          const ligne = base.tableau(f.tableau)
          const jete = !ligne || f.corbeille !== null || cachees.has(f.tableau)
          if (!jete && !toileVide(f.tableau)) {
            retenu = true
            continue
          }
          if (!jete && !base.rattachement(equipe, source.source, f.cle)) {
            const u = base.utilisateurParId(ligne!.proprietaire)
            const parent = u ? await dossierDeLaSourcePour(u, source, equipe, racineEquipe) : null
            if (!u || !parent) {
              retenu = true
              continue
            }
            const tableau = await creerDossierDans(u, parent, ligne!.titre)
            const maintenant = ctx.maintenant()
            base.poserRattachement({ espace: equipe, source: source.source, cle: f.cle, tableau, adresse: f.adresse, cree: maintenant })
            mettreEnFile(base, ctx.rattachements ?? [], source.source, 'dossier.cree', f.cle, maintenant, u.nom)
          }
          // La table d'abord : l'enregistrement qui suit n'y voit plus rien à suivre, et l'outil n'en sait rien.
          base.oublierRattachement(f)
          if (!jete) await jeter(f.tableau)
        }
        const range = ici.find((r) => r.cle === '')
        if (retenu || !range) continue
        base.oublierRattachement(range)
        await jeter(range.tableau)
      }
    }
  }
  /** Une fois par réglage des sources (au démarrage, en pratique), avant qu'on lise ou crée un dossier. */
  let anciensRanges: { pour: string; fait: Promise<void> } | null = null
  const anciensDossiersRanges = (): Promise<void> => {
    const pour = JSON.stringify((ctx.rattachements ?? []).map((s) => [s.source, s.espace ?? null]))
    if (anciensRanges?.pour !== pour) {
      anciensRanges = {
        pour,
        fait: aSonTour(rangerLesAnciensDossiers).catch((e: unknown) => console.warn(`Notak : les anciens dossiers des outils n'ont pas été rangés (${(e as Error).message})`)),
      }
    }
    return anciensRanges.fait
  }

  /**
   * Les pages de l'outil, sur son origine déclarée, lisent le dossier d'une fiche avec la session de la personne (le
   * cookie suit d'un sous-domaine à l'autre d'un même site) : seulement lire, et seulement elles. Aucun joker.
   */
  const ouvertALOutil = (c: Context): Record<string, string> => {
    const source = sourceNommee(c.req.param('source') ?? '')
    const origine = c.req.header('origin')
    return source && origine === source.origine ? { 'access-control-allow-origin': origine, 'access-control-allow-credentials': 'true', vary: 'Origin' } : { vary: 'Origin' }
  }
  const lectureDeLOutil = (traiter: (c: Context) => Promise<Response>) => async (c: Context) => {
    const r = await traiter(c)
    for (const [k, v] of Object.entries(ouvertALOutil(c))) r.headers.set(k, v)
    return r
  }
  const avantLecture = (c: Context) => c.body(null, 204, { ...ouvertALOutil(c), 'access-control-allow-methods': 'GET', 'access-control-max-age': '600' })
  app.options('/api/rattachements/:source/:cle', avantLecture)
  app.options('/api/rattachements/:source/:cle/contenu', avantLecture)

  /** Le dossier d'une fiche : `etat` dit s'il est là, caché ou absent ; `dossier`, où il se rangerait. */
  app.get(
    '/api/rattachements/:source/:cle',
    lectureDeLOutil(async (c) => {
      const f = await ficheDemandee(c)
      if (f instanceof Response) return f
      const etat = await etatDuDossier(f.u, base.rattachement(f.espace, f.source.source, f.cle))
      return c.json({ ...etat, source: f.source.nom, dossier: f.source.dossier })
    }),
  )

  /**
   * Ce que range le dossier d'une fiche, pour que l'outil le montre sur la fiche : chaque toile, page, carte mentale,
   * photo, lien ou fichier que la personne lit, du plus récemment changé au plus ancien, avec son chemin dans Notak.
   */
  app.get(
    '/api/rattachements/:source/:cle/contenu',
    lectureDeLOutil(async (c) => {
      const f = await ficheDemandee(c)
      if (f instanceof Response) return f
      const etat = await etatDuDossier(f.u, base.rattachement(f.espace, f.source.source, f.cle))
      const nommes = { source: f.source.nom, dossier: f.source.dossier }
      if (etat.etat !== 'present') return c.json({ ...etat, ...nommes })
      const { lignes, dossierDe, cachees } = await rangementPour(f.u)
      const ranges = lignes.filter((l) => !cachees.has(l.tableau) && (l.genre === 'toile' ? dossierDe(l.tableau) === etat.tableau : l.tableau === etat.tableau))
      const changes = base.derniersChangements([...new Set(ranges.map((l) => l.tableau))])
      const derniers = new Map<string, number>()
      for (const ch of changes) {
        for (const cle of [`${ch.tableau}/`, `${ch.tableau}/${ch.element}`]) derniers.set(cle, Math.max(derniers.get(cle) ?? 0, ch.instant))
      }
      const elements = ranges
        .map((l) => {
          const toile = l.genre === 'toile'
          const dossier = toile && (JSON.parse(l.resume) as { dossier?: boolean }).dossier === true
          return {
            tableau: l.tableau,
            element: toile ? null : l.element,
            genre: l.genre,
            titre: toile ? (base.tableau(l.tableau)?.titre ?? l.titre) : l.titre,
            ...(dossier ? { dossier: true } : {}),
            modifie: derniers.get(`${l.tableau}/${toile ? '' : l.element}`) ?? null,
            // Un dossier n'a pas de toile à montrer : ce qu'il range s'ouvre depuis sa liste, dans la bibliothèque (seul,
            // pour une photo ou un fichier ; en grand, pour une page).
            chemin: toile
              ? dossier
                ? `/?dossier=${encodeURIComponent(l.tableau)}`
                : `/t/${encodeURIComponent(l.tableau)}`
              : `/?dossier=${encodeURIComponent(l.tableau)}&element=${encodeURIComponent(l.element)}`,
          }
        })
        .sort((a, b) => (b.modifie ?? 0) - (a.modifie ?? 0) || a.titre.localeCompare(b.titre, 'fr'))
      return c.json({ ...etat, ...nommes, chemin: `/?dossier=${encodeURIComponent(etat.tableau)}`, elements })
    }),
  )

  /**
   * Trouve le dossier d'une fiche, ou le crée : dans le dossier de la source (fait au besoin, dans l'accueil de
   * l'espace), au titre donné. `adresse` : où la fiche s'ouvre dans l'outil, sur son origine déclarée seulement.
   */
  app.post('/api/rattachements/:source/:cle', async (c) => {
    const f = await ficheDemandee(c)
    if (f instanceof Response) return f
    const { u, source, cle, espace, racine } = f
    // Du JSON seulement : une page d'un autre sous-domaine ne l'envoie pas sans le demander d'abord (CORS), et ce n'est
    // ouvert qu'à la lecture. Un formulaire ou un `text/plain` partiraient sans demander, avec le cookie.
    if (!/^application\/json\b/i.test(c.req.header('content-type') ?? '')) return c.json({ erreur: 'JSON attendu', code: 'corps_invalide' }, 415)
    const b = await corps(c)
    const titre = titreDuDossier(b?.titre, cle)
    const adresse = adresseDeLaFiche(b?.adresse, source)
    if (adresse === null) return c.json({ erreur: 'adresse hors de l’outil', code: 'adresse_refusee' }, 400)
    return aSonTour(async () => {
      const deja = await etatDuDossier(u, base.rattachement(espace, source.source, cle))
      if (deja.etat !== 'absent') return c.json({ ...deja, source: source.nom, dossier: source.dossier }, 200)
      // Le dossier de la source d'abord : là, remis s'il était jeté, créé s'il manque.
      const parent = await dossierDeLaSourcePour(u, source, espace, racine)
      if (!parent) return c.json({ erreur: 'interdit', code: 'interdit' }, 403)
      const maintenant = ctx.maintenant()
      const tableau = await creerDossierDans(u, parent, titre)
      base.poserRattachement({ espace, source: source.source, cle, tableau, adresse: adresse ?? null, cree: maintenant })
      mettreEnFile(base, ctx.rattachements ?? [], source.source, 'dossier.cree', cle, maintenant, u.nom)
      return c.json({ etat: 'present', tableau, titre, source: source.nom, dossier: source.dossier }, 201)
    })
  })

  /**
   * Remet à sa place le dossier d'une fiche, jeté à la corbeille (le bouton « Le remettre » de `/relier`) : il faut
   * pouvoir écrire là où il se range. L'outil en est prévenu, au nom de la personne.
   */
  app.post('/api/rattachements/:source/:cle/remettre', async (c) => {
    const f = await ficheDemandee(c)
    if (f instanceof Response) return f
    const { u, source, cle, espace } = f
    return aSonTour(async () => {
      const r = base.rattachement(espace, source.source, cle)
      const etat = await etatDuDossier(u, r)
      if (etat.etat !== 'corbeille' || !r) return c.json({ ...etat, source: source.nom, dossier: source.dossier }, 200)
      const porteur = porteurDe(r.tableau)
      if (!porteur || !auMoins(await roleSur(u.id, porteur), 'edition')) return c.json({ erreur: 'interdit', code: 'interdit' }, 403)
      // La table d'abord : l'enregistrement qui suit n'y voit plus rien à suivre, et l'outil n'est prévenu qu'une fois.
      base.marquerCorbeille(r, null, null)
      await remettreLeDossier(r.tableau, u)
      mettreEnFile(base, ctx.rattachements ?? [], source.source, 'dossier.remis', cle, ctx.maintenant(), u.nom)
      return c.json({ ...(await etatDuDossier(u, base.rattachement(espace, source.source, cle))), source: source.nom, dossier: source.dossier }, 200)
    })
  })

  // ---- Ce qu'un outil demande lui-même (le catalogue, docs/AUTO-HEBERGER.md) ----

  /** Les dossiers d'une fiche qui comptent pour l'outil : dans son espace s'il en nomme un, sinon dans chacun. */
  const rattachementsDeLaSource = (source: string, cle: string) =>
    base.rattachementsDeLaFiche(source, cle).filter((r) => dossierDeLaSource(ctx.rattachements ?? [], r))
  /** Les dossiers d'une fiche, tels que l'outil les voit : dans chaque espace, là ou à la corbeille. */
  const lirePourLOutil = (source: string, cle: string) => {
    const cacheesDe = new Map<string, ReadonlySet<string>>()
    const cachees = (espace: string) => {
      if (!cacheesDe.has(espace)) cacheesDe.set(espace, cacheesDeLEspace(espace))
      return cacheesDe.get(espace)!
    }
    const dossiers = rattachementsDeLaSource(source, cle).flatMap((r) => {
      const ligne = base.tableau(r.tableau)
      if (!ligne) return []
      const jete = r.corbeille !== null || cachees(r.espace).has(r.tableau)
      return [{ espace: r.espace, etat: jete ? ('corbeille' as const) : ('present' as const), tableau: r.tableau, titre: ligne.titre, jete_par: r.jete_par }]
    })
    const etat = dossiers.some((d) => d.etat === 'present') ? 'present' : dossiers.length ? 'corbeille' : 'absent'
    return { etat, dossiers }
  }

  /** Fait ce que l'outil demande ; jamais d'effacement. Le geste est dans la table avant le document : rien ne lui revient. */
  const agirPourLOutil = async (source: string, action: Exclude<ActionOutil, 'fusionner'>, cle: string) => {
    const maintenant = ctx.maintenant()
    for (const r of action === 'lire' ? [] : rattachementsDeLaSource(source, cle)) {
      if (!base.tableau(r.tableau)) continue
      if (action === 'jeter' && r.corbeille === null) {
        base.marquerCorbeille(r, maintenant, 'outil')
        const porteur = porteurDe(r.tableau)
        if (porteur) await modifierDocument(porteur, undefined, (doc) => void marquerCarte(doc, r.tableau, maintenant))
      } else if (action === 'remettre' && r.corbeille !== null && r.jete_par === 'outil') {
        // Ce qu'une personne a jeté reste jeté : l'outil ne remet que ce qu'il a lui-même mis à la corbeille.
        base.marquerCorbeille(r, null, null)
        await remettreLeDossier(r.tableau, undefined)
      }
    }
    return lirePourLOutil(source, cle)
  }

  /**
   * Une demande d'un outil, signée de son secret (`Notak-Signature`), sans session ni CORS : `lire`, `jeter`,
   * `remettre`. La même demande (`id`) renvoyée rend la même réponse, sept jours durant, sans rien refaire.
   */
  app.post('/api/outils/:source', async (c) => {
    const source = sourceNommee(c.req.param('source') ?? '')
    if (!source?.secret) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
    const brut = await lireBorne(c.req.raw.body, 8 * 1024)
    if (brut === 'trop gros') return c.json({ erreur: 'trop gros', code: 'trop_gros' }, 413)
    const texteBrut = brut?.toString('utf8') ?? ''
    if (!signatureValable(source.secret, texteBrut, c.req.header('notak-signature'), ctx.maintenant())) {
      return c.json({ erreur: 'signature refusée', code: 'signature_invalide' }, 401)
    }
    let b: Record<string, unknown> | null = null
    try {
      const v: unknown = JSON.parse(texteBrut)
      b = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
    } catch {
      b = null
    }
    const id = texte(b?.id)
    const action = texte(b?.action) as ActionOutil
    const cle = texte(b?.cle)
    // `ticket` : seulement pour classer un signalement, la référence du ticket qu'en a fait l'outil.
    const champs = action === 'classer_signalement' ? ['id', 'action', 'cle', 'ticket'] : ['id', 'action', 'cle']
    const ticket = b?.ticket === undefined ? null : texte(b.ticket)
    if (!b || !ID_DEMANDE.test(id) || !ACTIONS_OUTIL.includes(action) || !CLE_FICHE.test(cle) || Object.keys(b).some((k) => !champs.includes(k))) {
      return c.json({ erreur: 'demande invalide', code: 'corps_invalide' }, 400)
    }
    if (action === 'fusionner') return c.json({ erreur: 'action réservée', code: 'action_reservee' }, 400)
    const json = { 'content-type': 'application/json; charset=utf-8' }
    if (ACTIONS_SIGNALEMENT.includes(action)) {
      // Seulement l'outil qui reçoit les signalements, seulement l'un d'eux par son identifiant.
      const signalement = cle.startsWith('signalement:') ? cle.slice('signalement:'.length) : ''
      if (!source.signalements || !ctx.dossierSignalements) return c.json({ erreur: 'introuvable', code: 'introuvable' }, 404)
      if (!ID_SIGNALEMENT.test(signalement) || (ticket !== null && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(ticket))) {
        return c.json({ erreur: 'demande invalide', code: 'corps_invalide' }, 400)
      }
      // Relire ne change rien et rend les captures : la réponse ne se garde pas, elle se refait.
      if (action === 'lire_signalement') return c.json(await relireSignalement(ctx.dossierSignalements, signalement))
      const dossier = ctx.dossierSignalements
      return aSonTour(async () => {
        const deja = base.demandeOutil(source.source, id)
        if (deja !== null) return c.body(deja, 200, json)
        const reponse = JSON.stringify({ etat: await classerSignalement(dossier, signalement, ticket, source.nom) })
        const maintenant = ctx.maintenant()
        base.noterDemandeOutil(source.source, id, reponse, maintenant, maintenant - 7 * 24 * 3600_000)
        return c.body(reponse, 200, json)
      })
    }
    await anciensDossiersRanges()
    return aSonTour(async () => {
      const deja = base.demandeOutil(source.source, id)
      if (deja !== null) return c.body(deja, 200, json)
      const reponse = JSON.stringify(await agirPourLOutil(source.source, action as 'lire' | 'jeter' | 'remettre', cle))
      const maintenant = ctx.maintenant()
      base.noterDemandeOutil(source.source, id, reponse, maintenant, maintenant - 7 * 24 * 3600_000)
      return c.body(reponse, 200, json)
    })
  })

  app.all('/api/*', (c) => c.json({ erreur: 'introuvable', code: 'introuvable' }, 404))

  // En production, le même serveur sert l'application web construite ; toute autre adresse (`/t/…`) reçoit la page.
  if (ctx.dossierWeb) {
    // Les pages de l'application, la connexion comprise : la CSP commune (`packages/tableau/src/securite.ts`), et
    // aucune page d'un autre site ne peut les afficher dans un cadre pour faire cliquer à l'insu de la personne.
    // L'API, plus haut, a déjà répondu : ses fichiers gardent leur propre bac à sable.
    const securite = entetesSecurite('serveur', { https: ctx.cookieSecurise, ...(ctx.origine ? { origineServeur: ctx.origine } : {}) })
    app.use('*', async (c, next) => {
      await next()
      for (const [nom, valeur] of Object.entries(securite)) c.res.headers.set(nom, valeur)
    })
    // Un partage vers Notak est reçu par le service worker ; sans lui (pas encore installé), on ne perd que le partage, pas la page.
    app.post('/partage', async (c) => c.redirect('/', 303))
    // La page d'un lien visiteur et celle d'une invitation portent un secret : rien ne le répète à un autre site, et
    // aucun moteur ne les indexe.
    app.use('*', async (c, suite) => {
      await suite()
      if (/^\/(p\/|invitation)/.test(c.req.path)) {
        c.header('referrer-policy', 'no-referrer')
        c.header('x-robots-tag', 'noindex')
      }
    })
    app.use('*', serveStatic({ root: ctx.dossierWeb }))
    app.get('*', serveStatic({ root: ctx.dossierWeb, path: 'index.html' }))
  }
  return app
}
