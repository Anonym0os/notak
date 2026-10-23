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

  /** Les tableaux favoris d'un compte, le dernier ajouté d'abord. */
  favoris(utilisateur: string): string[]
  definirFavori(utilisateur: string, tableau: string, maintenant: number): void
  retirerFavori(utilisateur: string, tableau: string): boolean
  /** Note l'ouverture d'un tableau ; seuls les plus récents sont gardés. */
  noterVu(utilisateur: string, tableau: string, maintenant: number): void
  /** Les tableaux ouverts en dernier par un compte, le plus récent d'abord. */
  recents(utilisateur: string, limite: number): string[]

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

/** Combien de tableaux récents on garde par compte. */
export const RECENTS_GARDES = 50

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
CREATE VIRTUAL TABLE IF NOT EXISTS recherche USING fts5(
  tableau UNINDEXED, element UNINDEXED, texte, tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TABLE IF NOT EXISTS recherche_etat (tableau TEXT PRIMARY KEY);
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
    tableauDuJeton: (jeton) => (un('SELECT tableau FROM liens_publics WHERE jeton = ?', jeton)?.tableau as string | undefined) ?? null,
  }
}
