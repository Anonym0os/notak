import { DatabaseSync } from 'node:sqlite'
import type { Acces, Role } from './droits.ts'

// Tout le SQL du serveur vit ici : passer à Postgres, c'est réécrire ce fichier.

export interface Utilisateur {
  id: string
  email: string
  nom: string
  hash: string
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
  /** Exécute `travail` dans une transaction : annulée si elle lève. */
  transaction<T>(travail: () => T): T
  fermer(): void

  creerUtilisateur(u: Utilisateur): void
  utilisateurParEmail(email: string): Utilisateur | null
  utilisateurParId(id: string): Utilisateur | null
  /** Change la couleur et/ou la photo du compte (`null` retire la photo) ; ce qui manque ne bouge pas. */
  reglerCompte(id: string, reglages: { couleur?: string; photo?: string | null }): void

  creerSession(empreinte: string, utilisateur: string, expire: number): void
  utilisateurDeSession(empreinte: string, maintenant: number): Utilisateur | null
  supprimerSession(empreinte: string): void

  /** Crée un jeton d'arrivée. Seule l'empreinte (SHA-256 du jeton) est gardée. */
  creerJetonArrivee(j: { id: string; utilisateur: string; nom: string; empreinte: string; cree: number }): void
  jetonsArrivee(utilisateur: string): JetonArrivee[]
  /** Révoque un jeton du compte ; rend faux s'il n'y en avait pas. */
  retirerJetonArrivee(utilisateur: string, id: string): boolean
  /** Le compte à qui appartient ce jeton (par empreinte), et note qu'il vient de servir. */
  utilisateurDuJetonArrivee(empreinte: string, maintenant: number): Utilisateur | null

  tableau(id: string): LigneTableau | null
  creerTableau(t: LigneTableau): void
  changerTitre(id: string, titre: string): void
  /** Tous les tableaux placés sous celui-ci, à toute profondeur. */
  descendants(id: string): string[]

  acces(tableau: string): Acces[]
  tableauxAccessibles(utilisateur: string): { id: string; titre: string; role: Role }[]
  definirAcces(a: Acces): void
  retirerAcces(tableau: string, utilisateur: string): void

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

  /** Remplace tout ce qu'on sait chercher dans ce tableau. `element` vide : le titre du tableau. */
  indexer(tableau: string, entrees: readonly EntreeIndex[]): void
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

const SCHEMA = `
CREATE TABLE IF NOT EXISTS utilisateurs (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, nom TEXT NOT NULL,
  hash TEXT NOT NULL, couleur TEXT NOT NULL, racine TEXT NOT NULL, photo TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  empreinte TEXT PRIMARY KEY, utilisateur TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  expire INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS tableaux (
  id TEXT PRIMARY KEY, titre TEXT NOT NULL, proprietaire TEXT NOT NULL REFERENCES utilisateurs(id),
  parent TEXT
);
CREATE TABLE IF NOT EXISTS acces (
  tableau TEXT NOT NULL REFERENCES tableaux(id) ON DELETE CASCADE,
  utilisateur TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('lecture','edition','proprietaire')),
  PRIMARY KEY (tableau, utilisateur)
);
CREATE INDEX IF NOT EXISTS acces_utilisateur ON acces(utilisateur);
CREATE TABLE IF NOT EXISTS invitations (
  tableau TEXT NOT NULL REFERENCES tableaux(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('lecture','edition','proprietaire')),
  PRIMARY KEY (tableau, email)
);
CREATE INDEX IF NOT EXISTS invitations_email ON invitations(email);
CREATE TABLE IF NOT EXISTS documents (nom TEXT PRIMARY KEY, etat BLOB NOT NULL);
CREATE TABLE IF NOT EXISTS fichiers (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, taille INTEGER NOT NULL,
  auteur TEXT NOT NULL REFERENCES utilisateurs(id)
);
CREATE TABLE IF NOT EXISTS favoris (
  utilisateur TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  tableau TEXT NOT NULL REFERENCES tableaux(id) ON DELETE CASCADE,
  cree INTEGER NOT NULL,
  PRIMARY KEY (utilisateur, tableau)
);
CREATE TABLE IF NOT EXISTS recents (
  utilisateur TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  tableau TEXT NOT NULL REFERENCES tableaux(id) ON DELETE CASCADE,
  vu INTEGER NOT NULL,
  PRIMARY KEY (utilisateur, tableau)
);
CREATE INDEX IF NOT EXISTS recents_vu ON recents(utilisateur, vu DESC);
CREATE TABLE IF NOT EXISTS mots_de_passe (
  tableau TEXT NOT NULL REFERENCES tableaux(id) ON DELETE CASCADE,
  portee TEXT NOT NULL CHECK (portee IN ('tableau','public')),
  empreinte TEXT NOT NULL,
  PRIMARY KEY (tableau, portee)
);
CREATE TABLE IF NOT EXISTS ouvertures (
  utilisateur TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  tableau TEXT NOT NULL REFERENCES tableaux(id) ON DELETE CASCADE,
  PRIMARY KEY (utilisateur, tableau)
);
CREATE TABLE IF NOT EXISTS acces_publics (
  empreinte TEXT PRIMARY KEY, tableau TEXT NOT NULL REFERENCES tableaux(id) ON DELETE CASCADE, expire INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS jetons_arrivee (
  id TEXT PRIMARY KEY, utilisateur TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  nom TEXT NOT NULL, empreinte TEXT NOT NULL UNIQUE, cree INTEGER NOT NULL, dernier_usage INTEGER
);
CREATE INDEX IF NOT EXISTS jetons_arrivee_utilisateur ON jetons_arrivee(utilisateur, cree);
CREATE VIRTUAL TABLE IF NOT EXISTS recherche USING fts5(
  tableau UNINDEXED, element UNINDEXED, texte, tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TABLE IF NOT EXISTS recherche_etat (tableau TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS activite (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tableau TEXT NOT NULL REFERENCES tableaux(id) ON DELETE CASCADE,
  auteur TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  genre TEXT NOT NULL, element TEXT NOT NULL, type_element TEXT NOT NULL, libelle TEXT NOT NULL,
  instant INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS activite_tableau ON activite(tableau, id DESC);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  destinataire TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  genre TEXT NOT NULL,
  tableau TEXT NOT NULL REFERENCES tableaux(id) ON DELETE CASCADE,
  element TEXT NOT NULL,
  auteur TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  extrait TEXT NOT NULL, instant INTEGER NOT NULL, lu INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS notifications_destinataire ON notifications(destinataire, id DESC);
CREATE TABLE IF NOT EXISTS liens_publics (
  tableau TEXT PRIMARY KEY REFERENCES tableaux(id) ON DELETE CASCADE,
  jeton TEXT NOT NULL UNIQUE, cree INTEGER NOT NULL
);
`

type Ligne = Record<string, unknown>

export function ouvrirBase(chemin: string): Base {
  const db = new DatabaseSync(chemin)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  db.exec(SCHEMA)
  // Une base d'avant la photo : la colonne s'ajoute, les comptes existants n'en ont pas.
  if (!(db.prepare('PRAGMA table_info(utilisateurs)').all() as { name: string }[]).some((c) => c.name === 'photo')) {
    db.exec('ALTER TABLE utilisateurs ADD COLUMN photo TEXT')
  }

  const tous = (sql: string, ...params: (string | number | Uint8Array)[]): Ligne[] =>
    db.prepare(sql).all(...params) as Ligne[]
  const un = (sql: string, ...params: (string | number | Uint8Array)[]): Ligne | null =>
    (db.prepare(sql).get(...params) as Ligne | undefined) ?? null
  const executer = (sql: string, ...params: (string | number | Uint8Array | null)[]) => db.prepare(sql).run(...params)

  const dansTransaction = <T>(travail: () => T): T => (db.isTransaction ? travail() : transaction(travail))

  /** Un mot de passe change ou disparaît : ce qui l'avait levé ne vaut plus. */
  const oublierLeves = (tableau: string, portee: Portee) => {
    if (portee === 'tableau') executer('DELETE FROM ouvertures WHERE tableau = ?', tableau)
    else executer('DELETE FROM acces_publics WHERE tableau = ?', tableau)
  }

  const utilisateur = (l: Ligne | null): Utilisateur | null => (l ? (l as unknown as Utilisateur) : null)

  const transaction = <T>(travail: () => T): T => {
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

  return {
    transaction,
    fermer: () => db.close(),

    creerUtilisateur: (u) =>
      void executer('INSERT INTO utilisateurs (id,email,nom,hash,couleur,racine,photo) VALUES (?,?,?,?,?,?,?)', u.id, u.email, u.nom, u.hash, u.couleur, u.racine, u.photo ?? null),
    utilisateurParEmail: (email) => utilisateur(un('SELECT * FROM utilisateurs WHERE email = ?', email)),
    utilisateurParId: (id) => utilisateur(un('SELECT * FROM utilisateurs WHERE id = ?', id)),
    reglerCompte(id, r) {
      if (r.couleur !== undefined) executer('UPDATE utilisateurs SET couleur = ? WHERE id = ?', r.couleur, id)
      if (r.photo !== undefined) executer('UPDATE utilisateurs SET photo = ? WHERE id = ?', r.photo, id)
    },

    creerSession: (empreinte, u, expire) => void executer('INSERT INTO sessions (empreinte,utilisateur,expire) VALUES (?,?,?)', empreinte, u, expire),
    utilisateurDeSession(empreinte, maintenant) {
      executer('DELETE FROM sessions WHERE expire < ?', maintenant)
      return utilisateur(
        un('SELECT u.* FROM sessions s JOIN utilisateurs u ON u.id = s.utilisateur WHERE s.empreinte = ? AND s.expire >= ?', empreinte, maintenant),
      )
    },
    supprimerSession: (empreinte) => void executer('DELETE FROM sessions WHERE empreinte = ?', empreinte),

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
    creerTableau: (t) => void executer('INSERT INTO tableaux (id,titre,proprietaire,parent) VALUES (?,?,?,?)', t.id, t.titre, t.proprietaire, t.parent),
    changerTitre: (id, titre) => void executer('UPDATE tableaux SET titre = ? WHERE id = ?', titre, id),

    acces: (tableau) => tous('SELECT tableau, utilisateur, role FROM acces WHERE tableau = ?', tableau) as unknown as Acces[],
    descendants: (id) =>
      (
        tous(
          'WITH RECURSIVE d(id) AS (SELECT id FROM tableaux WHERE parent = ? UNION SELECT t.id FROM tableaux t JOIN d ON t.parent = d.id) SELECT id FROM d',
          id,
        ) as unknown as { id: string }[]
      ).map((l) => l.id),
    tableauxAccessibles: (u) =>
      tous('SELECT t.id, t.titre, a.role FROM acces a JOIN tableaux t ON t.id = a.tableau WHERE a.utilisateur = ?', u) as unknown as {
        id: string
        titre: string
        role: Role
      }[],
    definirAcces: (a) =>
      void executer(
        'INSERT INTO acces (tableau,utilisateur,role) VALUES (?,?,?) ON CONFLICT(tableau,utilisateur) DO UPDATE SET role = excluded.role',
        a.tableau,
        a.utilisateur,
        a.role,
      ),
    retirerAcces: (tableau, u) => void executer('DELETE FROM acces WHERE tableau = ? AND utilisateur = ?', tableau, u),

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
    definirJetonPublic: (tableau, jeton, maintenant) =>
      void executer(
        'INSERT INTO liens_publics (tableau,jeton,cree) VALUES (?,?,?) ON CONFLICT(tableau) DO UPDATE SET jeton = excluded.jeton, cree = excluded.cree',
        tableau,
        jeton,
        maintenant,
      ),
    retirerJetonPublic: (tableau) => Number(executer('DELETE FROM liens_publics WHERE tableau = ?', tableau).changes) > 0,
    motDePasse: (tableau, portee) =>
      (un('SELECT empreinte FROM mots_de_passe WHERE tableau = ? AND portee = ?', tableau, portee)?.empreinte as string | undefined) ?? null,
    definirMotDePasse(tableau, portee, empreinte) {
      dansTransaction(() => {
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
      return dansTransaction(() => {
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
    indexer(tableau, entrees) {
      const faire = () => {
        executer('DELETE FROM recherche WHERE tableau = ?', tableau)
        for (const e of entrees) executer('INSERT INTO recherche (tableau,element,texte) VALUES (?,?,?)', tableau, e.element, e.texte)
        executer('INSERT OR IGNORE INTO recherche_etat (tableau) VALUES (?)', tableau)
      }
      // Déjà dans une transaction (le magasin en ouvre une autour de certains gestes) : on s'y joint.
      if (db.isTransaction) faire()
      else transaction(faire)
    },
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
