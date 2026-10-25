import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import type { DatabaseSync } from 'node:sqlite'

// Le schéma de la base, migration par migration. La base retient la dernière appliquée dans `PRAGMA user_version` ;
// à l'ouverture, celles qui manquent passent dans l'ordre, chacune dans sa transaction. Une migration publiée ne se
// réécrit plus : on en ajoute une.

export interface Migration {
  version: number
  nom: string
  appliquer(db: DatabaseSync): void
}

const colonnes = (db: DatabaseSync, table: string) =>
  new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name))

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    nom: 'schéma initial',
    // Écrite pour passer aussi sur une base d'avant les migrations : tout y est « si absent ».
    appliquer(db) {
      db.exec(`
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
`)
      // Une base d'avant la photo : la colonne s'ajoute, les comptes existants n'en ont pas.
      if (!colonnes(db, 'utilisateurs').has('photo')) db.exec('ALTER TABLE utilisateurs ADD COLUMN photo TEXT')
    },
  },
  {
    version: 2,
    nom: 'comptes par Better Auth',
    // Les tables et colonnes qu'attend Better Auth (`auth.ts`) ; `migrations.test.ts` vérifie qu'il n'en réclame pas
    // d'autres. Les mots de passe passent dans `account`, tels quels : ce sont les mêmes empreintes Argon2. Les
    // anciennes sessions ne se reprennent pas (on n'en a que l'empreinte) : chacun se reconnecte une fois.
    appliquer(db) {
      db.exec(`
ALTER TABLE utilisateurs ADD COLUMN email_verifie INTEGER NOT NULL DEFAULT 0;
ALTER TABLE utilisateurs ADD COLUMN image TEXT;
ALTER TABLE utilisateurs ADD COLUMN cree DATE NOT NULL DEFAULT '';
ALTER TABLE utilisateurs ADD COLUMN modifie DATE NOT NULL DEFAULT '';
CREATE TABLE session (
  id TEXT NOT NULL PRIMARY KEY, expiresAt DATE NOT NULL, token TEXT NOT NULL UNIQUE,
  createdAt DATE NOT NULL, updatedAt DATE NOT NULL, ipAddress TEXT, userAgent TEXT,
  userId TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE
);
CREATE INDEX session_userId_idx ON session(userId);
CREATE TABLE account (
  id TEXT NOT NULL PRIMARY KEY, accountId TEXT NOT NULL, providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  accessToken TEXT, refreshToken TEXT, idToken TEXT, accessTokenExpiresAt DATE, refreshTokenExpiresAt DATE,
  scope TEXT, password TEXT, createdAt DATE NOT NULL, updatedAt DATE NOT NULL
);
CREATE INDEX account_userId_idx ON account(userId);
CREATE TABLE verification (
  id TEXT NOT NULL PRIMARY KEY, identifier TEXT NOT NULL, value TEXT NOT NULL,
  expiresAt DATE NOT NULL, createdAt DATE NOT NULL, updatedAt DATE NOT NULL
);
CREATE INDEX verification_identifier_idx ON verification(identifier);
`)
      const maintenant = new Date().toISOString()
      // Un compte d'avant avait vérifié son adresse autant qu'on pouvait le faire : on ne la lui redemande pas.
      db.prepare('UPDATE utilisateurs SET email_verifie = 1, cree = ?, modifie = ?').run(maintenant, maintenant)
      db.prepare(
        `INSERT INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt)
         SELECT lower(hex(randomblob(16))), id, 'credential', id, hash, ?, ? FROM utilisateurs`,
      ).run(maintenant, maintenant)
      db.exec('ALTER TABLE utilisateurs DROP COLUMN hash; DROP TABLE sessions;')
    },
  },
  {
    version: 3,
    nom: 'espaces et SSO',
    // Les tables des plugins `organization` (équipes et rôles composés compris) et `sso` de Better Auth. Chaque compte
    // reçoit son espace personnel, dont il est propriétaire, et ses tableaux y entrent.
    appliquer(db) {
      db.exec(`
ALTER TABLE session ADD COLUMN activeOrganizationId TEXT;
ALTER TABLE session ADD COLUMN activeTeamId TEXT;
CREATE TABLE organization (
  id TEXT NOT NULL PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, logo TEXT, createdAt DATE NOT NULL, metadata TEXT
);
CREATE TABLE organizationRole (
  id TEXT NOT NULL PRIMARY KEY, organizationId TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  role TEXT NOT NULL, permission TEXT NOT NULL, createdAt DATE NOT NULL, updatedAt DATE
);
CREATE INDEX organizationRole_organizationId_idx ON organizationRole(organizationId);
CREATE INDEX organizationRole_role_idx ON organizationRole(role);
CREATE TABLE team (
  id TEXT NOT NULL PRIMARY KEY, name TEXT NOT NULL, memberCount INTEGER NOT NULL,
  organizationId TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE, createdAt DATE NOT NULL, updatedAt DATE
);
CREATE INDEX team_organizationId_idx ON team(organizationId);
CREATE TABLE teamMember (
  id TEXT NOT NULL PRIMARY KEY, teamId TEXT NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE, membershipKey TEXT UNIQUE, createdAt DATE
);
CREATE INDEX teamMember_teamId_idx ON teamMember(teamId);
CREATE INDEX teamMember_userId_idx ON teamMember(userId);
CREATE TABLE member (
  id TEXT NOT NULL PRIMARY KEY, organizationId TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE, role TEXT NOT NULL, createdAt DATE NOT NULL
);
CREATE INDEX member_organizationId_idx ON member(organizationId);
CREATE INDEX member_userId_idx ON member(userId);
CREATE TABLE invitation (
  id TEXT NOT NULL PRIMARY KEY, organizationId TEXT NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  email TEXT NOT NULL, role TEXT, teamId TEXT, status TEXT NOT NULL, expiresAt DATE NOT NULL, createdAt DATE NOT NULL,
  inviterId TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE
);
CREATE INDEX invitation_organizationId_idx ON invitation(organizationId);
CREATE INDEX invitation_email_idx ON invitation(email);
CREATE TABLE ssoProvider (
  id TEXT NOT NULL PRIMARY KEY, issuer TEXT NOT NULL, oidcConfig TEXT, samlConfig TEXT,
  userId TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE, providerId TEXT NOT NULL UNIQUE,
  organizationId TEXT, domain TEXT NOT NULL, domainVerified INTEGER
);
-- Un espace supprimé laisse ses tableaux à leurs propriétaires : ils ne valent plus que par leurs partages.
ALTER TABLE tableaux ADD COLUMN espace TEXT REFERENCES organization(id) ON DELETE SET NULL;
CREATE INDEX tableaux_espace ON tableaux(espace);
-- Le tableau d'accueil de chaque espace, et si l'espace est le personnel d'un compte. À Notak, pas à Better Auth :
-- un admin d'espace qui change les métadonnées de son espace ne doit pas pouvoir y rattacher un autre tableau.
CREATE TABLE espaces (
  espace TEXT PRIMARY KEY REFERENCES organization(id) ON DELETE CASCADE,
  racine TEXT NOT NULL REFERENCES tableaux(id),
  personnel INTEGER NOT NULL DEFAULT 0
);
`)
      const maintenant = new Date().toISOString()
      const comptes = db.prepare('SELECT id, nom, racine FROM utilisateurs').all() as { id: string; nom: string; racine: string }[]
      for (const u of comptes) {
        // Un compte dont l'accueil a disparu en retrouve un, vide : l'espace a besoin de sa racine.
        if (db.prepare('INSERT OR IGNORE INTO tableaux (id, titre, proprietaire, parent) VALUES (?, ?, ?, NULL)').run(u.racine, u.nom, u.id).changes) {
          db.prepare("INSERT OR IGNORE INTO acces (tableau, utilisateur, role) VALUES (?, ?, 'proprietaire')").run(u.racine, u.id)
        }
        const espace = creerOrganisationPersonnelle(db, u, maintenant)
        db.prepare('INSERT INTO espaces (espace, racine, personnel) VALUES (?, ?, 1)').run(espace, u.racine)
      }
      // Chaque tableau entre dans l'espace personnel de son propriétaire.
      db.exec('UPDATE tableaux SET espace = (SELECT e.espace FROM espaces e JOIN utilisateurs u ON u.racine = e.racine WHERE u.id = tableaux.proprietaire)')
    },
  },
  {
    version: 4,
    nom: 'droits évalués par OpenFGA',
    // Les droits se décrivent en relations (objet, relation, sujet), celles du modèle `autorisation/modele.fga`.
    // `relations` est la source de vérité, gardée par Notak ; OpenFGA en tient une copie et l'évalue. Ce qui change
    // passe par `boite_envoi`, dans la même transaction, puis part vers OpenFGA : rien ne se perd si OpenFGA est
    // injoignable un moment, et un OpenFGA vide se remplit entièrement depuis cette table.
    appliquer(db) {
      db.exec(`
CREATE TABLE relations (
  objet TEXT NOT NULL, relation TEXT NOT NULL, sujet TEXT NOT NULL,
  PRIMARY KEY (objet, relation, sujet)
);
CREATE INDEX relations_sujet ON relations(sujet);
CREATE TABLE boite_envoi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  objet TEXT NOT NULL, relation TEXT NOT NULL, sujet TEXT NOT NULL,
  UNIQUE (objet, relation, sujet)
);
CREATE TABLE reglages (cle TEXT PRIMARY KEY, valeur TEXT NOT NULL);
-- Les espaces dont les membres, les rôles ou les équipes ont changé, quel que soit le chemin de Better Auth qui les a
-- changés : Notak en recalcule les relations.
CREATE TABLE espaces_a_synchroniser (espace TEXT PRIMARY KEY);
CREATE TRIGGER member_ajoute AFTER INSERT ON member BEGIN INSERT OR IGNORE INTO espaces_a_synchroniser VALUES (NEW.organizationId); END;
CREATE TRIGGER member_change AFTER UPDATE ON member BEGIN INSERT OR IGNORE INTO espaces_a_synchroniser VALUES (NEW.organizationId); END;
CREATE TRIGGER member_retire AFTER DELETE ON member BEGIN INSERT OR IGNORE INTO espaces_a_synchroniser VALUES (OLD.organizationId); END;
CREATE TRIGGER role_ajoute AFTER INSERT ON organizationRole BEGIN INSERT OR IGNORE INTO espaces_a_synchroniser VALUES (NEW.organizationId); END;
CREATE TRIGGER role_change AFTER UPDATE ON organizationRole BEGIN INSERT OR IGNORE INTO espaces_a_synchroniser VALUES (NEW.organizationId); END;
CREATE TRIGGER role_retire AFTER DELETE ON organizationRole BEGIN INSERT OR IGNORE INTO espaces_a_synchroniser VALUES (OLD.organizationId); END;
CREATE TRIGGER equipe_ajoutee AFTER INSERT ON team BEGIN INSERT OR IGNORE INTO espaces_a_synchroniser VALUES (NEW.organizationId); END;
CREATE TRIGGER equipe_retiree AFTER DELETE ON team BEGIN INSERT OR IGNORE INTO espaces_a_synchroniser VALUES (OLD.organizationId); END;
CREATE TRIGGER equipier_ajoute AFTER INSERT ON teamMember BEGIN
  INSERT OR IGNORE INTO espaces_a_synchroniser SELECT organizationId FROM team WHERE id = NEW.teamId;
END;
CREATE TRIGGER equipier_retire AFTER DELETE ON teamMember BEGIN
  INSERT OR IGNORE INTO espaces_a_synchroniser SELECT organizationId FROM team WHERE id = OLD.teamId;
END;
CREATE TRIGGER espace_supprime AFTER DELETE ON organization BEGIN INSERT OR IGNORE INTO espaces_a_synchroniser VALUES (OLD.id); END;

-- Les partages d'avant, les tableaux qui héritent de leur parent, l'espace de chaque tableau, les liens publics.
INSERT INTO relations (objet, relation, sujet)
  SELECT 'tableau:' || tableau,
         CASE role WHEN 'proprietaire' THEN 'proprietaire' WHEN 'edition' THEN 'editeur' ELSE 'lecteur' END,
         'user:' || utilisateur
  FROM acces;
INSERT INTO relations (objet, relation, sujet) SELECT 'tableau:' || id, 'parent', 'tableau:' || parent FROM tableaux WHERE parent IS NOT NULL;
INSERT INTO relations (objet, relation, sujet) SELECT 'tableau:' || id, 'espace', 'espace:' || espace FROM tableaux WHERE espace IS NOT NULL;
INSERT INTO relations (objet, relation, sujet) SELECT 'tableau:' || tableau, 'lecteur', 'lien:' || jeton FROM liens_publics;
INSERT INTO espaces_a_synchroniser SELECT id FROM organization;
INSERT INTO boite_envoi (objet, relation, sujet) SELECT objet, relation, sujet FROM relations;
DROP TABLE acces;

-- Une invitation peut désormais donner le commentaire.
CREATE TABLE invitations_nouvelles (
  tableau TEXT NOT NULL REFERENCES tableaux(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('lecture','commentaire','edition','proprietaire')),
  PRIMARY KEY (tableau, email)
);
INSERT INTO invitations_nouvelles SELECT tableau, email, role FROM invitations;
DROP TABLE invitations;
ALTER TABLE invitations_nouvelles RENAME TO invitations;
CREATE INDEX invitations_email ON invitations(email);

-- Les tableaux qui montrent chaque fichier, tenus à jour à chaque enregistrement d'un document : un fichier se lit
-- si l'on peut lire l'un d'eux.
CREATE TABLE fichiers_tableaux (
  fichier TEXT NOT NULL, tableau TEXT NOT NULL REFERENCES tableaux(id) ON DELETE CASCADE,
  PRIMARY KEY (fichier, tableau)
);
CREATE INDEX fichiers_tableaux_tableau ON fichiers_tableaux(tableau);
-- Un niveau pour le lien public : lecture, commentaire ou édition.
ALTER TABLE liens_publics ADD COLUMN niveau TEXT NOT NULL DEFAULT 'lecture' CHECK (niveau IN ('lecture','commentaire','edition'));
-- Tout se réindexe au prochain démarrage, ce qui remplit fichiers_tableaux.
DELETE FROM recherche_etat;
`)
    },
  },
]

/**
 * L'organisation de l'espace personnel d'un compte, dont il est le seul membre et le propriétaire. Son accueil s'y
 * rattache ensuite (table `espaces`), une fois le tableau créé.
 */
export function creerOrganisationPersonnelle(db: DatabaseSync, u: { id: string; nom: string }, maintenant: string): string {
  const espace = randomUUID()
  db.prepare('INSERT INTO organization (id, name, slug, createdAt) VALUES (?, ?, ?, ?)').run(espace, u.nom, `personnel-${u.id}`, maintenant)
  db.prepare('INSERT INTO member (id, organizationId, userId, role, createdAt) VALUES (?, ?, ?, ?, ?)').run(randomUUID(), espace, u.id, 'owner', maintenant)
  return espace
}

/** La version de schéma de cette base : 0 pour une base neuve ou d'avant les migrations. */
export const versionDe = (db: DatabaseSync) => Number((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version)

/** Une base qui a déjà des tables : il y a quelque chose à sauvegarder avant d'y toucher. */
const aDesDonnees = (db: DatabaseSync) => db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' LIMIT 1").get() !== undefined

/**
 * Applique les migrations qui manquent. Avant chacune, si `sauvegarde` est donné et que la base a déjà des données,
 * une copie cohérente est écrite à `sauvegarde(version)` (par `VACUUM INTO`, sûr en WAL). Une copie qui existe déjà
 * est gardée : elle vient d'un essai précédent qui a échoué, c'est elle qui tient la base d'avant.
 */
export function migrer(db: DatabaseSync, sauvegarde?: (version: number) => string, migrations: readonly Migration[] = MIGRATIONS) {
  const depart = versionDe(db)
  const derniere = migrations.at(-1)?.version ?? 0
  if (depart > derniere) throw new Error(`La base est en version ${depart}, ce serveur ne connaît que la ${derniere} : il est plus ancien qu'elle.`)
  for (const m of migrations) {
    if (m.version <= depart) continue
    const copie = sauvegarde?.(m.version)
    if (copie && !existsSync(copie) && aDesDonnees(db)) db.prepare('VACUUM INTO ?').run(copie)
    db.exec('BEGIN IMMEDIATE')
    try {
      m.appliquer(db)
      db.exec(`PRAGMA user_version = ${m.version}`)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw new Error(`Migration ${m.version} (${m.nom}) : ${(e as Error).message}`, { cause: e })
    }
  }
}
