import { type Element, type Habillage, type ResultatRecherche, lireHabillage, textesFr } from '@notak/tableau'
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

/** Ce que le serveur dit de lui (`GET /api/instance`) : son nom, ses inscriptions, les thèmes qu'il fournit. */
export interface Instance {
  nom: string
  inscriptions: 'ouvertes' | 'fermees'
  habillages: Habillage[]
  impose?: string
  parDefaut?: string
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

export async function seConnecter(email: string, motDePasse: string): Promise<Moi> {
  const r = await appeler('/api/connexion', { email, motDePasse })
  if (!r.ok) throw await refus(r, { 401: 'erreur.identifiants_incorrects', 400: 'erreur.identifiants_incorrects' })
  return (await r.json()) as Moi
}

export async function sInscrire(email: string, motDePasse: string, nom: string): Promise<Moi> {
  const r = await appeler('/api/inscription', { email, motDePasse, nom, langue: langue() })
  if (!r.ok) throw await refus(r, { 409: 'erreur.adresse_prise', 400: 'erreur.compte_invalide', 422: 'erreur.compte_invalide' })
  return (await r.json()) as Moi
}

/** Change la couleur et/ou la photo du compte (`photo: null` la retire) ; rend le compte à jour. */
export async function reglerCompte(reglages: { couleur?: string; photo?: string | null }): Promise<Moi> {
  const r = await appeler('/api/moi', reglages, 'PATCH')
  if (!r.ok) throw await refus(r, { 400: 'erreur.photo_format_refuse', 415: 'erreur.photo_format_refuse' })
  return (await r.json()) as Moi
}

export async function seDeconnecter(): Promise<void> {
  await appeler('/api/deconnexion', {})
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
