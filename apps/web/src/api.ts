import { type Element, type Habillage, type ResultatRecherche, type ResumeContenu, lireHabillage, textesFr } from '@notak/tableau'
import { avecApercus } from './bibliotheque/modele'
import { langue, t } from './langue'

export interface Moi {
  id: string
  email: string
  nom: string
  couleur: string
  racine: string
  /** Le fichier de sa photo (voir `adressePhoto`), ou `null`. */
  photo: string | null
  /** Administre ce serveur (`NOTAK_ADMINS`) : il est prévenu d'une nouvelle version. */
  admin?: boolean
}

export type Role = 'proprietaire' | 'edition' | 'commentaire' | 'lecture'

/** Ce qu'on peut donner en partageant : tout sauf la propriété. */
export type RoleDonne = 'edition' | 'commentaire' | 'lecture'

export interface Acces {
  utilisateur?: string
  /** Une équipe d'un espace à qui le tableau est partagé (son nom est alors dans `nom`, et `email` est vide). */
  equipe?: string
  /** Vide pour qui n'est pas propriétaire : il ne voit que les noms des autres. */
  email: string
  nom?: string
  /** La couleur et la photo d'un compte (voir `adressePhoto`), pour sa pastille. */
  couleur?: string
  photo?: string | null
  /** Ce qu'on lui a donné, ici ou sur un tableau au-dessus. */
  role: Role
  /** Ce que son rôle dans l'espace lui vaut de plus, tant que le tableau n'est pas privé. */
  parEspace?: Role
  enAttente: boolean
  /** Donné sur un tableau parent : il se retire là-haut. */
  herite?: boolean
  /** Jusqu'à quand l'accès vaut (ms), ou `null` : sans limite. */
  expire?: number | null
  /** Une invitation : quand elle a été faite, et si son lien s'accepte encore. */
  invitation?: { cree: number; valable: boolean }
}

/** Une erreur dont le message se montre tel quel (il est déjà dans la langue de l'interface). `code` : celui que le serveur a rendu. */
export class ErreurApi extends Error {
  constructor(
    message: string,
    readonly statut: number,
    readonly code?: string,
  ) {
    super(message)
  }
}

async function appeler(chemin: string, corps?: unknown, methode = corps === undefined ? 'GET' : 'POST'): Promise<Response> {
  let r: Response
  try {
    r = await fetch(chemin, {
      method: methode,
      credentials: 'same-origin',
      ...(corps === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }),
    })
  } catch {
    throw new ErreurApi(t('erreur.injoignable'), 0)
  }
  guetterSessionFinie(r, chemin, methode)
  return r
}

// ---- La session qui prend fin sous la page ----

const surSessionFinie = new Set<() => void>()

/** Prévenu quand la session a pris fin (expirée, ou fermée ailleurs) : l'application revient à l'écran de connexion. */
export function ecouterSessionFinie(f: () => void): () => void {
  surSessionFinie.add(f)
  return () => void surSessionFinie.delete(f)
}

export function signalerSessionFinie(): void {
  for (const f of [...surSessionFinie]) f()
}

/**
 * Un appel qui demande un compte et répond « non connecté » : la session a pris fin. Pas ceux de la connexion elle-même
 * (`/api/auth/…`, où un 401 dit « mot de passe incorrect »), ni la lecture de `/api/moi`, qui sert justement à savoir
 * si l'on est connecté.
 */
function guetterSessionFinie(r: Response, chemin: string, methode: string): void {
  if (r.status !== 401 || chemin.startsWith('/api/auth/') || (chemin === '/api/moi' && methode === 'GET')) return
  void r
    .clone()
    .json()
    .then(
      (corps: { code?: unknown } | null) => corps?.code === 'non_connecte' && signalerSessionFinie(),
      () => {},
    )
}

let verification: Promise<boolean> | null = null

/**
 * La session tient-elle encore ? La synchronisation refuse un tableau aussi bien quand l'accès est retiré que quand la
 * session a fini : seul `/api/moi` le dit. Sans réponse (hors ligne), on garde ce qu'on croyait.
 */
export function sessionEncoreValide(): Promise<boolean> {
  return (verification ??= (async () => {
    try {
      const r = await appeler('/api/moi')
      if (r.status !== 401) return true
      signalerSessionFinie()
      return false
    } catch {
      return true
    } finally {
      verification = null
    }
  })())
}

/** Les mots plus justes d'un tableau absent et d'un geste réservé au propriétaire, par code puis par statut. */
const TABLEAU_ABSENT = { introuvable: 'erreur.tableauIntrouvable', 404: 'erreur.tableauIntrouvable' }
const PROPRIETAIRE = { interdit: 'erreur.reserveProprietaire', 403: 'erreur.reserveProprietaire' }

/**
 * Le refus d'une réponse. Le serveur rend `{ erreur, code }` : le `code` est stable, le texte `erreur` est celui du
 * serveur (en français, sans traduction). Le message montré se cherche dans cet ordre : ce que l'appel dit pour ce
 * code (`contexte`, des clés de texte, quand le geste appelle un mot plus juste que le sens général du code) ; la
 * traduction du code (`erreur.<code>`) ; ce que l'appel dit pour ce statut HTTP (un serveur sans code) ; le texte
 * du serveur ; enfin un message selon le statut.
 */
async function refus(r: Response, contexte: Record<string | number, string> = {}): Promise<ErreurApi> {
  const corps = (await r.json().catch(() => null)) as { code?: unknown; erreur?: unknown } | null
  const code = typeof corps?.code === 'string' ? corps.code : undefined
  const cleDuCode = code && `erreur.${code}` in textesFr ? `erreur.${code}` : undefined
  const cle = (code ? contexte[code] : undefined) ?? cleDuCode ?? contexte[r.status]
  const serveur = typeof corps?.erreur === 'string' && corps.erreur ? corps.erreur : undefined
  // Trop d'essais : le serveur dit combien attendre, et la personne le saura.
  const attente = r.status === 429 ? Number(r.headers.get('retry-after')) : NaN
  if (attente > 0) return new ErreurApi(t('erreur.trop_d_essais_dans', { duree: duree(attente) }), r.status, code)
  const message = cle ? t(cle) : (serveur ?? t(r.status >= 500 ? 'erreur.serveur' : 'erreur.refusee'))
  return new ErreurApi(message, r.status, code)
}

/** Une attente en mots courts : « 40 s », « 12 min ». */
export const duree = (secondes: number): string => (secondes < 60 ? `${Math.ceil(secondes)} s` : `${Math.ceil(secondes / 60)} min`)

/** Ce que le serveur dit de lui (`GET /api/instance`) : son nom, ses inscriptions, les thèmes qu'il fournit. */
export interface Instance {
  nom: string
  inscriptions: 'ouvertes' | 'fermees'
  habillages: Habillage[]
  impose?: string
  parDefaut?: string
  /** L'adresse où un autre appareil joint le serveur, quand il la déclare. */
  adresse?: string
  /** La version du serveur au chargement de la page : celle qu'un serveur mis à jour ne dira plus (`/api/sante`). */
  version?: string
}

const INSTANCE_ORIGINE: Instance = { nom: 'Notak', inscriptions: 'ouvertes', habillages: [] }

/**
 * L'instance du serveur. Un serveur qui ne la dit pas (d'avant `/api/instance`) ou injoignable est celui d'origine :
 * l'écran de connexion n'attend pas pour si peu. Chaque thème est relu par la liste blanche, comme à l'import.
 */
export async function lireInstance(): Promise<Instance> {
  try {
    const r = await appeler('/api/instance')
    if (!r.ok) return INSTANCE_ORIGINE
    const brut = (await r.json()) as Partial<Record<keyof Instance, unknown>>
    const habillages = (Array.isArray(brut.habillages) ? brut.habillages : []).flatMap((h) => {
      try {
        return [lireHabillage({ notak: 'habillage', version: 1, ...(h as object) })]
      } catch {
        return []
      }
    })
    return {
      nom: typeof brut.nom === 'string' && brut.nom ? brut.nom : INSTANCE_ORIGINE.nom,
      inscriptions: brut.inscriptions === 'fermees' ? 'fermees' : 'ouvertes',
      habillages,
      ...(typeof brut.impose === 'string' ? { impose: brut.impose } : {}),
      ...(typeof brut.parDefaut === 'string' ? { parDefaut: brut.parDefaut } : {}),
      ...(typeof brut.adresse === 'string' && /^https?:\/\//.test(brut.adresse) ? { adresse: brut.adresse } : {}),
      ...(typeof brut.version === 'string' && brut.version.length <= 64 ? { version: brut.version } : {}),
    }
  } catch {
    return INSTANCE_ORIGINE
  }
}

/** La session en cours, ou `null` sans session. */
export async function moi(): Promise<Moi | null> {
  const r = await appeler('/api/moi')
  if (r.status === 401) return null
  if (!r.ok) throw await refus(r, {})
  return (await r.json()) as Moi
}

// La connexion passe par Better Auth, monté par le serveur sur `/api/auth`. Ses refus portent leurs propres codes
// (en capitales) : on les ramène aux nôtres.
const REFUS_AUTH = {
  INVALID_EMAIL_OR_PASSWORD: 'erreur.identifiants_incorrects',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'erreur.adresse_prise',
  USER_ALREADY_EXISTS: 'erreur.adresse_prise',
  VALIDATION_ERROR: 'erreur.compte_invalide',
  INVALID_EMAIL: 'erreur.adresse_invalide',
  PASSWORD_TOO_SHORT: 'erreur.mot_de_passe_invalide',
  PASSWORD_TOO_LONG: 'erreur.mot_de_passe_invalide',
  NOM_INVALIDE: 'erreur.nom_invalide',
  INVALID_TOKEN: 'erreur.lien_perime',
  401: 'erreur.identifiants_incorrects',
}

export async function seConnecter(email: string, motDePasse: string): Promise<Moi> {
  const r = await appeler('/api/auth/sign-in/email', { email, password: motDePasse })
  if (!r.ok) throw await refus(r, REFUS_AUTH)
  return (await moi())!
}

export async function sInscrire(email: string, motDePasse: string, nom: string): Promise<Moi> {
  const r = await appeler('/api/auth/sign-up/email', { email, password: motDePasse, name: nom, langue: langue() })
  if (!r.ok) throw await refus(r, REFUS_AUTH)
  return (await moi())!
}

export type Fournisseur = 'google' | 'microsoft' | 'github'

/** Ce que l'écran de connexion peut proposer en plus du mot de passe. */
export async function moyensConnexion(): Promise<{ fournisseurs: Fournisseur[]; courriel: boolean }> {
  const r = await appeler('/api/connexion/moyens')
  if (!r.ok) return { fournisseurs: [], courriel: false }
  return (await r.json()) as { fournisseurs: Fournisseur[]; courriel: boolean }
}

/** Part se connecter chez le fournisseur ; on revient sur la page courante une fois connecté. */
export async function connexionFournisseur(fournisseur: Fournisseur): Promise<void> {
  const r = await appeler('/api/auth/sign-in/social', { provider: fournisseur, callbackURL: location.href, errorCallbackURL: location.href })
  if (!r.ok) throw await refus(r, REFUS_AUTH)
  const { url } = (await r.json()) as { url?: string }
  if (url) location.assign(url)
}

/** Où revient le lien de réinitialisation : sur l'application, qui y lit le jeton (voir `jetonReinitialisation`). */
const RETOUR_REINITIALISATION = '/?reinitialisation=1'

/** Demande un lien pour changer de mot de passe. La réponse est la même que l'adresse ait un compte ou non. */
export async function demanderReinitialisation(email: string): Promise<void> {
  const r = await appeler('/api/auth/request-password-reset', { email, redirectTo: location.origin + RETOUR_REINITIALISATION })
  if (!r.ok) throw await refus(r, REFUS_AUTH)
}

/** Le jeton d'un lien de réinitialisation ouvert à l'instant, ou `null`. */
export function jetonReinitialisation(): string | null {
  const p = new URLSearchParams(location.search)
  return p.get('reinitialisation') === '1' ? p.get('token') : null
}

export async function reinitialiser(jeton: string, motDePasse: string): Promise<void> {
  const r = await appeler('/api/auth/reset-password', { token: jeton, newPassword: motDePasse })
  if (!r.ok) throw await refus(r, REFUS_AUTH)
}

/** Part se connecter par le SSO de l'entreprise de cette adresse ; on revient sur la page courante une fois connecté. */
export async function connexionSso(email: string): Promise<void> {
  const r = await appeler('/api/auth/sign-in/sso', { email, callbackURL: location.href, errorCallbackURL: location.href })
  if (!r.ok) throw await refus(r, { ...REFUS_AUTH, 404: 'erreur.sso_inconnu', 400: 'erreur.sso_inconnu', 401: 'erreur.sso_inconnu' })
  const { url } = (await r.json()) as { url?: string }
  if (url) location.assign(url)
}

// ---- L'app de bureau demande à se connecter : la page où l'on confirme son code ----

/** D'où et quand l'app a demandé le code, et d'où l'on confirme (`GET /api/bureau/demande`). */
export interface DemandeBureau {
  ip: string
  quand: number
  ipActuelle: string
}

const CODES_APPAREIL: Record<string, string> = {
  invalid_request: 'erreur.appareil_inconnu',
  expired_token: 'erreur.appareil_expire',
  access_denied: 'erreur.appareil_autre_compte',
}

/**
 * Le refus d'une route des codes d'appareil de Better Auth : `{ error, error_description }` en anglais. Le code
 * (`invalid_request`, `expired_token`, `access_denied`…) reste dans `ErreurApi.code`, pour que la page dise le cas.
 */
async function refusAppareil(r: Response): Promise<ErreurApi> {
  const corps = (await r
    .clone()
    .json()
    .catch(() => null)) as { error?: unknown } | null
  const code = typeof corps?.error === 'string' ? corps.error : undefined
  if (r.status === 429 || !code) return refus(r, {})
  const cle = CODES_APPAREIL[code]
  return cle ? new ErreurApi(t(cle), r.status, code) : refus(r, {})
}

/**
 * Ouvre la page d'un code : le serveur le confie à ce compte, le premier qui l'ouvre. `client` est absent quand un
 * autre compte l'avait pris en main avant. `statut` : `pending`, `approved` ou `denied`.
 */
export async function ouvrirCodeBureau(code: string): Promise<{ statut: string; client: string | null }> {
  const r = await appeler(`/api/auth/device?user_code=${encodeURIComponent(code)}`)
  if (!r.ok) throw await refusAppareil(r)
  const lu = (await r.json().catch(() => null)) as { status?: unknown; client_id?: unknown } | null
  return { statut: typeof lu?.status === 'string' ? lu.status : '', client: typeof lu?.client_id === 'string' ? lu.client_id : null }
}

/** D'où l'app a demandé ce code ; `null` quand le serveur ne le sait plus (il a redémarré depuis). */
export async function lireDemandeBureau(code: string): Promise<DemandeBureau | null> {
  const r = await appeler(`/api/bureau/demande?user_code=${encodeURIComponent(code)}`)
  if (r.status === 404) return null
  if (!r.ok) throw await refus(r, {})
  const lu = (await r.json().catch(() => null)) as Partial<Record<keyof DemandeBureau, unknown>> | null
  if (typeof lu?.ip !== 'string' || typeof lu.ipActuelle !== 'string' || typeof lu.quand !== 'number' || !Number.isFinite(lu.quand)) return null
  return { ip: lu.ip.slice(0, 64), quand: lu.quand, ipActuelle: lu.ipActuelle.slice(0, 64) }
}

/** Autorise (ou refuse) l'app qui attend ce code. */
export async function repondreCodeBureau(code: string, autoriser: boolean): Promise<void> {
  const r = await appeler(`/api/auth/device/${autoriser ? 'approve' : 'deny'}`, { userCode: code })
  if (!r.ok) throw await refusAppareil(r)
}

// ---- Espaces : les organisations de Better Auth ----

/** Un rôle fixe d'espace (ses noms sont ceux de Better Auth), ou le nom d'un rôle composé par l'espace. */
export type RoleEspace = 'owner' | 'admin' | 'member' | 'guest' | (string & {})

export interface EspaceLu {
  id: string
  nom: string
  racine: string
  personnel: boolean
  role: RoleEspace
}

export interface MembreEspace {
  id: string
  role: RoleEspace
  user: { id: string; name: string; email: string }
}

export interface InvitationEspace {
  id: string
  email: string
  role: RoleEspace
  status: string
}

export interface EquipeEspace {
  id: string
  name: string
}

export interface RoleCompose {
  id: string
  role: string
  permission: Record<string, string[]>
}

export interface FournisseurSso {
  providerId: string
  issuer: string
  domain: string
  domainVerified?: boolean
  organizationId?: string | null
}

/** Un appel à Better Auth : GET avec ses paramètres dans l'adresse, POST avec un corps. */
async function auth<T>(chemin: string, corps?: Record<string, unknown>, params?: Record<string, string>): Promise<T> {
  const r = await appeler(`/api/auth${chemin}${params ? `?${new URLSearchParams(params)}` : ''}`, corps)
  if (!r.ok) throw await refus(r, REFUS_AUTH)
  return (await r.json()) as T
}

export async function listerEspaces(): Promise<EspaceLu[]> {
  const r = await appeler('/api/espaces')
  if (!r.ok) throw await refus(r, {})
  return (await r.json()) as EspaceLu[]
}

export const creerEspace = (nom: string) =>
  auth<{ id: string }>('/organization/create', { name: nom, slug: `${nom.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'espace'}-${Date.now().toString(36)}` })
export const renommerEspace = (espace: string, nom: string) => auth('/organization/update', { organizationId: espace, data: { name: nom } })
export const supprimerEspace = (espace: string) => auth('/organization/delete', { organizationId: espace })
export const quitterEspace = (espace: string) => auth('/organization/leave', { organizationId: espace })

export const listerMembres = async (espace: string) =>
  (await auth<{ members: MembreEspace[] }>('/organization/list-members', undefined, { organizationId: espace })).members
export const inviterDansEspace = (espace: string, email: string, role: RoleEspace) =>
  auth('/organization/invite-member', { organizationId: espace, email, role })
export const changerRoleMembre = (espace: string, membre: string, role: RoleEspace) =>
  auth('/organization/update-member-role', { organizationId: espace, memberId: membre, role })
export const retirerMembre = (espace: string, membre: string) => auth('/organization/remove-member', { organizationId: espace, memberIdOrEmail: membre })
export const listerInvitations = (espace: string) => auth<InvitationEspace[]>('/organization/list-invitations', undefined, { organizationId: espace })
export const annulerInvitation = (invitation: string) => auth('/organization/cancel-invitation', { invitationId: invitation })
/** Accepte une invitation reçue ; rend l'espace rejoint. */
export const accepterInvitation = async (invitation: string) =>
  (await auth<{ member: { organizationId: string } }>('/organization/accept-invitation', { invitationId: invitation })).member.organizationId

export const listerEquipes = (espace: string) => auth<EquipeEspace[]>('/organization/list-teams', undefined, { organizationId: espace })
export const creerEquipe = (espace: string, nom: string) => auth('/organization/create-team', { organizationId: espace, name: nom })
export const supprimerEquipe = (espace: string, equipe: string) => auth('/organization/remove-team', { organizationId: espace, teamId: equipe })
export const listerMembresEquipe = (equipe: string) => auth<{ userId: string }[]>('/organization/list-team-members', undefined, { teamId: equipe })
export const ajouterAEquipe = (equipe: string, utilisateur: string) => auth('/organization/add-team-member', { teamId: equipe, userId: utilisateur })
export const retirerDEquipe = (equipe: string, utilisateur: string) => auth('/organization/remove-team-member', { teamId: equipe, userId: utilisateur })

export const listerRoles = (espace: string) => auth<RoleCompose[]>('/organization/list-roles', undefined, { organizationId: espace })
export const creerRole = (espace: string, nom: string, permission: Record<string, string[]>) =>
  auth('/organization/create-role', { organizationId: espace, role: nom, permission })
export const supprimerRole = (espace: string, nom: string) => auth('/organization/delete-role', { organizationId: espace, roleName: nom })

export const listerFournisseursSso = async (espace: string) =>
  ((await auth<{ providers: FournisseurSso[] }>('/sso/providers')).providers ?? []).filter((f) => f.organizationId === espace)
/** Déclare un SSO OIDC pour l'espace ; rend le jeton à poser en enregistrement DNS pour prouver le domaine. */
export const declarerSsoOidc = (espace: string, f: { providerId: string; issuer: string; domain: string; clientId: string; clientSecret: string }) =>
  auth<{ domainVerificationToken?: string }>('/sso/register', {
    organizationId: espace,
    providerId: f.providerId,
    issuer: f.issuer,
    domain: f.domain,
    oidcConfig: { clientId: f.clientId, clientSecret: f.clientSecret },
  })
export const jetonDomaine = (fournisseur: string) => auth<{ domainVerificationToken: string }>('/sso/request-domain-verification', { providerId: fournisseur })
export const verifierDomaine = (fournisseur: string) => auth('/sso/verify-domain', { providerId: fournisseur })
export const supprimerSso = (fournisseur: string) => auth('/sso/delete-provider', { providerId: fournisseur })

/** Change la couleur et/ou la photo du compte (`photo: null` la retire) ; rend le compte à jour. */
export async function reglerCompte(reglages: { couleur?: string; photo?: string | null }): Promise<Moi> {
  const r = await appeler('/api/moi', reglages, 'PATCH')
  if (!r.ok) throw await refus(r, { 400: 'erreur.photo_format_refuse', 415: 'erreur.photo_format_refuse' })
  return (await r.json()) as Moi
}

export async function seDeconnecter(): Promise<void> {
  await appeler('/api/auth/sign-out', {})
}

export interface TableauAccessible {
  id: string
  titre: string
  role: Role
}

/** Les tableaux qu'on peut ouvrir, hors son propre accueil. */
export async function listerTableaux(): Promise<TableauAccessible[]> {
  const r = await appeler('/api/tableaux')
  if (!r.ok) throw await refus(r, {})
  return (await r.json()) as TableauAccessible[]
}

export async function listerAcces(tableau: string): Promise<Acces[]> {
  const r = await appeler(`/api/tableaux/${encodeURIComponent(tableau)}/acces`)
  if (!r.ok) throw await refus(r, { ...TABLEAU_ABSENT })
  return (await r.json()) as Acces[]
}

/** À qui on partage : une adresse, ou une équipe. */
export type Cible = { email: string } | { equipe: string }

/** Ce que répond un partage : l'accès donné, ou une invitation, avec le jeton de son lien et s'il est parti par courriel. */
export interface Partage {
  enAttente: boolean
  expire: number | null
  jeton?: string
  envoye?: boolean
  /** L'adresse n'a pas de compte, et l'instance n'accepte pas d'inscriptions. */
  inscriptionsFermees?: boolean
}

/** `expire` : jusqu'à quand (ms) ; `null` : sans limite. */
export async function partager(tableau: string, cible: Cible, role: RoleDonne, expire: number | null = null): Promise<Partage> {
  const r = await appeler(`/api/tableaux/${encodeURIComponent(tableau)}/partage`, { ...cible, role, expire })
  if (!r.ok) throw await refus(r, { demande_invalide: 'erreur.adresse_invalide', 400: 'erreur.adresse_invalide', ...PROPRIETAIRE, ...TABLEAU_ABSENT })
  return (await r.json()) as Partage
}

/** Change le rôle ou l'échéance d'un accès déjà donné, ou d'une invitation, sans la renvoyer. */
export async function modifierAcces(tableau: string, cible: Cible, changement: { role?: RoleDonne; expire?: number | null }): Promise<void> {
  const r = await appeler(`/api/tableaux/${encodeURIComponent(tableau)}/partage`, { ...cible, ...changement }, 'PATCH')
  if (!r.ok) throw await refus(r, { ...PROPRIETAIRE, ...TABLEAU_ABSENT })
}

/** Un nouveau lien pour une invitation en attente : l'ancien ne vaut plus ; il repart par courriel si l'on peut. */
export async function nouveauLienInvitation(tableau: string, email: string): Promise<{ jeton: string; envoye: boolean }> {
  const r = await appeler(`/api/tableaux/${encodeURIComponent(tableau)}/invitations/lien`, { email })
  if (!r.ok) throw await refus(r, { ...PROPRIETAIRE, ...TABLEAU_ABSENT })
  return (await r.json()) as { jeton: string; envoye: boolean }
}

/** L'adresse d'une invitation : le jeton après `#`, qui ne part jamais vers le serveur avec la page. */
export const adresseInvitation = (jeton: string) => `${location.origin}/invitation#${jeton}`

/** Ce que propose une invitation, lue par son lien, avant de l'accepter. */
export interface InvitationRecue {
  titre: string
  par: string | null
  role: Role
  email: string
  expire: number | null
}

export async function lireInvitation(jeton: string): Promise<InvitationRecue> {
  const r = await appeler(`/api/invitations/${encodeURIComponent(jeton)}`)
  if (!r.ok) throw await refus(r, { 404: 'erreur.invitation_introuvable', 410: 'erreur.invitation_expiree', 429: 'erreur.trop_d_essais' })
  return (await r.json()) as InvitationRecue
}

/** Accepte l'invitation pour le compte connecté ; rend le tableau qu'elle ouvre. */
export async function accepterInvitationTableau(jeton: string): Promise<string> {
  const r = await appeler(`/api/invitations/${encodeURIComponent(jeton)}/accepter`, {})
  if (!r.ok) throw await refus(r, { 404: 'erreur.invitation_introuvable', 410: 'erreur.invitation_expiree', 429: 'erreur.trop_d_essais' })
  return ((await r.json()) as { tableau: string }).tableau
}

export async function retirerAcces(tableau: string, cible: Cible): Promise<void> {
  const r = await appeler(`/api/tableaux/${encodeURIComponent(tableau)}/partage`, cible, 'DELETE')
  if (!r.ok) throw await refus(r, { 409: 'erreur.dernier_proprietaire', ...PROPRIETAIRE, ...TABLEAU_ABSENT })
}

/**
 * L'accès général d'un tableau, celui de Notion : `prive`, « Seulement les personnes invitées » (le rôle dans l'espace
 * n'y donne plus rien) ; sinon tout son espace l'ouvre, selon le rôle de chacun. `herite` : c'est un tableau au-dessus
 * qui l'a rendu privé. `espace` : son espace (un nom vide pour l'espace personnel). `accueil` : l'accueil d'un espace,
 * qui est à tous ses membres. `modifiable` : ce compte peut le changer ici.
 */
export interface AccesGeneral {
  prive: boolean
  herite: boolean
  espace: { nom: string; personnel: boolean } | null
  accueil: boolean
  modifiable: boolean
}

export async function lireAccesGeneral(tableau: string): Promise<AccesGeneral> {
  const r = await appeler(`/api/tableaux/${encodeURIComponent(tableau)}/prive`)
  if (!r.ok) throw await refus(r, { ...TABLEAU_ABSENT })
  return (await r.json()) as AccesGeneral
}

/** Rend le tableau privé, ou le rouvre à tout son espace ; rend l'accès général tel qu'il est devenu. */
export async function reglerAccesGeneral(tableau: string, prive: boolean): Promise<AccesGeneral> {
  const r = await appeler(`/api/tableaux/${encodeURIComponent(tableau)}/prive`, { prive }, 'PUT')
  if (!r.ok) throw await refus(r, { ...PROPRIETAIRE, ...TABLEAU_ABSENT })
  return (await r.json()) as AccesGeneral
}

/** Quelqu'un de l'entreprise à qui proposer un tableau : un membre d'un espace d'équipe du compte. */
export interface PersonneProposee {
  id: string
  nom: string
  email: string
  couleur: string
  /** Le fichier de sa photo (voir `adressePhoto`), ou `null`. */
  photo: string | null
  /** Le nom de l'espace d'équipe où on l'a trouvée. */
  espace: string
  /** Invitée de cet espace : elle n'en voit que ce qu'on lui partage. */
  invite: boolean
  /** L'accès qu'elle a déjà sur ce tableau, ou `null`. */
  acces: Role | null
}

/** Les personnes dont le nom ou l'adresse contient `q` (sans accents ni majuscules) ; toutes, par leur nom, si `q` est vide. */
export async function proposerPersonnes(tableau: string, q: string): Promise<PersonneProposee[]> {
  const r = await appeler(`/api/tableaux/${encodeURIComponent(tableau)}/personnes?q=${encodeURIComponent(q)}`)
  if (!r.ok) throw await refus(r, { ...PROPRIETAIRE, ...TABLEAU_ABSENT })
  return (await r.json()) as PersonneProposee[]
}

/** Ce que permet un lien visiteur : voir, ou voir et commenter. Sans compte, on ne modifie jamais rien. */
export type NiveauVisiteur = 'lecture' | 'commentaire'

/** Un lien visiteur, tel que son propriétaire le gère. */
export interface LienVisiteur {
  id: string
  jeton: string
  /** Pour qui : « Client Dupont ». Peut être vide. */
  nom: string
  niveau: NiveauVisiteur
  cree: number
  /** Jusqu'à quand il ouvre le tableau (ms), ou `null` : sans limite. */
  expire: number | null
  /** Son échéance est passée : il n'ouvre plus rien, jusqu'à ce qu'on le prolonge. */
  echu: boolean
  protege: boolean
  /** La dernière fois qu'on l'a ouvert, ou `null`. */
  derniereVisite: number | null
}

const liensDe = (tableau: string) => `/api/tableaux/${encodeURIComponent(tableau)}/liens`

export async function listerLiens(tableau: string): Promise<LienVisiteur[]> {
  const r = await appeler(liensDe(tableau))
  if (!r.ok) throw await refus(r, { ...PROPRIETAIRE, ...TABLEAU_ABSENT })
  return (await r.json()) as LienVisiteur[]
}

export async function creerLien(tableau: string, l: { nom: string; niveau: NiveauVisiteur; expire: number | null; motDePasse?: string }): Promise<LienVisiteur> {
  const r = await appeler(liensDe(tableau), l)
  if (!r.ok) throw await refus(r, { mot_de_passe_invalide: 'partage.mdp6', ...PROPRIETAIRE, ...TABLEAU_ABSENT })
  return (await r.json()) as LienVisiteur
}

export async function modifierLien(tableau: string, id: string, m: { nom?: string; niveau?: NiveauVisiteur; expire?: number | null }): Promise<LienVisiteur> {
  const r = await appeler(`${liensDe(tableau)}/${id}`, m, 'PATCH')
  if (!r.ok) throw await refus(r, { ...PROPRIETAIRE, ...TABLEAU_ABSENT })
  return (await r.json()) as LienVisiteur
}

/** Pose ou change le mot de passe du lien (`null` : le retire). */
export async function motDePasseDuLien(tableau: string, id: string, motDePasse: string | null): Promise<LienVisiteur> {
  const r = await appeler(`${liensDe(tableau)}/${id}/mot-de-passe`, motDePasse === null ? undefined : { motDePasse }, motDePasse === null ? 'DELETE' : 'PUT')
  if (!r.ok) throw await refus(r, { mot_de_passe_invalide: 'partage.mdp6', 400: 'partage.mdp6', ...PROPRIETAIRE, ...TABLEAU_ABSENT })
  return (await r.json()) as LienVisiteur
}

export async function fermerLien(tableau: string, id: string): Promise<void> {
  const r = await appeler(`${liensDe(tableau)}/${id}`, undefined, 'DELETE')
  if (!r.ok && r.status !== 404) throw await refus(r, { ...PROPRIETAIRE })
}

/** Un blocage posé sur un tableau : pour tous, une personne ou une équipe ; `debloque` lève plus bas celui d'au-dessus. */
export type Blocage = ({ tous: true } | { email: string; nom: string } | { equipe: string; nom: string }) & { etat: 'bloque' | 'debloque' }

export async function listerBlocages(tableau: string): Promise<Blocage[]> {
  const r = await appeler(`/api/tableaux/${encodeURIComponent(tableau)}/blocage`)
  if (!r.ok) throw await refus(r, { ...PROPRIETAIRE, ...TABLEAU_ABSENT })
  return (await r.json()) as Blocage[]
}

export async function bloquer(tableau: string, sujet: { tous: true } | Cible, etat: 'bloque' | 'debloque' | null): Promise<void> {
  const r = await appeler(`/api/tableaux/${encodeURIComponent(tableau)}/blocage`, { ...sujet, etat })
  if (!r.ok) throw await refus(r, { ...PROPRIETAIRE, ...TABLEAU_ABSENT })
}

/** Un droit propre à un élément : écrire, commenter, ou bloqué (pour tous, une personne ou une équipe). */
export type DroitElement = 'edition' | 'commentaire' | 'bloque'
export type DroitPose = ({ tous: true } | { email: string; nom: string } | { equipe: string; nom: string }) & { droit: DroitElement }

const droitsElementDe = (tableau: string, element: string) => `/api/tableaux/${encodeURIComponent(tableau)}/elements/${encodeURIComponent(element)}/droits`

export async function listerDroitsElement(tableau: string, element: string): Promise<DroitPose[]> {
  const r = await appeler(droitsElementDe(tableau, element))
  if (!r.ok) throw await refus(r, { ...PROPRIETAIRE, ...TABLEAU_ABSENT })
  return (await r.json()) as DroitPose[]
}

export async function reglerDroitElement(tableau: string, element: string, sujet: { tous: true } | Cible, droit: DroitElement | null): Promise<void> {
  const r = await appeler(droitsElementDe(tableau, element), { ...sujet, droit })
  if (!r.ok) throw await refus(r, { ...PROPRIETAIRE, ...TABLEAU_ABSENT, adresse_inconnue: 'erreur.adresse_inconnue' })
}

/** L'adresse que l'on donne à un visiteur : la page du tableau, sans compte. */
export const adressePublique = (jeton: string) => `${location.origin}/p/${jeton}`

export interface TableauPublic {
  titre: string
  couleur?: string
  elements: Element[]
  /** Le titre des tableaux imbriqués, pour leurs cartes. */
  titres: Record<string, string>
  niveau: NiveauVisiteur
  /** Jusqu'à quand le lien ouvre le tableau, ou `null`. */
  expire: number | null
  /** Pour commenter : les éléments qui ont leurs propres droits, qu'un visiteur ne commente pas. */
  figes?: string[]
  /** Pour commenter : qui est ce visiteur, d'après la clé de son navigateur, et la couleur de ses messages. */
  moi?: { id: string; couleur: string }
}

/** Pourquoi un lien n'ouvre rien : il n'existe pas (ou plus), son échéance est passée, ou il demande un mot de passe. */
export type RefusPublic = 'absent' | 'expire' | 'protege'

const CLE_VISITEUR = 'notak:visiteur'

/** La clé de ce navigateur pour commenter en visiteur : tirée une fois, gardée ici ; elle seule lui rend ses messages. */
export function cleVisiteur(): string {
  try {
    const gardee = localStorage.getItem(CLE_VISITEUR)
    if (gardee && /^[A-Za-z0-9_-]{32,128}$/.test(gardee)) return gardee
  } catch {
    // stockage fermé (navigation privée) : une clé pour cette page seulement
  }
  const octets = crypto.getRandomValues(new Uint8Array(32))
  const cle = btoa(String.fromCharCode(...octets)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  try {
    localStorage.setItem(CLE_VISITEUR, cle)
  } catch {
    // tant pis : la clé vaut jusqu'à la fermeture de la page
  }
  return cle
}

/**
 * Un tableau lu par un lien visiteur. `etiquette` : celle de la dernière lecture ; rien n'a changé depuis, la réponse
 * est `'inchange'`. Un refus dit pourquoi le lien n'ouvre rien.
 */
export async function lirePublic(jeton: string, etiquette?: string): Promise<{ tableau: TableauPublic; etiquette: string | null } | 'inchange' | RefusPublic> {
  let r: Response
  try {
    r = await fetch(`/api/public/${encodeURIComponent(jeton)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'x-notak-visiteur': cleVisiteur(), ...(etiquette ? { 'if-none-match': etiquette } : {}) },
    })
  } catch {
    throw new ErreurApi(t('erreur.injoignable'), 0)
  }
  if (r.status === 304) return 'inchange'
  if (r.status === 404) return 'absent'
  if (r.status === 410) return 'expire'
  if (r.status === 401) return 'protege'
  if (!r.ok) throw await refus(r, {})
  return { tableau: (await r.json()) as TableauPublic, etiquette: r.headers.get('etag') }
}

/** Ce qu'un visiteur envoie de son geste : les éléments changés, tels qu'il les voit (`null` : retiré). */
export interface ChangementVisiteur {
  id: string
  apres: Element | null
}

/** Envoie les commentaires d'un visiteur ; rend sa vue du tableau à jour. */
export async function commenterEnVisiteur(jeton: string, nom: string, changements: ChangementVisiteur[]): Promise<TableauPublic> {
  let r: Response
  try {
    r = await fetch(`/api/public/${encodeURIComponent(jeton)}/commentaires`, {
      method: 'POST',
      // Il part encore si la page se ferme pendant l'envoi : c'est souvent le dernier message qu'on vient d'écrire.
      keepalive: true,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-notak-visiteur': cleVisiteur() },
      body: JSON.stringify({ nom, changements }),
    })
  } catch {
    throw new ErreurApi(t('erreur.injoignable'), 0)
  }
  if (!r.ok) throw await refus(r, { 410: 'erreur.lien_expire', 404: 'erreur.lienDisparu', 401: 'erreur.lienProtege', 403: 'erreur.commentaire_refuse', 429: 'erreur.trop_d_essais' })
  return (await r.json()) as TableauPublic
}

/** Les tableaux favoris du compte, le dernier ajouté d'abord. */
export async function listerFavoris(): Promise<TableauAccessible[]> {
  const r = await appeler('/api/favoris')
  if (!r.ok) throw await refus(r, {})
  return (await r.json()) as TableauAccessible[]
}

/** Met une toile en favori, ou l'en retire ; avec `element`, ce qu'elle porte (une page, une photo, un lien…). */
export async function definirFavori(tableau: string, favori: boolean, element: string | null = null): Promise<void> {
  const chemin = element === null ? '' : `/elements/${encodeURIComponent(element)}`
  const r = await appeler(`/api/tableaux/${encodeURIComponent(tableau)}${chemin}/favori`, undefined, favori ? 'PUT' : 'DELETE')
  if (!r.ok) throw await refus(r, { ...TABLEAU_ABSENT, 400: 'erreur.accueil_pas_favori' })
}

/**
 * Range une toile dans une autre ; ses accès hérités suivent, et la réponse dit ce que cela change pour les autres.
 * `essai` ne fait que compter ; `siPersonne` ne range que si cela ne change rien pour personne.
 */
/** Ce que change, pour les autres, le rangement d'une toile : le serveur compare ce que chacun en reçoit avant et après. */
export interface BilanRangement {
  /** Personnes et équipes qui la verraient sans la voir aujourd'hui. */
  nouveaux: number
  /** Celles qui la voient et ne la verraient plus. */
  perdus: number
  /** Celles dont l'accès, limité dans le temps, deviendrait permanent. */
  permanents: number
  /** Liens de visiteurs qui y mèneraient. */
  liensOuverts: number
  /** Liens de visiteurs qui n'y mèneraient plus. */
  liensEteints: number
}

export async function rangerToile(tableau: string, parent: string, options: { essai?: boolean; siPersonne?: boolean } = {}): Promise<BilanRangement & { fait: boolean }> {
  const r = await appeler(`/api/tableaux/${encodeURIComponent(tableau)}/parent`, { parent, ...options }, 'PUT')
  if (!r.ok) throw await refus(r, { ...TABLEAU_ABSENT, ...PROPRIETAIRE })
  return (await r.json()) as BilanRangement & { fait: boolean }
}

/** Les derniers tableaux ouverts par le compte. */
export async function listerRecents(): Promise<TableauAccessible[]> {
  const r = await appeler('/api/recents')
  if (!r.ok) throw await refus(r, {})
  return (await r.json()) as TableauAccessible[]
}

/** Note l'ouverture d'un tableau, pour la liste des récents. */
export async function noterVu(tableau: string): Promise<void> {
  await appeler(`/api/tableaux/${encodeURIComponent(tableau)}/vu`, {}).catch(() => {})
}

/** Note l'ouverture d'une carte mentale, d'une page, d'une photo, d'un lien ou d'un fichier, pour les récents de la bibliothèque. */
export async function noterElementVu(tableau: string, element: string): Promise<void> {
  await appeler(`/api/tableaux/${encodeURIComponent(tableau)}/elements/${encodeURIComponent(element)}/vu`, {}).catch(() => {})
}

/** Ce que la bibliothèque montre : les toiles, et ce qu'elles portent qui se retrouve (photos, liens et fichiers compris). */
export type GenreMontre = 'toile' | 'arbre' | 'document' | 'image' | 'lien' | 'fichier'
/** Ce qu'un serveur ne rend que si on le lui demande (`?genres=`) : un client plus ancien ne saurait pas le montrer. */
export const GENRES_EN_PLUS = ['image', 'lien', 'fichier'] as const
/**
 * Ce que la bibliothèque demande au serveur, en plus des toiles qui viennent toujours. `?genres=` dit tout ce qu'on
 * veut, pas seulement ce qu'on veut de plus : sans `arbre` et `document`, les pages et les cartes mentales n'y seraient pas.
 */
export const GENRES_DEMANDES: readonly GenreMontre[] = ['arbre', 'document', ...GENRES_EN_PLUS]

/** Ce que la vignette d'un dossier montre de ce qu'il range (`avecApercus`) : une entrée, et la toile qui la porte. */
export interface ApercuDossier {
  tableau: string
  resume: ResumeContenu
}

/** Une toile, une page, une carte mentale, une photo, un lien ou un fichier de la bibliothèque. */
export interface EntreeBibliotheque {
  tableau: string
  /** `null` : la toile elle-même. */
  element: string | null
  genre: GenreMontre
  titre: string
  /** Ce que dessine sa vignette ; celui d'un dossier porte l'aperçu de ce qu'il range. */
  resume: Extract<ResumeContenu, { genre: GenreMontre }> & { apercu?: ApercuDossier[] }
  /** Le titre de la toile qui le porte, s'il la lit. */
  ou: string | null
  /** L'identifiant de cette toile, s'il la lit : le dossier du tri par dossier. */
  dans: string | null
  /** La dernière fois que le compte l'a ouvert, ajouté ou changé, ou `null` : ce qui range les récents. */
  vu: number | null
  favori: boolean
  /** Une toile que d'autres lui partagent. */
  partage: boolean
  /** Une toile privée, par elle ou par une toile au-dessus : seules les personnes invitées l'ouvrent. */
  prive?: boolean
  /** Le dossier d'une fiche d'un autre outil (un CRM…) : l'outil, et où la fiche s'ouvre. */
  fiche?: { nom: string; adresse?: string }
  /** Le nom de l'outil qui a posé ce dossier, celui d'une fiche ou, sans `fiche`, celui qui les range : il ne se déplace pas. */
  outil?: string
}

/** Tout ce que le compte peut lire : ses toiles (sauf l'accueil), et ce qu'elles portent de pages, cartes mentales, photos, liens et fichiers. */
export async function lireBibliotheque(): Promise<EntreeBibliotheque[]> {
  const r = await appeler(`/api/bibliotheque?genres=${GENRES_DEMANDES.join(',')}`)
  if (!r.ok) throw await refus(r, {})
  return avecApercus((await r.json()) as EntreeBibliotheque[])
}

/**
 * Le dossier d'une fiche d'un autre outil (`/relier`) : là, et le compte le lit ; à la corbeille ; là, mais il ne le
 * voit pas ; ou absent. `source` est le nom de l'outil, `dossier` celui du dossier qui range ses fiches.
 */
export type DossierDeFiche = ({ etat: 'present' | 'corbeille'; tableau: string; titre: string } | { etat: 'absent' | 'cache' }) & { source: string; dossier: string }

/** Les refus du serveur sur une fiche, dans les mots de la page. */
const REFUS_FICHE = {
  source_inconnue: 'relier.erreur.source',
  fiche_invalide: 'relier.erreur.fiche',
  adresse_refusee: 'relier.erreur.adresse',
  interdit: 'relier.erreur.interdit',
  espace_introuvable: 'relier.erreur.espace',
}
const cheminDeFiche = (source: string, cle: string) => `/api/rattachements/${encodeURIComponent(source)}/${encodeURIComponent(cle)}`

export async function lireDossierDeFiche(source: string, cle: string): Promise<DossierDeFiche> {
  const r = await appeler(cheminDeFiche(source, cle))
  if (!r.ok) throw await refus(r, REFUS_FICHE)
  return (await r.json()) as DossierDeFiche
}

/** Trouve le dossier de la fiche, ou le crée ; `adresse` : où la fiche s'ouvre dans l'outil. */
export async function creerDossierDeFiche(source: string, cle: string, titre: string, adresse?: string): Promise<DossierDeFiche> {
  const r = await appeler(cheminDeFiche(source, cle), { titre, ...(adresse ? { adresse } : {}) })
  if (!r.ok) throw await refus(r, REFUS_FICHE)
  return (await r.json()) as DossierDeFiche
}

/** Remet à sa place le dossier d'une fiche, jeté à la corbeille. */
export async function remettreDossierDeFiche(source: string, cle: string): Promise<DossierDeFiche> {
  const r = await appeler(`${cheminDeFiche(source, cle)}/remettre`, {})
  if (!r.ok) throw await refus(r, REFUS_FICHE)
  return (await r.json()) as DossierDeFiche
}

/** La recherche dans tous les tableaux du compte. */
export async function rechercherPartout(requete: string): Promise<ResultatRecherche[]> {
  const r = await appeler(`/api/recherche?q=${encodeURIComponent(requete)}`)
  if (!r.ok) throw await refus(r, {})
  const trouves = (await r.json()) as { tableau: string; titre: string; element: string | null; extrait: string }[]
  return trouves.map((t) => ({ tableau: t.tableau, titre: t.titre, ...(t.element ? { element: t.element } : {}), extrait: t.extrait }))
}

export interface EtatVerrou {
  /** Ce tableau-ci a un mot de passe. */
  protege: boolean
  /** Il est fermé pour ce compte, par lui ou par un tableau au-dessus. */
  verrouille: boolean
  /** Le tableau dont il faut le mot de passe. */
  par: string | null
  /** Un outil rattaché l'a généré (son propriétaire seul l'apprend) : son mot de passe ne se pose ni ne se retire. */
  genere?: { outil: string; titre: string }
}

const verrouDe = (tableau: string) => `/api/tableaux/${encodeURIComponent(tableau)}`

export async function etatVerrou(tableau: string): Promise<EtatVerrou> {
  const r = await appeler(`${verrouDe(tableau)}/verrou`)
  if (!r.ok) throw await refus(r, { ...TABLEAU_ABSENT })
  return (await r.json()) as EtatVerrou
}

/** Donne le mot de passe : le tableau s'ouvre pour ce compte. */
export async function deverrouiller(tableau: string, motDePasse: string): Promise<void> {
  const r = await appeler(`${verrouDe(tableau)}/deverrouiller`, { motDePasse })
  if (!r.ok) throw await refus(r, { 401: 'erreur.mot_de_passe_incorrect', 429: 'erreur.trop_d_essais', ...TABLEAU_ABSENT })
}

export async function poserMotDePasse(tableau: string, motDePasse: string): Promise<void> {
  const r = await appeler(`${verrouDe(tableau)}/mot-de-passe`, { motDePasse }, 'PUT')
  if (!r.ok) throw await refus(r, { mot_de_passe_invalide: 'erreur.mdp6', 400: 'erreur.mdp6', ...PROPRIETAIRE, ...TABLEAU_ABSENT })
}

export async function retirerMotDePasse(tableau: string): Promise<void> {
  const r = await appeler(`${verrouDe(tableau)}/mot-de-passe`, undefined, 'DELETE')
  if (!r.ok && r.status !== 404) throw await refus(r, { ...PROPRIETAIRE })
}

/** Donne le mot de passe d'un lien public : le navigateur garde l'accès (cookie propre à ce lien). */
export async function deverrouillerPublic(jeton: string, motDePasse: string): Promise<void> {
  const r = await appeler(`/api/public/${encodeURIComponent(jeton)}/deverrouiller`, { motDePasse })
  if (!r.ok) throw await refus(r, { 401: 'erreur.mot_de_passe_incorrect', 429: 'erreur.trop_d_essais', introuvable: 'erreur.lienDisparu', 404: 'erreur.lienDisparu' })
}

export type GenreActivite = 'cree' | 'modifie' | 'deplace' | 'supprime' | 'restaure' | 'commente' | 'titre'

export interface Personne {
  id: string
  nom: string
  couleur: string
}

export interface EvenementActivite {
  id: number
  genre: GenreActivite
  element: string
  typeElement: string
  libelle: string
  instant: number
  auteur: Personne
}

export interface GroupeActivite {
  auteur: Personne
  debut: number
  fin: number
  resume: Partial<Record<GenreActivite, number>>
  elements: { element: string; genre: GenreActivite; typeElement: string; libelle: string }[]
}

export interface ActiviteTableau {
  evenements: EvenementActivite[]
  groupes: GroupeActivite[]
  /** Le numéro du geste le plus récent : à redonner en `depuis` pour ne lire que la suite. */
  dernier: number
}

/** Ce qu'on a fait sur ce tableau, le plus récent d'abord ; `depuis` : seulement après ce numéro. */
export async function lireActivite(tableau: string, depuis?: number): Promise<ActiviteTableau> {
  const r = await appeler(`/api/tableaux/${encodeURIComponent(tableau)}/activite${depuis !== undefined ? `?depuis=${depuis}` : ''}`)
  if (!r.ok) throw await refus(r, { ...TABLEAU_ABSENT })
  return (await r.json()) as ActiviteTableau
}

export type GenreNotification = 'commentaire' | 'mention' | 'modification' | 'partage'

export interface Notification {
  id: number
  genre: GenreNotification
  tableau: string
  titreTableau: string
  element: string
  /**
   * Pour un commentaire : son fil, dans `element` ; vide pour une épingle ou le fil accroché à l'élément, sinon la clé
   * du passage commenté (marge d'une note ou d'un document) ou le sujet d'une carte mentale. Absent d'un serveur d'avant.
   */
  fil?: string
  extrait: string
  instant: number
  lu: boolean
  auteur: Personne
}

export interface ListeNotifications {
  notifications: Notification[]
  nonLues: number
}

export async function listerNotifications(): Promise<ListeNotifications> {
  const r = await appeler('/api/notifications')
  if (!r.ok) throw await refus(r, {})
  return (await r.json()) as ListeNotifications
}

/** Marque ces notifications comme lues, ou toutes si `ids` est absent. */
export async function marquerLues(ids?: number[]): Promise<void> {
  const r = await appeler('/api/notifications/lues', ids ? { ids } : { tout: true })
  if (!r.ok) throw await refus(r, {})
}

/** Un jeton personnel d'arrivée, tel que la liste le montre : jamais le jeton lui-même. */
export interface JetonArrivee {
  id: string
  nom: string
  cree: number
  dernierUsage: number | null
}

export async function listerJetons(): Promise<JetonArrivee[]> {
  const r = await appeler('/api/jetons')
  if (!r.ok) throw await refus(r, {})
  return (await r.json()) as JetonArrivee[]
}

/** Crée un jeton. Le jeton lui-même (`jeton`) n'est rendu qu'ici : il ne se relit plus. */
export async function creerJeton(nom: string): Promise<JetonArrivee & { jeton: string }> {
  const r = await appeler('/api/jetons', { nom })
  if (!r.ok) throw await refus(r, { 400: 'erreur.nom_jeton_invalide', 409: 'erreur.trop_de_jetons' })
  return (await r.json()) as JetonArrivee & { jeton: string }
}

export async function revoquerJeton(id: string): Promise<void> {
  const r = await appeler(`/api/jetons/${encodeURIComponent(id)}`, undefined, 'DELETE')
  if (!r.ok && r.status !== 404) throw await refus(r, {})
}
