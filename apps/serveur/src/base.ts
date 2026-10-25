import { DatabaseSync } from 'node:sqlite'
import { type Acces, RELATION_DU_ROLE, ROLES, type Role, roleDeRelation } from './droits.ts'
import { migrer } from './migrations.ts'

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
}

export interface Fichier {
  id: string
  type: string
  taille: number
  auteur: string
}

/** Ce que protège un mot de passe : l'ouverture du tableau (`tableau`), ou la lecture par son lien public (`public`). */
export type Portee = 'tableau' | 'public'
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
  definirInvitation(i: Invitation): void
  retirerInvitation(tableau: string, email: string): boolean
  supprimerInvitationsPour(email: string): void

  document(nom: string): Uint8Array | null
  enregistrerDocument(nom: string, etat: Uint8Array): void

  creerFichier(f: Fichier): void
  fichier(id: string): Fichier | null

  /** Le jeton du lien public du tableau, ou `null` s'il n'est pas publié. */
  jetonPublic(tableau: string): string | null
  definirJetonPublic(tableau: string, jeton: string, maintenant: number): void
  /** Ce que permet le lien public du tableau : lire, commenter ou modifier. */
  niveauPublic(tableau: string): 'lecture' | 'commentaire' | 'edition' | null
  definirNiveauPublic(tableau: string, niveau: 'lecture' | 'commentaire' | 'edition'): void
  /** Une équipe, et l'espace où elle vit. */
  equipe(id: string): { id: string; nom: string; espace: string } | null
  retirerJetonPublic(tableau: string): boolean
  tableauDuJeton(jeton: string): string | null

  /** L'empreinte du mot de passe de ce tableau pour cette portée, ou `null` s'il n'en a pas. */
  motDePasse(tableau: string, portee: Portee): string | null
  /**
   * Pose (ou change) le mot de passe. Tout ce qui l'avait levé retombe : les comptes qui avaient ouvert le tableau
   * (`tableau`), ou les lecteurs du lien public (`public`) doivent le redonner.
   */
  definirMotDePasse(tableau: string, portee: Portee, empreinte: string): void
  /** Retire le mot de passe ; rend faux s'il n'y en avait pas. */
  retirerMotDePasse(tableau: string, portee: Portee): boolean
  /** Ce compte a-t-il donné le mot de passe de ce tableau ? */
  aOuvert(utilisateur: string, tableau: string): boolean
  noterOuverture(utilisateur: string, tableau: string): void
  /** Un accès à la lecture publique, donné contre le mot de passe du lien : seule l'empreinte du jeton est gardée. */
  creerAccesPublic(empreinte: string, tableau: string, expire: number): void
  accesPublicValide(empreinte: string, tableau: string, maintenant: number): boolean

  /** Les tableaux favoris d'un compte, le dernier ajouté d'abord. */
  favoris(utilisateur: string): string[]
  definirFavori(utilisateur: string, tableau: string, maintenant: number): void
  retirerFavori(utilisateur: string, tableau: string): boolean
  /** Note l'ouverture d'un tableau ; seuls les plus récents sont gardés. */
  noterVu(utilisateur: string, tableau: string, maintenant: number): void
  /** Les tableaux ouverts en dernier par un compte, le plus récent d'abord. */
  recents(utilisateur: string, limite: number): string[]

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
  indexer(tableau: string, entrees: readonly EntreeIndex[], fichiers?: readonly string[]): void
  /** Les tableaux qui montrent ce fichier. */
  tableauxDuFichier(fichier: string): string[]
  /** Ce fichier est la photo d'un compte. */
  estPhoto(fichier: string): boolean
  /** Les tableaux dont le document est enregistré mais que l'index n'a jamais vus. */
  tableauxNonIndexes(): string[]
  /** Les meilleures correspondances dans ces tableaux ; `requete` est une expression FTS5 (voir `requeteIndex`). */
  chercher(requete: string, tableaux: readonly string[], limite: number): Trouve[]
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

/** Combien de temps un accès public, donné contre le mot de passe du lien, reste valable. */
export const DUREE_ACCES_PUBLIC_MS = 24 * 3600 * 1000

/** Combien de tableaux récents on garde par compte. */
export const RECENTS_GARDES = 50
/** Combien de gestes on garde par tableau, et de notifications par compte. */
export const ACTIVITE_GARDEE = 500
export const NOTIFICATIONS_GARDEES = 200


type Ligne = Record<string, unknown>

export function ouvrirBase(chemin: string): Base {
  const db = new DatabaseSync(chemin)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  migrer(db, chemin === ':memory:' ? undefined : (version) => `${chemin}.avant-${version}`)

  const tous = (sql: string, ...params: (string | number | Uint8Array)[]): Ligne[] =>
    db.prepare(sql).all(...params) as Ligne[]
  const un = (sql: string, ...params: (string | number | Uint8Array)[]): Ligne | null =>
    (db.prepare(sql).get(...params) as Ligne | undefined) ?? null
  const executer = (sql: string, ...params: (string | number | Uint8Array | null)[]) => db.prepare(sql).run(...params)

  /** Un mot de passe change ou disparaît : ce qui l'avait levé ne vaut plus. */
  const oublierLeves = (tableau: string, portee: Portee) => {
    if (portee === 'tableau') executer('DELETE FROM ouvertures WHERE tableau = ?', tableau)
    else executer('DELETE FROM acces_publics WHERE tableau = ?', tableau)
  }

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
  /** Un sujet n'a qu'un rôle direct sur un tableau : le nouveau remplace l'ancien. */
  const definirRoleDe = (tableau: string, sujet: string, role: Role | null) =>
    transaction(() => {
      for (const r of ROLES) {
        const relation = { objet: `tableau:${tableau}`, relation: RELATION_DU_ROLE[r], sujet }
        if (r === role) ajouterRelation(relation)
        else retirerRelation(relation)
      }
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

    invitations: (tableau) => tous('SELECT tableau, email, role FROM invitations WHERE tableau = ?', tableau) as unknown as Invitation[],
    invitationsPour: (email) => tous('SELECT tableau, email, role FROM invitations WHERE email = ?', email) as unknown as Invitation[],
    definirInvitation: (i) =>
      void executer(
        'INSERT INTO invitations (tableau,email,role) VALUES (?,?,?) ON CONFLICT(tableau,email) DO UPDATE SET role = excluded.role',
        i.tableau,
        i.email,
        i.role,
      ),
    retirerInvitation: (tableau, email) => Number(executer('DELETE FROM invitations WHERE tableau = ? AND email = ?', tableau, email).changes) > 0,
    supprimerInvitationsPour: (email) => void executer('DELETE FROM invitations WHERE email = ?', email),

    document(nom) {
      const l = un('SELECT etat FROM documents WHERE nom = ?', nom)
      return l ? (l.etat as Uint8Array) : null
    },
    enregistrerDocument: (nom, etat) =>
      void executer('INSERT INTO documents (nom,etat) VALUES (?,?) ON CONFLICT(nom) DO UPDATE SET etat = excluded.etat', nom, etat),

    creerFichier: (f) => void executer('INSERT INTO fichiers (id,type,taille,auteur) VALUES (?,?,?,?)', f.id, f.type, f.taille, f.auteur),
    fichier: (id) => (un('SELECT * FROM fichiers WHERE id = ?', id) as Fichier | null),

    jetonPublic: (tableau) => (un('SELECT jeton FROM liens_publics WHERE tableau = ?', tableau)?.jeton as string | undefined) ?? null,
    // Le lien public est un sujet du modèle d'autorisation : `lien:<jeton>` a sur le tableau le rôle de son niveau.
    definirJetonPublic: (tableau, jeton, maintenant) =>
      transaction(() => {
        const ancien = un('SELECT jeton FROM liens_publics WHERE tableau = ?', tableau)?.jeton as string | undefined
        if (ancien) definirRoleDe(tableau, `lien:${ancien}`, null)
        executer(
          "INSERT INTO liens_publics (tableau,jeton,cree,niveau) VALUES (?,?,?,'lecture') ON CONFLICT(tableau) DO UPDATE SET jeton = excluded.jeton, cree = excluded.cree, niveau = 'lecture'",
          tableau,
          jeton,
          maintenant,
        )
        definirRoleDe(tableau, `lien:${jeton}`, 'lecture')
      }),
    retirerJetonPublic: (tableau) =>
      transaction(() => {
        const jeton = un('SELECT jeton FROM liens_publics WHERE tableau = ?', tableau)?.jeton as string | undefined
        if (!jeton) return false
        definirRoleDe(tableau, `lien:${jeton}`, null)
        executer('DELETE FROM liens_publics WHERE tableau = ?', tableau)
        return true
      }),
    niveauPublic: (tableau) => (un('SELECT niveau FROM liens_publics WHERE tableau = ?', tableau)?.niveau as 'lecture' | 'commentaire' | 'edition' | undefined) ?? null,
    definirNiveauPublic: (tableau, niveau) =>
      transaction(() => {
        const jeton = un('SELECT jeton FROM liens_publics WHERE tableau = ?', tableau)?.jeton as string | undefined
        if (!jeton) return
        executer('UPDATE liens_publics SET niveau = ? WHERE tableau = ?', niveau, tableau)
        definirRoleDe(tableau, `lien:${jeton}`, niveau)
      }),
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
    creerAccesPublic(empreinte, tableau, expire) {
      executer('DELETE FROM acces_publics WHERE expire < ?', expire - DUREE_ACCES_PUBLIC_MS)
      executer('INSERT INTO acces_publics (empreinte,tableau,expire) VALUES (?,?,?)', empreinte, tableau, expire)
    },
    accesPublicValide: (empreinte, tableau, maintenant) =>
      un('SELECT 1 AS ok FROM acces_publics WHERE empreinte = ? AND tableau = ? AND expire >= ?', empreinte, tableau, maintenant) !== null,
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
    indexer(tableau, entrees, fichiers) {
      const faire = () => {
        executer('DELETE FROM recherche WHERE tableau = ?', tableau)
        for (const e of entrees) executer('INSERT INTO recherche (tableau,element,texte) VALUES (?,?,?)', tableau, e.element, e.texte)
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
    tableauDuJeton: (jeton) => (un('SELECT tableau FROM liens_publics WHERE jeton = ?', jeton)?.tableau as string | undefined) ?? null,
  }
}
