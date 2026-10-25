import { type Element, type ResultatRecherche, textesFr } from '@notak/tableau'
import { langue, t } from './langue'

export interface Moi {
  id: string
  email: string
  nom: string
  couleur: string
  racine: string
  /** Le fichier de sa photo (voir `adressePhoto`), ou `null`. */
  photo: string | null
}

export type Role = 'proprietaire' | 'edition' | 'lecture'

export interface Acces {
  utilisateur?: string
  email: string
  nom?: string
  role: Role
  enAttente: boolean
  /** Donné sur un tableau parent : il se retire là-haut. */
  herite?: boolean
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
  try {
    return await fetch(chemin, {
      method: methode,
      credentials: 'same-origin',
      ...(corps === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }),
    })
  } catch {
    throw new ErreurApi(t('erreur.injoignable'), 0)
  }
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
  const message = cle ? t(cle) : (serveur ?? t(r.status >= 500 ? 'erreur.serveur' : 'erreur.refusee'))
  return new ErreurApi(message, r.status, code)
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

export async function partager(tableau: string, email: string, role: 'edition' | 'lecture'): Promise<void> {
  const r = await appeler(`/api/tableaux/${encodeURIComponent(tableau)}/partage`, { email, role })
  if (!r.ok) throw await refus(r, { demande_invalide: 'erreur.adresse_invalide', 400: 'erreur.adresse_invalide', ...PROPRIETAIRE, ...TABLEAU_ABSENT })
}

export async function retirerAcces(tableau: string, email: string): Promise<void> {
  const r = await appeler(`/api/tableaux/${encodeURIComponent(tableau)}/partage`, { email }, 'DELETE')
  if (!r.ok) throw await refus(r, { 409: 'erreur.dernier_proprietaire', ...PROPRIETAIRE, ...TABLEAU_ABSENT })
}

const lienDe = (tableau: string) => `/api/tableaux/${encodeURIComponent(tableau)}/lien`

/** Le jeton du lien public du tableau, ou `null` s'il n'est pas publié. */
export async function lienPublic(tableau: string): Promise<string | null> {
  const r = await appeler(lienDe(tableau))
  if (!r.ok) throw await refus(r, { ...PROPRIETAIRE, ...TABLEAU_ABSENT })
  return ((await r.json()) as { jeton: string | null }).jeton
}

export async function creerLienPublic(tableau: string): Promise<string> {
  const r = await appeler(lienDe(tableau), {})
  if (!r.ok) throw await refus(r, { ...PROPRIETAIRE, ...TABLEAU_ABSENT })
  return ((await r.json()) as { jeton: string }).jeton
}

export async function retirerLienPublic(tableau: string): Promise<void> {
  const r = await appeler(lienDe(tableau), undefined, 'DELETE')
  if (!r.ok && r.status !== 404) throw await refus(r, { ...PROPRIETAIRE })
}

/** L'adresse que l'on donne : la page de lecture du tableau. */
export const adressePublique = (jeton: string) => `${location.origin}/p/${jeton}`

export interface TableauPublic {
  titre: string
  couleur?: string
  elements: Element[]
  /** Le titre des tableaux imbriqués, pour leurs cartes. */
  titres: Record<string, string>
}

/** Un tableau publié, lu sans compte ; `null` si le lien n'existe pas ou plus. */
export async function lirePublic(jeton: string): Promise<TableauPublic | null> {
  const r = await appeler(`/api/public/${encodeURIComponent(jeton)}`)
  if (r.status === 404) return null
  if (!r.ok) throw await refus(r, { mot_de_passe_requis: 'erreur.lienProtege', 401: 'erreur.lienProtege' })
  return (await r.json()) as TableauPublic
}

/** Les tableaux favoris du compte, le dernier ajouté d'abord. */
export async function listerFavoris(): Promise<TableauAccessible[]> {
  const r = await appeler('/api/favoris')
  if (!r.ok) throw await refus(r, {})
  return (await r.json()) as TableauAccessible[]
}

export async function definirFavori(tableau: string, favori: boolean): Promise<void> {
  const r = await appeler(`/api/tableaux/${encodeURIComponent(tableau)}/favori`, undefined, favori ? 'PUT' : 'DELETE')
  if (!r.ok) throw await refus(r, { ...TABLEAU_ABSENT, 400: 'erreur.accueil_pas_favori' })
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

const motDePasseDuLien = (tableau: string) => `${lienDe(tableau)}/mot-de-passe`

export async function lienProtege(tableau: string): Promise<boolean> {
  const r = await appeler(motDePasseDuLien(tableau))
  if (!r.ok) throw await refus(r, { ...PROPRIETAIRE, ...TABLEAU_ABSENT })
  return ((await r.json()) as { protege: boolean }).protege
}

export async function poserMotDePasseDuLien(tableau: string, motDePasse: string): Promise<void> {
  const r = await appeler(motDePasseDuLien(tableau), { motDePasse }, 'PUT')
  if (!r.ok) throw await refus(r, { mot_de_passe_invalide: 'erreur.mdp6', 400: 'erreur.mdp6', ...PROPRIETAIRE, ...TABLEAU_ABSENT })
}

export async function retirerMotDePasseDuLien(tableau: string): Promise<void> {
  const r = await appeler(motDePasseDuLien(tableau), undefined, 'DELETE')
  if (!r.ok && r.status !== 404) throw await refus(r, { ...PROPRIETAIRE })
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
