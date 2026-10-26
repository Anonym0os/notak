import { DatabaseSync } from 'node:sqlite'
import { type Cle, ErreurChiffrement, duDisque, pourLeDisque } from './chiffrement.ts'
import { type Acces, RELATION_DU_ROLE, ROLES, type Role, roleDeRelation } from './droits.ts'
import { migrer } from './migrations.ts'
import type { ResumeContenu } from './contenu.ts'

// Tout le SQL du serveur vit ici : passer à Postgres, c'est réécrire ce fichier.

export interface Utilisateur {
  id: string
  email: string
  nom: string
  couleur: string
  racine: string
  /** Le fichier de sa photo (déposé par `/api/fichiers`), ou rien. */
  photo?: string | null
}

export interface LigneTableau {
  id: string
  titre: string
  proprietaire: string
  parent: string | null
  /** L'espace où vit le tableau ; `null` pour un tableau d'un espace supprimé. Absent : celui du parent, ou aucun. */
  espace?: string | null
}

/** Une relation du modèle d'autorisation : `sujet` a `relation` sur `objet` (`user:u1` est `editeur` de `tableau:t1`). */
export interface Relation {
  objet: string
  relation: string
  sujet: string
}

/** Un espace d'équipe (une organisation de Better Auth), vu par Notak. */
export interface Espace {
  id: string
  nom: string
  /** Son tableau d'accueil. */
  racine: string
  /** L'espace personnel d'un compte, dont il est seul membre. */
  personnel: boolean
}

/** Un jeton personnel d'arrivée : ce que la base en garde, jamais le jeton lui-même. */
export interface JetonArrivee {
  id: string
  nom: string
  cree: number
  /** Le dernier instant où il a servi, ou `null` s'il n'a jamais servi. */
  dernierUsage: number | null
}

export interface Invitation {
  tableau: string
  email: string
  role: Role
  /** Quand elle a été faite (ms) : elle vaut `DUREE_INVITATION_MS`. */
  cree: number
  /** Qui l'a faite, s'il a encore un compte. */
  par: string | null
  /** Jusqu'à quand l'accès qu'elle donne vaudra (ms), ou `null` : sans limite. */
  echeance: number | null
}

/** Voir le tableau, ou le voir et le commenter : un visiteur sans compte ne modifie jamais rien. */
export type NiveauVisiteur = 'lecture' | 'commentaire'

/** Un lien visiteur : qui l'a, sans compte, regarde le tableau (et le commente, si le niveau le permet). */
export interface LienVisiteur {
  /** L'identifiant qui sert à le gérer : il ne révèle pas le jeton. */
  id: string
  tableau: string
  /** Le secret de l'adresse (`/p/<jeton>`). */
  jeton: string
  /** Pour qui, ou pour quoi : « Client Dupont », « Jury ». Peut être vide. */
  nom: string
  niveau: NiveauVisiteur
  cree: number
  par: string | null
  /** Jusqu'à quand il ouvre le tableau (ms), ou `null` : sans limite. */
  expire: number | null
  /** L'empreinte de son mot de passe, ou `null`. */
  motDePasse: string | null
  /** La dernière fois qu'on l'a ouvert, ou `null` s'il n'a jamais servi. */
  derniereVisite: number | null
}

export interface Fichier {
  id: string
  type: string
  taille: number
  auteur: string
}

/** Ce que protège un mot de passe : l'ouverture du tableau aux comptes. Un lien visiteur porte le sien. */
export type Portee = 'tableau'
export type GenreActivite = 'cree' | 'modifie' | 'deplace' | 'supprime' | 'restaure' | 'commente' | 'titre'

export interface NouvelleActivite {
  tableau: string
  auteur: string
  genre: GenreActivite
  /** L'élément touché ; vide pour le titre du tableau. */
  element: string
  typeElement: string
  libelle: string
  instant: number
}

export interface LigneActivite extends Omit<NouvelleActivite, 'auteur'> {
  id: number
  auteur: { id: string; nom: string; couleur: string }
}

export type GenreNotification = 'commentaire' | 'mention' | 'modification' | 'partage'

export interface NouvelleNotification {
  destinataire: string
  genre: GenreNotification
  tableau: string
  element: string
  auteur: string
  extrait: string
  instant: number
}

export interface LigneNotification extends Omit<NouvelleNotification, 'auteur' | 'destinataire'> {
  id: number
  auteur: { id: string; nom: string; couleur: string }
  lu: boolean
}

export interface Base {
  /** La base elle-même, pour Better Auth (`auth.ts`), qui y écrit ses tables par son propre SQL. */
  readonly db: DatabaseSync
  /** Exécute `travail` dans une transaction : annulée si elle lève. Déjà dans une transaction, il s'y joint. */
  transaction<T>(travail: () => T): T
  fermer(): void

  utilisateurParEmail(email: string): Utilisateur | null
  utilisateurParId(id: string): Utilisateur | null
  /** Change la couleur et/ou la photo du compte (`null` retire la photo) ; ce qui manque ne bouge pas. */
  reglerCompte(id: string, reglages: { couleur?: string; photo?: string | null }): void

  /** Crée un jeton d'arrivée. Seule l'empreinte (SHA-256 du jeton) est gardée. */
  creerJetonArrivee(j: { id: string; utilisateur: string; nom: string; empreinte: string; cree: number }): void
  jetonsArrivee(utilisateur: string): JetonArrivee[]
  /** Révoque un jeton du compte ; rend faux s'il n'y en avait pas. */
  retirerJetonArrivee(utilisateur: string, id: string): boolean
  /** Le compte à qui appartient ce jeton (par empreinte), et note qu'il vient de servir. */
  utilisateurDuJetonArrivee(empreinte: string, maintenant: number): Utilisateur | null

  tableau(id: string): LigneTableau | null
  /** Crée le tableau ; sans `espace`, il prend celui de son parent. */
  creerTableau(t: LigneTableau): void
  changerTitre(id: string, titre: string): void
  /** Range le tableau sous un autre : ses accès hérités suivent son nouveau parent. */
  changerParent(id: string, parent: string): void
  /** Tous les tableaux placés sous celui-ci, à toute profondeur. */
  descendants(id: string): string[]

  espace(id: string): Espace | null
  /** Rattache un tableau d'accueil à un espace qui vient de naître. */
  definirEspace(id: string, racine: string, personnel: boolean): void
  espacePersonnel(utilisateur: string): string | null
  /** L'émetteur d'un fournisseur SSO déclaré, par son identifiant. */
  emetteurSso(fournisseur: string): string | null
  /** Tous les tableaux qui vivent dans cet espace. */
  tableauxDeLEspace(espace: string): string[]
  /** Les espaces dont le compte est membre, avec son rôle (plusieurs rôles se séparent par des virgules). */
  espacesDe(utilisateur: string): (Espace & { role: string })[]
  /** Le rôle de ce compte dans l'espace, ou `null` s'il n'en est pas membre. */
  roleMembre(espace: string, utilisateur: string): string | null
  /** Les permissions d'un rôle composé par l'espace (JSON de Better Auth), ou `null` s'il n'existe pas. */
  permissionsRole(espace: string, role: string): Record<string, string[]> | null

  /** Les accès donnés directement à des comptes sur ce tableau. */
  acces(tableau: string): Acces[]
  /** Les tableaux partagés directement à ce compte. */
  tableauxAccessibles(utilisateur: string): { id: string; titre: string; role: Role }[]
  /** Donne ce rôle à ce compte sur ce tableau, à la place de celui qu'il avait. */
  definirAcces(a: Acces): void
  retirerAcces(tableau: string, utilisateur: string): void
  /** Donne ce rôle sur ce tableau à un autre sujet qu'un compte (`equipe:x#membre`, `lien:jeton`) ; `null` le retire. */
  definirRoleDe(tableau: string, sujet: string, role: Role | null): void

  // ---- Les relations, source de vérité des droits, et leur envoi vers OpenFGA ----

  ajouterRelation(r: Relation): void
  retirerRelation(r: Relation): void
  relationExiste(r: Relation): boolean
  relationsSur(objet: string): Relation[]
  /** Les éléments de ce tableau qui ont leurs propres droits. */
  elementsAvecDroits(tableau: string): string[]
  /** Les relations d'un espace : les siennes, celles de ses rôles et de ses équipes. */
  relationsDeLEspace(espace: string): Relation[]
  /** Les relations qui désignent une équipe, un espace ou un rôle qui n'existe plus. */
  relationsOrphelines(): Relation[]
  /** Les prochains changements à envoyer, du plus ancien au plus récent. */
  boiteEnvoi(limite: number): (Relation & { id: number })[]
  /** Retire de la boîte ce qui est parti ; un changement repassé depuis garde sa place. */
  sortirDeBoite(lignes: readonly { id: number }[]): void
  /** Remet toutes les relations dans la boîte : pour remplir un OpenFGA vide. */
  remplirBoite(): void
  reglage(cle: string): string | null
  definirReglage(cle: string, valeur: string): void
  espacesASynchroniser(): string[]
  espaceSynchronise(espace: string): void
  membresEspace(espace: string): { utilisateur: string; role: string }[]
  rolesComposes(espace: string): { role: string; permission: string }[]
  equipesEspace(espace: string): { id: string; membres: string[] }[]

  invitations(tableau: string): Invitation[]
  invitationsPour(email: string): Invitation[]
  /** Pose (ou refait) l'invitation ; `jeton` : l'empreinte du jeton de son lien, qui remplace l'ancien. */
  definirInvitation(i: Invitation & { jeton: string }): void
  /** L'invitation dont le lien porte ce jeton (par son empreinte). */
  invitationDuJeton(empreinte: string): Invitation | null
  /** Change le rôle et l'échéance d'une invitation, sans toucher à son lien. */
  modifierInvitation(tableau: string, email: string, m: { role: Role; echeance: number | null }): void
  retirerInvitation(tableau: string, email: string): boolean
  supprimerInvitationsPour(email: string): void
  /** L'adresse de ce compte est vérifiée (un lien ouvert, un fournisseur qui la garantit, un compte créé par l'admin). */
  emailVerifie(utilisateur: string): boolean
  /** Marque l'adresse de ce compte vérifiée. */
  verifierEmail(utilisateur: string): void
  // ---- Les échéances des accès donnés à des comptes ----
  /** Jusqu'à quand ce sujet garde son rôle direct sur ce tableau, ou `null` : sans limite. */
  echeance(tableau: string, sujet: string): number | null
  /** Pose l'échéance du rôle direct de ce sujet ; `null` la retire. Retirer le rôle retire aussi l'échéance. */
  definirEcheance(tableau: string, sujet: string, expire: number | null): void
  /** Une échéance est-elle passée, dont le rôle n'a pas encore été retiré ? */
  echeanceAtteinte(maintenant: number): boolean
  /** Retire les rôles dont l'échéance est passée ; rend les tableaux touchés. */
  expirerAcces(maintenant: number): string[]

  document(nom: string): Uint8Array | null
  enregistrerDocument(nom: string, etat: Uint8Array): void

  creerFichier(f: Fichier): void
  fichier(id: string): Fichier | null

  // ---- Les liens visiteurs ----
  /** Les liens visiteurs du tableau, du plus ancien au plus récent. */
  liensVisiteurs(tableau: string): LienVisiteur[]
  lienVisiteur(id: string): LienVisiteur | null
  lienDuJeton(jeton: string): LienVisiteur | null
  /** Crée le lien ; `lien:<jeton>` reçoit sur le tableau le rôle de son niveau. */
  creerLienVisiteur(l: Omit<LienVisiteur, 'derniereVisite'>): void
  /** Change son nom, son niveau ou son échéance ; ce qui manque ne bouge pas. */
  modifierLienVisiteur(id: string, m: { nom?: string; niveau?: NiveauVisiteur; expire?: number | null }): void
  /** Pose, change ou retire (`null`) son mot de passe : ceux qui l'avaient donné doivent le redonner. */
  definirMotDePasseLien(id: string, empreinte: string | null): void
  /** Retire le lien et son rôle : son adresse n'ouvre plus rien. Rend faux s'il n'existait pas. */
  retirerLienVisiteur(id: string): boolean
  noterVisite(id: string, maintenant: number): void
  /** Un accès donné contre le mot de passe d'un lien : seule l'empreinte du jeton du cookie est gardée. */
  creerAccesLien(empreinte: string, lien: string, expire: number): void
  accesLienValide(empreinte: string, lien: string, maintenant: number): boolean
  /** Une équipe, et l'espace où elle vit. */
  equipe(id: string): { id: string; nom: string; espace: string } | null

  /** L'empreinte du mot de passe de ce tableau pour cette portée, ou `null` s'il n'en a pas. */
  motDePasse(tableau: string, portee: Portee): string | null
  /** Pose (ou change) le mot de passe. Les comptes qui avaient ouvert le tableau doivent le redonner. */
  definirMotDePasse(tableau: string, portee: Portee, empreinte: string): void
  /** Retire le mot de passe ; rend faux s'il n'y en avait pas. */
  retirerMotDePasse(tableau: string, portee: Portee): boolean
  /** Ce compte a-t-il donné le mot de passe de ce tableau ? */
  aOuvert(utilisateur: string, tableau: string): boolean
  noterOuverture(utilisateur: string, tableau: string): void

  /** Les tableaux favoris d'un compte, le dernier ajouté d'abord. */
  favoris(utilisateur: string): string[]
  definirFavori(utilisateur: string, tableau: string, maintenant: number): void
  retirerFavori(utilisateur: string, tableau: string): boolean
  /** Note l'ouverture d'un tableau ; seuls les plus récents sont gardés. */
  noterVu(utilisateur: string, tableau: string, maintenant: number): void
  /** Les tableaux ouverts en dernier par un compte, le plus récent d'abord. */
  recents(utilisateur: string, limite: number): string[]
  /** Note l'ouverture en grand d'une carte mentale ou d'un document ; seuls les plus récents sont gardés. */
  noterElementVu(utilisateur: string, tableau: string, element: string, maintenant: number): void
  /** Quand ce compte a ouvert chaque toile (`element` vide) et chaque élément qu'on garde de lui, le plus récent d'abord. */
  vus(utilisateur: string): { tableau: string; element: string; vu: number }[]

  /**
   * Note ce qu'une personne vient de faire dans un tableau. Le même geste sur le même élément par la même personne
   * dans les `fenetre` ms qui précèdent n'ajoute pas de ligne : il renouvelle l'instant de la précédente.
   */
  noterActivite(a: NouvelleActivite, fenetre: number): void
  /** Les gestes d'un tableau, le plus récent d'abord ; `apres` : seulement ceux d'un numéro supérieur. */
  activite(tableau: string, limite: number, apres?: number): LigneActivite[]

  /**
   * Ajoute une notification. Avec `fusionner` (ms), une notification non lue du même genre, sur le même tableau,
   * du même auteur et au même destinataire, notée dans cette fenêtre, est renouvelée au lieu d'être doublée.
   */
  noterNotification(n: NouvelleNotification, fusionner?: number): void
  /** Les notifications d'un compte, la plus récente d'abord. */
  notifications(destinataire: string, limite: number): LigneNotification[]
  nonLues(destinataire: string): number
  /** Marque comme lues ces notifications de ce compte, ou toutes si `ids` est `null` ; rend leur nombre. */
  marquerLues(destinataire: string, ids: readonly number[] | null): number

  /**
   * Remplace tout ce qu'on sait chercher dans ce tableau (`element` vide : le titre du tableau), et la liste des
   * fichiers qu'il montre.
   */
  indexer(tableau: string, entrees: readonly EntreeIndex[], fichiers?: readonly string[], contenus?: readonly ResumeContenu[]): void
  /** Les toiles, cartes mentales et documents de ces tableaux, tels que l'index les a vus. */
  contenus(tableaux: readonly string[]): LigneContenu[]
  /** Les tableaux qui montrent ce fichier. */
  tableauxDuFichier(fichier: string): string[]
  /** Ce fichier est la photo d'un compte. */
  estPhoto(fichier: string): boolean
  /** Les tableaux dont le document est enregistré mais que l'index n'a jamais vus. */
  tableauxNonIndexes(): string[]
  /** Les meilleures correspondances dans ces tableaux ; `requete` est une expression FTS5 (voir `requeteIndex`). */
  chercher(requete: string, tableaux: readonly string[], limite: number): Trouve[]
}

export interface LigneContenu {
  tableau: string
  /** Vide : la toile elle-même. */
  element: string
  genre: ResumeContenu['genre']
  titre: string
  /** Le `ResumeContenu` entier, en JSON. */
  resume: string
}

export interface EntreeIndex {
  element: string
  texte: string
}

export interface Trouve {
  tableau: string
  element: string
  extrait: string
}

/** Combien de temps un accès donné contre le mot de passe d'un lien visiteur reste valable, au plus. */
export const DUREE_ACCES_PUBLIC_MS = 24 * 3600 * 1000
/** Combien de temps le lien d'une invitation s'accepte. */
export const DUREE_INVITATION_MS = 30 * 24 * 3600 * 1000

/** Combien de tableaux récents on garde par compte. */
export const RECENTS_GARDES = 50
/** Les cartes mentales et documents ouverts qu'on garde par compte. */
export const ELEMENTS_VUS_GARDES = 200
/** Combien de gestes on garde par tableau, et de notifications par compte. */
export const ACTIVITE_GARDEE = 500
export const NOTIFICATIONS_GARDEES = 200


type Ligne = Record<string, unknown>

/** Les premiers octets d'un état chiffré (`NKC1`), pour en trouver un en SQL. */
const MAGIE_CHIFFRE = new TextEncoder().encode('NKC1')

/**
 * Ouvre la base. Avec `cle`, l'état des documents est chiffré à l'écriture et déchiffré à la lecture (voir
 * `chiffrement.ts`) ; un état d'avant, en clair, se lit tel quel et repart chiffré à sa prochaine écriture.
 * Une clé fausse, ou l'absence de clé devant des documents chiffrés, refuse d'ouvrir : sinon la synchro partirait
 * d'un document vide et l'enregistrerait par-dessus le vrai.
 */
export function ouvrirBase(chemin: string, cle: Cle | null = null): Base {
  const db = new DatabaseSync(chemin)
  // Avec une clé, ce que SQLite efface est mis à zéro : l'état en clair qu'un document chiffré remplace ne traîne pas.
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;${cle ? ' PRAGMA secure_delete = ON;' : ''}`)
  migrer(db, chemin === ':memory:' ? undefined : (version) => `${chemin}.avant-${version}`)
  const temoin = db.prepare('SELECT etat FROM documents WHERE substr(etat, 1, 4) = ? LIMIT 1').get(MAGIE_CHIFFRE) as { etat: Uint8Array } | undefined
  if (temoin) {
    try {
      duDisque(cle, temoin.etat)
    } catch (e) {
      db.close()
      throw new ErreurChiffrement(`les documents ne se déchiffrent pas : ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const tous = (sql: string, ...params: (string | number | Uint8Array)[]): Ligne[] =>
    db.prepare(sql).all(...params) as Ligne[]
  const un = (sql: string, ...params: (string | number | Uint8Array)[]): Ligne | null =>
    (db.prepare(sql).get(...params) as Ligne | undefined) ?? null
  const executer = (sql: string, ...params: (string | number | Uint8Array | null)[]) => db.prepare(sql).run(...params)

  /** Le mot de passe d'un tableau change ou disparaît : ceux qui l'avaient donné doivent le redonner. */
  const oublierLeves = (tableau: string, _portee: Portee) => void executer('DELETE FROM ouvertures WHERE tableau = ?', tableau)

  const invitation = (l: Ligne | null): Invitation | null =>
    l
      ? {
          tableau: l.tableau as string,
          email: l.email as string,
          role: l.role as Role,
          cree: l.cree as number,
          par: (l.par as string | null) ?? null,
          echeance: (l.echeance as number | null) ?? null,
        }
      : null
  const COLONNES_INVITATION = 'tableau, email, role, cree, par, echeance'

  const lienVisiteur = (l: Ligne | null): LienVisiteur | null =>
    l
      ? {
          id: l.id as string,
          tableau: l.tableau as string,
          jeton: l.jeton as string,
          nom: l.nom as string,
          niveau: l.niveau as NiveauVisiteur,
          cree: l.cree as number,
          par: (l.par as string | null) ?? null,
          expire: (l.expire as number | null) ?? null,
          motDePasse: (l.mot_de_passe as string | null) ?? null,
          derniereVisite: (l.derniere_visite as number | null) ?? null,
        }
      : null

  // Les colonnes que Better Auth ajoute à `utilisateurs` (adresse vérifiée, dates, avatar d'un fournisseur) n'en sortent pas.
  const utilisateur = (l: Ligne | null): Utilisateur | null =>
    l ? { id: l.id as string, email: l.email as string, nom: l.nom as string, couleur: l.couleur as string, racine: l.racine as string, photo: (l.photo as string | null) ?? null } : null

  const transaction = <T>(travail: () => T): T => {
    if (db.isTransaction) return travail()
    db.exec('BEGIN IMMEDIATE')
    try {
      const resultat = travail()
      db.exec('COMMIT')
      return resultat
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }

  /** Marque une relation comme à envoyer : une ligne neuve, pour qu'un envoi déjà en route ne l'emporte pas. */
  const aEnvoyer = (r: Relation) => {
    executer('DELETE FROM boite_envoi WHERE objet = ? AND relation = ? AND sujet = ?', r.objet, r.relation, r.sujet)
    executer('INSERT INTO boite_envoi (objet, relation, sujet) VALUES (?, ?, ?)', r.objet, r.relation, r.sujet)
  }
  const ajouterRelation = (r: Relation) =>
    transaction(() => {
      if (Number(executer('INSERT OR IGNORE INTO relations (objet, relation, sujet) VALUES (?, ?, ?)', r.objet, r.relation, r.sujet).changes) > 0) aEnvoyer(r)
    })
  const retirerRelation = (r: Relation) =>
    transaction(() => {
      if (Number(executer('DELETE FROM relations WHERE objet = ? AND relation = ? AND sujet = ?', r.objet, r.relation, r.sujet).changes) > 0) aEnvoyer(r)
    })
  const relationsSur = (objet: string) => tous('SELECT objet, relation, sujet FROM relations WHERE objet = ?', objet) as unknown as Relation[]
  /** Un sujet n'a qu'un rôle direct sur un tableau : le nouveau remplace l'ancien. Sans rôle, plus d'échéance. */
  const definirRoleDe = (tableau: string, sujet: string, role: Role | null) =>
    transaction(() => {
      for (const r of ROLES) {
        const relation = { objet: `tableau:${tableau}`, relation: RELATION_DU_ROLE[r], sujet }
        if (r === role) ajouterRelation(relation)
        else retirerRelation(relation)
      }
      if (role === null) executer('DELETE FROM echeances WHERE tableau = ? AND sujet = ?', tableau, sujet)
    })

  return {
    db,
    transaction,
    fermer: () => db.close(),

    utilisateurParEmail: (email) => utilisateur(un('SELECT * FROM utilisateurs WHERE email = ?', email)),
    utilisateurParId: (id) => utilisateur(un('SELECT * FROM utilisateurs WHERE id = ?', id)),
    reglerCompte(id, r) {
      if (r.couleur !== undefined) executer('UPDATE utilisateurs SET couleur = ? WHERE id = ?', r.couleur, id)
      if (r.photo !== undefined) executer('UPDATE utilisateurs SET photo = ? WHERE id = ?', r.photo, id)
    },

    creerJetonArrivee: (j) =>
      void executer('INSERT INTO jetons_arrivee (id,utilisateur,nom,empreinte,cree) VALUES (?,?,?,?,?)', j.id, j.utilisateur, j.nom, j.empreinte, j.cree),
    jetonsArrivee: (utilisateur) =>
      tous('SELECT id, nom, cree, dernier_usage AS dernierUsage FROM jetons_arrivee WHERE utilisateur = ? ORDER BY cree, id', utilisateur) as unknown as JetonArrivee[],
    retirerJetonArrivee: (utilisateur, id) => Number(executer('DELETE FROM jetons_arrivee WHERE utilisateur = ? AND id = ?', utilisateur, id).changes) > 0,
    utilisateurDuJetonArrivee(empreinte, maintenant) {
      const u = utilisateur(un('SELECT u.* FROM jetons_arrivee j JOIN utilisateurs u ON u.id = j.utilisateur WHERE j.empreinte = ?', empreinte))
      if (u) executer('UPDATE jetons_arrivee SET dernier_usage = ? WHERE empreinte = ?', maintenant, empreinte)
      return u
    },

    tableau: (id) => (un('SELECT * FROM tableaux WHERE id = ?', id) as LigneTableau | null),
    creerTableau(t) {
      const espace = t.espace !== undefined ? t.espace : t.parent ? ((un('SELECT espace FROM tableaux WHERE id = ?', t.parent)?.espace as string | null | undefined) ?? null) : null
      transaction(() => {
        executer('INSERT INTO tableaux (id,titre,proprietaire,parent,espace) VALUES (?,?,?,?,?)', t.id, t.titre, t.proprietaire, t.parent, espace)
        if (t.parent) ajouterRelation({ objet: `tableau:${t.id}`, relation: 'parent', sujet: `tableau:${t.parent}` })
        if (espace) ajouterRelation({ objet: `tableau:${t.id}`, relation: 'espace', sujet: `espace:${espace}` })
      })
    },

    espace(id) {
      const l = un('SELECT o.id, o.name AS nom, e.racine, e.personnel FROM organization o JOIN espaces e ON e.espace = o.id WHERE o.id = ?', id)
      return l ? { id: l.id as string, nom: l.nom as string, racine: l.racine as string, personnel: l.personnel === 1 } : null
    },
    definirEspace: (id, racine, personnel) =>
      void executer('INSERT INTO espaces (espace,racine,personnel) VALUES (?,?,?) ON CONFLICT(espace) DO UPDATE SET racine = excluded.racine', id, racine, personnel ? 1 : 0),
    espacePersonnel: (u) =>
      (un("SELECT e.espace FROM espaces e JOIN member m ON m.organizationId = e.espace WHERE e.personnel = 1 AND m.userId = ? AND m.role = 'owner'", u)
        ?.espace as string | undefined) ?? null,
    emetteurSso: (f) => (un('SELECT issuer FROM ssoProvider WHERE providerId = ?', f)?.issuer as string | undefined) ?? null,
    tableauxDeLEspace: (espace) => (tous('SELECT id FROM tableaux WHERE espace = ?', espace) as unknown as { id: string }[]).map((l) => l.id),
    espacesDe: (u) =>
      (
        tous(
          `SELECT o.id, o.name AS nom, e.racine, e.personnel, m.role FROM member m
           JOIN organization o ON o.id = m.organizationId JOIN espaces e ON e.espace = o.id
           WHERE m.userId = ? ORDER BY e.personnel DESC, o.name`,
          u,
        ) as unknown as { id: string; nom: string; racine: string; personnel: number; role: string }[]
      ).map((l) => ({ ...l, personnel: l.personnel === 1 })),
    roleMembre: (espace, u) => (un('SELECT role FROM member WHERE organizationId = ? AND userId = ?', espace, u)?.role as string | undefined) ?? null,
    permissionsRole(espace, role) {
      const l = un('SELECT permission FROM organizationRole WHERE organizationId = ? AND role = ?', espace, role)
      try {
        return l ? (JSON.parse(l.permission as string) as Record<string, string[]>) : null
      } catch {
        return null
      }
    },
    changerTitre: (id, titre) => void executer('UPDATE tableaux SET titre = ? WHERE id = ?', titre, id),
    changerParent(id, parent) {
      const ancien = (un('SELECT parent FROM tableaux WHERE id = ?', id)?.parent as string | null | undefined) ?? null
      if (ancien === parent) return
      transaction(() => {
        executer('UPDATE tableaux SET parent = ? WHERE id = ?', parent, id)
        if (ancien) retirerRelation({ objet: `tableau:${id}`, relation: 'parent', sujet: `tableau:${ancien}` })
        ajouterRelation({ objet: `tableau:${id}`, relation: 'parent', sujet: `tableau:${parent}` })
      })
    },

    acces: (tableau) =>
      relationsSur(`tableau:${tableau}`).flatMap((r) => {
        const role = roleDeRelation(r.relation)
        return role && r.sujet.startsWith('user:') ? [{ tableau, utilisateur: r.sujet.slice(5), role }] : []
      }),
    descendants: (id) =>
      (
        tous(
          'WITH RECURSIVE d(id) AS (SELECT id FROM tableaux WHERE parent = ? UNION SELECT t.id FROM tableaux t JOIN d ON t.parent = d.id) SELECT id FROM d',
          id,
        ) as unknown as { id: string }[]
      ).map((l) => l.id),
    tableauxAccessibles: (u) =>
      (
        tous(
          "SELECT t.id, t.titre, r.relation FROM relations r JOIN tableaux t ON 'tableau:' || t.id = r.objet WHERE r.sujet = ? AND r.objet LIKE 'tableau:%'",
          `user:${u}`,
        ) as unknown as { id: string; titre: string; relation: string }[]
      ).flatMap(({ id, titre, relation }) => {
        const role = roleDeRelation(relation)
        return role ? [{ id, titre, role }] : []
      }),
    definirAcces: (a) => definirRoleDe(a.tableau, `user:${a.utilisateur}`, a.role),
    retirerAcces: (tableau, u) => definirRoleDe(tableau, `user:${u}`, null),
    definirRoleDe: (tableau, sujet, role) => definirRoleDe(tableau, sujet, role),

    ajouterRelation: (r) => ajouterRelation(r),
    retirerRelation: (r) => retirerRelation(r),
    relationExiste: (r) => un('SELECT 1 AS ok FROM relations WHERE objet = ? AND relation = ? AND sujet = ?', r.objet, r.relation, r.sujet) !== null,
    relationsSur: (objet) => relationsSur(objet),
    elementsAvecDroits: (tableau) =>
      (
        tous("SELECT DISTINCT substr(objet, ?) AS id FROM relations WHERE objet LIKE ? ESCAPE '\\'", `element:${tableau}/`.length + 1, `element:${tableau.replace(/[\\%_]/g, (c) => `\\${c}`)}/%`) as unknown as {
          id: string
        }[]
      ).map((l) => l.id),
    relationsDeLEspace: (e) =>
      tous(
        `SELECT objet, relation, sujet FROM relations
         WHERE objet = ? OR objet LIKE ? ESCAPE '\\' OR objet IN (SELECT 'equipe:' || id FROM team WHERE organizationId = ?)`,
        `espace:${e}`,
        `role:${e.replace(/[\\%_]/g, (c) => `\\${c}`)}/%`,
        e,
      ) as unknown as Relation[],
    relationsOrphelines: () =>
      tous(
        `SELECT objet, relation, sujet FROM relations WHERE
           (objet LIKE 'equipe:%' AND substr(objet, 8) NOT IN (SELECT id FROM team))
        OR (sujet LIKE 'equipe:%#membre' AND substr(sujet, 8, length(sujet) - 14) NOT IN (SELECT id FROM team))
        OR (objet LIKE 'espace:%' AND substr(objet, 8) NOT IN (SELECT id FROM organization))
        OR (sujet LIKE 'espace:%' AND substr(sujet, 8) NOT IN (SELECT id FROM organization))
        OR (objet LIKE 'role:%' AND substr(objet, 6, instr(substr(objet, 6), '/') - 1) NOT IN (SELECT id FROM organization))
        OR (relation = 'espace' AND objet LIKE 'tableau:%'
            AND NOT EXISTS (SELECT 1 FROM tableaux t WHERE 'tableau:' || t.id = relations.objet AND 'espace:' || t.espace = relations.sujet))`,
      ) as unknown as Relation[],
    boiteEnvoi: (limite) => tous('SELECT id, objet, relation, sujet FROM boite_envoi ORDER BY id LIMIT ?', limite) as unknown as (Relation & { id: number })[],
    sortirDeBoite(lignes) {
      transaction(() => {
        for (const l of lignes) executer('DELETE FROM boite_envoi WHERE id = ?', l.id)
      })
    },
    remplirBoite: () => void executer('INSERT OR IGNORE INTO boite_envoi (objet, relation, sujet) SELECT objet, relation, sujet FROM relations'),
    reglage: (cle) => (un('SELECT valeur FROM reglages WHERE cle = ?', cle)?.valeur as string | undefined) ?? null,
    definirReglage: (cle, valeur) => void executer('INSERT INTO reglages (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur', cle, valeur),
    espacesASynchroniser: () => (tous('SELECT espace FROM espaces_a_synchroniser') as unknown as { espace: string }[]).map((l) => l.espace),
    espaceSynchronise: (e) => void executer('DELETE FROM espaces_a_synchroniser WHERE espace = ?', e),
    membresEspace: (e) => tous('SELECT userId AS utilisateur, role FROM member WHERE organizationId = ?', e) as unknown as { utilisateur: string; role: string }[],
    rolesComposes: (e) => tous('SELECT role, permission FROM organizationRole WHERE organizationId = ?', e) as unknown as { role: string; permission: string }[],
    equipesEspace: (e) =>
      (tous('SELECT id FROM team WHERE organizationId = ?', e) as unknown as { id: string }[]).map(({ id }) => ({
        id,
        membres: (tous('SELECT userId FROM teamMember WHERE teamId = ?', id) as unknown as { userId: string }[]).map((l) => l.userId),
      })),

    invitations: (tableau) => tous(`SELECT ${COLONNES_INVITATION} FROM invitations WHERE tableau = ? ORDER BY cree`, tableau).map((l) => invitation(l)!),
    invitationsPour: (email) => tous(`SELECT ${COLONNES_INVITATION} FROM invitations WHERE email = ?`, email).map((l) => invitation(l)!),
    definirInvitation: (i) =>
      void executer(
        `INSERT INTO invitations (tableau,email,role,jeton,cree,par,echeance) VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(tableau,email) DO UPDATE SET role = excluded.role, jeton = excluded.jeton, cree = excluded.cree, par = excluded.par, echeance = excluded.echeance`,
        i.tableau,
        i.email,
        i.role,
        i.jeton,
        i.cree,
        i.par,
        i.echeance,
      ),
    invitationDuJeton: (empreinte) => invitation(un(`SELECT ${COLONNES_INVITATION} FROM invitations WHERE jeton = ?`, empreinte)),
    modifierInvitation: (tableau, email, m) =>
      void executer('UPDATE invitations SET role = ?, echeance = ? WHERE tableau = ? AND email = ?', m.role, m.echeance, tableau, email),
    retirerInvitation: (tableau, email) => Number(executer('DELETE FROM invitations WHERE tableau = ? AND email = ?', tableau, email).changes) > 0,
    supprimerInvitationsPour: (email) => void executer('DELETE FROM invitations WHERE email = ?', email),
    emailVerifie: (u) => un('SELECT email_verifie FROM utilisateurs WHERE id = ?', u)?.email_verifie === 1,
    verifierEmail: (u) => void executer('UPDATE utilisateurs SET email_verifie = 1 WHERE id = ?', u),

    echeance: (tableau, sujet) => (un('SELECT expire FROM echeances WHERE tableau = ? AND sujet = ?', tableau, sujet)?.expire as number | undefined) ?? null,
    definirEcheance(tableau, sujet, expire) {
      if (expire === null) executer('DELETE FROM echeances WHERE tableau = ? AND sujet = ?', tableau, sujet)
      else executer('INSERT INTO echeances (tableau,sujet,expire) VALUES (?,?,?) ON CONFLICT(tableau,sujet) DO UPDATE SET expire = excluded.expire', tableau, sujet, expire)
    },
    echeanceAtteinte: (maintenant) => un('SELECT 1 AS ok FROM echeances WHERE expire <= ? LIMIT 1', maintenant) !== null,
    expirerAcces: (maintenant) =>
      transaction(() => {
        const passees = tous('SELECT tableau, sujet FROM echeances WHERE expire <= ?', maintenant) as unknown as { tableau: string; sujet: string }[]
        for (const p of passees) definirRoleDe(p.tableau, p.sujet, null)
        return [...new Set(passees.map((p) => p.tableau))]
      }),

    document(nom) {
      const l = un('SELECT etat FROM documents WHERE nom = ?', nom)
      return l ? duDisque(cle, l.etat as Uint8Array) : null
    },
    enregistrerDocument: (nom, etat) =>
      void executer(
        'INSERT INTO documents (nom,etat) VALUES (?,?) ON CONFLICT(nom) DO UPDATE SET etat = excluded.etat',
        nom,
        pourLeDisque(cle, etat),
      ),

    creerFichier: (f) => void executer('INSERT INTO fichiers (id,type,taille,auteur) VALUES (?,?,?,?)', f.id, f.type, f.taille, f.auteur),
    fichier: (id) => (un('SELECT * FROM fichiers WHERE id = ?', id) as Fichier | null),

    liensVisiteurs: (tableau) => tous('SELECT * FROM liens_visiteurs WHERE tableau = ? ORDER BY cree, id', tableau).map((l) => lienVisiteur(l)!),
    lienVisiteur: (id) => lienVisiteur(un('SELECT * FROM liens_visiteurs WHERE id = ?', id)),
    lienDuJeton: (jeton) => lienVisiteur(un('SELECT * FROM liens_visiteurs WHERE jeton = ?', jeton)),
    // Un lien visiteur est un sujet du modèle d'autorisation : `lien:<jeton>` a sur le tableau le rôle de son niveau.
    creerLienVisiteur: (l) =>
      transaction(() => {
        executer(
          'INSERT INTO liens_visiteurs (id,tableau,jeton,nom,niveau,cree,par,expire,mot_de_passe) VALUES (?,?,?,?,?,?,?,?,?)',
          l.id,
          l.tableau,
          l.jeton,
          l.nom,
          l.niveau,
          l.cree,
          l.par,
          l.expire,
          l.motDePasse,
        )
        definirRoleDe(l.tableau, `lien:${l.jeton}`, l.niveau)
      }),
    modifierLienVisiteur: (id, m) =>
      transaction(() => {
        const l = lienVisiteur(un('SELECT * FROM liens_visiteurs WHERE id = ?', id))
        if (!l) return
        if (m.nom !== undefined) executer('UPDATE liens_visiteurs SET nom = ? WHERE id = ?', m.nom, id)
        if (m.expire !== undefined) executer('UPDATE liens_visiteurs SET expire = ? WHERE id = ?', m.expire, id)
        if (m.niveau !== undefined) {
          executer('UPDATE liens_visiteurs SET niveau = ? WHERE id = ?', m.niveau, id)
          definirRoleDe(l.tableau, `lien:${l.jeton}`, m.niveau)
        }
      }),
    definirMotDePasseLien: (id, empreinte) =>
      transaction(() => {
        executer('UPDATE liens_visiteurs SET mot_de_passe = ? WHERE id = ?', empreinte, id)
        executer('DELETE FROM acces_liens WHERE lien = ?', id)
      }),
    retirerLienVisiteur: (id) =>
      transaction(() => {
        const l = lienVisiteur(un('SELECT * FROM liens_visiteurs WHERE id = ?', id))
        if (!l) return false
        definirRoleDe(l.tableau, `lien:${l.jeton}`, null)
        executer('DELETE FROM liens_visiteurs WHERE id = ?', id)
        return true
      }),
    noterVisite: (id, maintenant) => void executer('UPDATE liens_visiteurs SET derniere_visite = ? WHERE id = ?', maintenant, id),
    creerAccesLien(empreinte, lien, expire) {
      executer('DELETE FROM acces_liens WHERE expire < ?', expire - DUREE_ACCES_PUBLIC_MS)
      executer('INSERT INTO acces_liens (empreinte,lien,expire) VALUES (?,?,?)', empreinte, lien, expire)
    },
    accesLienValide: (empreinte, lien, maintenant) =>
      un('SELECT 1 AS ok FROM acces_liens WHERE empreinte = ? AND lien = ? AND expire >= ?', empreinte, lien, maintenant) !== null,
    equipe(id) {
      const l = un('SELECT id, name AS nom, organizationId AS espace FROM team WHERE id = ?', id)
      return l ? (l as unknown as { id: string; nom: string; espace: string }) : null
    },
    motDePasse: (tableau, portee) =>
      (un('SELECT empreinte FROM mots_de_passe WHERE tableau = ? AND portee = ?', tableau, portee)?.empreinte as string | undefined) ?? null,
    definirMotDePasse(tableau, portee, empreinte) {
      transaction(() => {
        executer(
          'INSERT INTO mots_de_passe (tableau,portee,empreinte) VALUES (?,?,?) ON CONFLICT(tableau,portee) DO UPDATE SET empreinte = excluded.empreinte',
          tableau,
          portee,
          empreinte,
        )
        oublierLeves(tableau, portee)
      })
    },
    retirerMotDePasse(tableau, portee) {
      return transaction(() => {
        const retire = Number(executer('DELETE FROM mots_de_passe WHERE tableau = ? AND portee = ?', tableau, portee).changes) > 0
        oublierLeves(tableau, portee)
        return retire
      })
    },
    aOuvert: (u, t) => un('SELECT 1 AS ok FROM ouvertures WHERE utilisateur = ? AND tableau = ?', u, t) !== null,
    noterOuverture: (u, t) => void executer('INSERT OR IGNORE INTO ouvertures (utilisateur,tableau) VALUES (?,?)', u, t),
    favoris: (u) =>
      (tous('SELECT tableau FROM favoris WHERE utilisateur = ? ORDER BY cree DESC, tableau', u) as unknown as { tableau: string }[]).map((l) => l.tableau),
    definirFavori: (u, t, maintenant) =>
      void executer('INSERT INTO favoris (utilisateur,tableau,cree) VALUES (?,?,?) ON CONFLICT(utilisateur,tableau) DO NOTHING', u, t, maintenant),
    retirerFavori: (u, t) => Number(executer('DELETE FROM favoris WHERE utilisateur = ? AND tableau = ?', u, t).changes) > 0,
    noterVu(u, t, maintenant) {
      executer('INSERT INTO recents (utilisateur,tableau,vu) VALUES (?,?,?) ON CONFLICT(utilisateur,tableau) DO UPDATE SET vu = excluded.vu', u, t, maintenant)
      executer(
        'DELETE FROM recents WHERE utilisateur = ? AND tableau NOT IN (SELECT tableau FROM recents WHERE utilisateur = ? ORDER BY vu DESC LIMIT ?)',
        u,
        u,
        RECENTS_GARDES,
      )
    },
    recents: (u, limite) =>
      (tous('SELECT tableau FROM recents WHERE utilisateur = ? ORDER BY vu DESC, tableau LIMIT ?', u, limite) as unknown as { tableau: string }[]).map(
        (l) => l.tableau,
      ),
    noterElementVu(u, t, e, maintenant) {
      executer(
        'INSERT INTO elements_vus (utilisateur,tableau,element,vu) VALUES (?,?,?,?) ON CONFLICT(utilisateur,tableau,element) DO UPDATE SET vu = excluded.vu',
        u,
        t,
        e,
        maintenant,
      )
      executer(
        `DELETE FROM elements_vus WHERE utilisateur = ? AND (tableau, element) NOT IN (
           SELECT tableau, element FROM elements_vus WHERE utilisateur = ? ORDER BY vu DESC LIMIT ?)`,
        u,
        u,
        ELEMENTS_VUS_GARDES,
      )
    },
    vus: (u) =>
      tous(
        `SELECT tableau, '' AS element, vu FROM recents WHERE utilisateur = ?
         UNION ALL SELECT tableau, element, vu FROM elements_vus WHERE utilisateur = ? ORDER BY vu DESC`,
        u,
        u,
      ) as unknown as { tableau: string; element: string; vu: number }[],
    contenus: (tableaux) =>
      tous(
        'SELECT tableau, element, genre, titre, resume FROM contenus WHERE tableau IN (SELECT value FROM json_each(?))',
        JSON.stringify(tableaux),
      ) as unknown as LigneContenu[],
    indexer(tableau, entrees, fichiers, contenus) {
      const faire = () => {
        executer('DELETE FROM recherche WHERE tableau = ?', tableau)
        for (const e of entrees) executer('INSERT INTO recherche (tableau,element,texte) VALUES (?,?,?)', tableau, e.element, e.texte)
        if (contenus) {
          executer('DELETE FROM contenus WHERE tableau = ?', tableau)
          // Un document dont le tableau n'existe plus (ou pas encore) ne laisse rien.
          for (const c of contenus)
            executer(
              'INSERT INTO contenus (tableau,element,genre,titre,resume) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM tableaux WHERE id = ?)',
              tableau,
              c.element,
              c.genre,
              c.titre,
              JSON.stringify(c),
              tableau,
            )
        }
        if (fichiers) {
          executer('DELETE FROM fichiers_tableaux WHERE tableau = ?', tableau)
          for (const f of fichiers) executer('INSERT OR IGNORE INTO fichiers_tableaux (fichier, tableau) VALUES (?, ?)', f, tableau)
        }
        executer('INSERT OR IGNORE INTO recherche_etat (tableau) VALUES (?)', tableau)
      }
      // Déjà dans une transaction (le magasin en ouvre une autour de certains gestes) : on s'y joint.
      if (db.isTransaction) faire()
      else transaction(faire)
    },
    estPhoto: (f) => un('SELECT 1 AS ok FROM utilisateurs WHERE photo = ?', f) !== null,
    tableauxDuFichier: (f) => (tous('SELECT tableau FROM fichiers_tableaux WHERE fichier = ?', f) as unknown as { tableau: string }[]).map((l) => l.tableau),
    tableauxNonIndexes: () =>
      (
        tous("SELECT substr(nom, 9) AS tableau FROM documents WHERE nom LIKE 'tableau:%' AND substr(nom, 9) NOT IN (SELECT tableau FROM recherche_etat)") as unknown as {
          tableau: string
        }[]
      ).map((l) => l.tableau),
    chercher: (requete, tableaux, limite) =>
      tous(
        `SELECT tableau, element, snippet(recherche, 2, '', '', '…', 14) AS extrait FROM recherche
         WHERE recherche MATCH ? AND tableau IN (SELECT value FROM json_each(?)) ORDER BY rank LIMIT ?`,
        requete,
        JSON.stringify(tableaux),
        limite,
      ) as unknown as Trouve[],
    noterActivite(a, fenetre) {
      const renouvelle = executer(
        `UPDATE activite SET instant = ?, libelle = ? WHERE id = (
           SELECT id FROM activite WHERE tableau = ? AND auteur = ? AND element = ? AND genre = ? AND instant >= ? ORDER BY id DESC LIMIT 1)`,
        a.instant,
        a.libelle,
        a.tableau,
        a.auteur,
        a.element,
        a.genre,
        a.instant - fenetre,
      )
      if (Number(renouvelle.changes) > 0) return
      executer(
        'INSERT INTO activite (tableau,auteur,genre,element,type_element,libelle,instant) VALUES (?,?,?,?,?,?,?)',
        a.tableau,
        a.auteur,
        a.genre,
        a.element,
        a.typeElement,
        a.libelle,
        a.instant,
      )
      executer(
        'DELETE FROM activite WHERE tableau = ? AND id <= (SELECT id FROM activite WHERE tableau = ? ORDER BY id DESC LIMIT 1 OFFSET ?)',
        a.tableau,
        a.tableau,
        ACTIVITE_GARDEE,
      )
    },
    activite: (tableau, limite, apres = 0) =>
      (
        tous(
          `SELECT a.id, a.tableau, a.genre, a.element, a.type_element AS typeElement, a.libelle, a.instant,
                  u.id AS auteurId, u.nom AS auteurNom, u.couleur AS auteurCouleur
           FROM activite a JOIN utilisateurs u ON u.id = a.auteur
           WHERE a.tableau = ? AND a.id > ? ORDER BY a.id DESC LIMIT ?`,
          tableau,
          apres,
          limite,
        ) as unknown as (Omit<LigneActivite, 'auteur'> & { auteurId: string; auteurNom: string; auteurCouleur: string })[]
      ).map(({ auteurId, auteurNom, auteurCouleur, ...reste }) => ({ ...reste, auteur: { id: auteurId, nom: auteurNom, couleur: auteurCouleur } })),

    noterNotification(n, fusionner) {
      if (fusionner !== undefined) {
        const renouvelle = executer(
          `UPDATE notifications SET instant = ?, extrait = ?, element = ? WHERE id = (
             SELECT id FROM notifications
             WHERE destinataire = ? AND genre = ? AND tableau = ? AND auteur = ? AND lu = 0 AND instant >= ? ORDER BY id DESC LIMIT 1)`,
          n.instant,
          n.extrait,
          n.element,
          n.destinataire,
          n.genre,
          n.tableau,
          n.auteur,
          n.instant - fusionner,
        )
        if (Number(renouvelle.changes) > 0) return
      }
      executer(
        'INSERT INTO notifications (destinataire,genre,tableau,element,auteur,extrait,instant) VALUES (?,?,?,?,?,?,?)',
        n.destinataire,
        n.genre,
        n.tableau,
        n.element,
        n.auteur,
        n.extrait,
        n.instant,
      )
      executer(
        'DELETE FROM notifications WHERE destinataire = ? AND id <= (SELECT id FROM notifications WHERE destinataire = ? ORDER BY id DESC LIMIT 1 OFFSET ?)',
        n.destinataire,
        n.destinataire,
        NOTIFICATIONS_GARDEES,
      )
    },
    notifications: (destinataire, limite) =>
      (
        tous(
          `SELECT n.id, n.genre, n.tableau, n.element, n.extrait, n.instant, n.lu,
                  u.id AS auteurId, u.nom AS auteurNom, u.couleur AS auteurCouleur
           FROM notifications n JOIN utilisateurs u ON u.id = n.auteur
           WHERE n.destinataire = ? ORDER BY n.id DESC LIMIT ?`,
          destinataire,
          limite,
        ) as unknown as (Omit<LigneNotification, 'auteur' | 'lu'> & { lu: number; auteurId: string; auteurNom: string; auteurCouleur: string })[]
      ).map(({ auteurId, auteurNom, auteurCouleur, lu, ...reste }) => ({
        ...reste,
        lu: lu === 1,
        auteur: { id: auteurId, nom: auteurNom, couleur: auteurCouleur },
      })),
    nonLues: (destinataire) =>
      Number(un('SELECT COUNT(*) AS n FROM notifications WHERE destinataire = ? AND lu = 0', destinataire)?.n ?? 0),
    marquerLues(destinataire, ids) {
      if (ids === null) return Number(executer('UPDATE notifications SET lu = 1 WHERE destinataire = ? AND lu = 0', destinataire).changes)
      return Number(
        executer(
          'UPDATE notifications SET lu = 1 WHERE destinataire = ? AND lu = 0 AND id IN (SELECT value FROM json_each(?))',
          destinataire,
          JSON.stringify(ids),
        ).changes,
      )
    },
  }
}
