import type { Element, ResultatRecherche } from '@notak/tableau'
export interface Moi {
  id: string
  email: string
  nom: string
  couleur: string
  racine: string
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

/** Une erreur dont le message se montre tel quel. */
export class ErreurApi extends Error {
  constructor(
    message: string,
    readonly statut: number,
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
    throw new ErreurApi('Serveur injoignable', 0)
  }
}

const refus = (r: Response, messages: Record<number, string>) =>
  new ErreurApi(messages[r.status] ?? (r.status >= 500 ? 'Le serveur a un souci' : 'Demande refusée'), r.status)

/** La session en cours, ou `null` sans session. */
export async function moi(): Promise<Moi | null> {
  const r = await appeler('/api/moi')
  if (r.status === 401) return null
  if (!r.ok) throw refus(r, {})
  return (await r.json()) as Moi
}

export async function seConnecter(email: string, motDePasse: string): Promise<Moi> {
  const r = await appeler('/api/connexion', { email, motDePasse })
  if (!r.ok) throw refus(r, { 401: 'Adresse ou mot de passe incorrect', 400: 'Adresse ou mot de passe incorrect' })
  return (await r.json()) as Moi
}

export async function sInscrire(email: string, motDePasse: string, nom: string): Promise<Moi> {
  const r = await appeler('/api/inscription', { email, motDePasse, nom })
  if (!r.ok) throw refus(r, { 409: 'Cette adresse a déjà un compte', 400: 'Adresse ou mot de passe invalide', 422: 'Adresse ou mot de passe invalide' })
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
  if (!r.ok) throw refus(r, {})
  return (await r.json()) as TableauAccessible[]
}

export async function listerAcces(tableau: string): Promise<Acces[]> {
  const r = await appeler(`/api/tableaux/${encodeURIComponent(tableau)}/acces`)
  if (!r.ok) throw refus(r, { 404: 'Tableau introuvable', 403: 'Accès refusé' })
  return (await r.json()) as Acces[]
}

export async function partager(tableau: string, email: string, role: 'edition' | 'lecture'): Promise<void> {
  const r = await appeler(`/api/tableaux/${encodeURIComponent(tableau)}/partage`, { email, role })
  if (!r.ok) throw refus(r, { 400: 'Adresse invalide', 403: 'Réservé au propriétaire', 404: 'Tableau introuvable' })
}

export async function retirerAcces(tableau: string, email: string): Promise<void> {
  const r = await appeler(`/api/tableaux/${encodeURIComponent(tableau)}/partage`, { email }, 'DELETE')
  if (!r.ok) throw refus(r, { 409: 'Il faut garder un propriétaire', 403: 'Réservé au propriétaire', 404: 'Tableau introuvable' })
}

const lienDe = (tableau: string) => `/api/tableaux/${encodeURIComponent(tableau)}/lien`

/** Le jeton du lien public du tableau, ou `null` s'il n'est pas publié. */
export async function lienPublic(tableau: string): Promise<string | null> {
  const r = await appeler(lienDe(tableau))
  if (!r.ok) throw refus(r, { 403: 'Réservé au propriétaire', 404: 'Tableau introuvable' })
  return ((await r.json()) as { jeton: string | null }).jeton
}

export async function creerLienPublic(tableau: string): Promise<string> {
  const r = await appeler(lienDe(tableau), {})
  if (!r.ok) throw refus(r, { 403: 'Réservé au propriétaire', 404: 'Tableau introuvable' })
  return ((await r.json()) as { jeton: string }).jeton
}

export async function retirerLienPublic(tableau: string): Promise<void> {
  const r = await appeler(lienDe(tableau), undefined, 'DELETE')
  if (!r.ok && r.status !== 404) throw refus(r, { 403: 'Réservé au propriétaire' })
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
  if (!r.ok) throw refus(r, {})
  return (await r.json()) as TableauPublic
}

/** Les tableaux favoris du compte, le dernier ajouté d'abord. */
export async function listerFavoris(): Promise<TableauAccessible[]> {
  const r = await appeler('/api/favoris')
  if (!r.ok) throw refus(r, {})
  return (await r.json()) as TableauAccessible[]
}

export async function definirFavori(tableau: string, favori: boolean): Promise<void> {
  const r = await appeler(`/api/tableaux/${encodeURIComponent(tableau)}/favori`, undefined, favori ? 'PUT' : 'DELETE')
  if (!r.ok) throw refus(r, { 404: 'Tableau introuvable', 400: 'L’accueil ne se met pas en favori' })
}

/** Les derniers tableaux ouverts par le compte. */
export async function listerRecents(): Promise<TableauAccessible[]> {
  const r = await appeler('/api/recents')
  if (!r.ok) throw refus(r, {})
  return (await r.json()) as TableauAccessible[]
}

/** Note l'ouverture d'un tableau, pour la liste des récents. */
export async function noterVu(tableau: string): Promise<void> {
  await appeler(`/api/tableaux/${encodeURIComponent(tableau)}/vu`, {}).catch(() => {})
}

/** La recherche dans tous les tableaux du compte. */
export async function rechercherPartout(requete: string): Promise<ResultatRecherche[]> {
  const r = await appeler(`/api/recherche?q=${encodeURIComponent(requete)}`)
  if (!r.ok) throw refus(r, {})
  const trouves = (await r.json()) as { tableau: string; titre: string; element: string | null; extrait: string }[]
  return trouves.map((t) => ({ tableau: t.tableau, titre: t.titre, ...(t.element ? { element: t.element } : {}), extrait: t.extrait }))
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
  if (!r.ok) throw refus(r, { 404: 'Tableau introuvable' })
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
  if (!r.ok) throw refus(r, {})
  return (await r.json()) as ListeNotifications
}

/** Marque ces notifications comme lues, ou toutes si `ids` est absent. */
export async function marquerLues(ids?: number[]): Promise<void> {
  const r = await appeler('/api/notifications/lues', ids ? { ids } : { tout: true })
  if (!r.ok) throw refus(r, {})
}
