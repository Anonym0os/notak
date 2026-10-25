import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { getMigrations } from 'better-auth/db/migration'
import { ouvrirBase } from './base.ts'
import { ORIGINE_ESSAI, authEssai } from './essai.ts'
import { MIGRATIONS, type Migration, migrer, versionDe } from './migrations.ts'
import { hacher } from './motsDePasse.ts'
import { optionsSchema, pluginsAuth } from './auth.ts'

const derniere = MIGRATIONS.at(-1)!.version
let dossiers: string[] = []
const dossier = () => {
  const d = mkdtempSync(join(tmpdir(), 'notak-migrations-'))
  dossiers.push(d)
  return d
}
afterEach(() => {
  for (const d of dossiers) rmSync(d, { recursive: true, force: true })
  dossiers = []
})

describe('migrations', () => {
  it('une base neuve arrive à la dernière version, sans copie de sauvegarde', () => {
    const chemin = join(dossier(), 'notak.db')
    ouvrirBase(chemin).fermer()
    const db = new DatabaseSync(chemin)
    expect(versionDe(db)).toBe(derniere)
    db.close()
    expect(existsSync(`${chemin}.avant-1`)).toBe(false)
  })

  it('Better Auth trouve après nos migrations toutes les tables et colonnes qu’il attend', async () => {
    const base = ouvrirBase(':memory:')
    const plugins = pluginsAuth({ base, courrier: { actif: false, envoyer: async () => {} }, origine: ORIGINE_ESSAI })
    const { toBeCreated, toBeAdded } = await getMigrations({ ...optionsSchema, plugins, database: base.db })
    expect(toBeCreated.map((t) => t.table)).toEqual([])
    expect(toBeAdded.map((t) => [t.table, Object.keys(t.fields)])).toEqual([])
    base.fermer()
  })

  it('un compte d’avant Better Auth se connecte avec son ancien mot de passe, et retrouve ses tableaux', async () => {
    const chemin = join(dossier(), 'notak.db')
    const ancienne = new DatabaseSync(chemin)
    migrer(ancienne, undefined, MIGRATIONS.slice(0, 1))
    ancienne.prepare('INSERT INTO utilisateurs (id,email,nom,hash,couleur,racine) VALUES (?,?,?,?,?,?)').run('u1', 'ana@exemple.fr', 'Ana', await hacher('ancien-mot'), '#e03131', 'racine-u1')
    ancienne.prepare('INSERT INTO tableaux (id,titre,proprietaire,parent) VALUES (?,?,?,?)').run('racine-u1', 'Accueil d’Ana', 'u1', null)
    ancienne.prepare('INSERT INTO acces (tableau,utilisateur,role) VALUES (?,?,?)').run('racine-u1', 'u1', 'proprietaire')
    ancienne.prepare('INSERT INTO sessions (empreinte,utilisateur,expire) VALUES (?,?,?)').run('e', 'u1', Date.now() + 1e6)
    ancienne.close()

    const base = ouvrirBase(chemin)
    const auth = authEssai(base)
    const r = await auth.handler(
      new Request(`${ORIGINE_ESSAI}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { origin: ORIGINE_ESSAI, 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'ana@exemple.fr', password: 'ancien-mot' }),
      }),
    )
    expect(r.status).toBe(200)
    const cookie = r.headers.get('set-cookie')!.split(';')[0]!
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) })
    expect(session?.user).toMatchObject({ id: 'u1', name: 'Ana', emailVerified: true, couleur: '#e03131', racine: 'racine-u1' })
    expect(base.tableauxAccessibles('u1')).toEqual([{ id: 'racine-u1', titre: 'Accueil d’Ana', role: 'proprietaire' }])
    // Un mauvais mot de passe reste mauvais.
    const faux = await auth.api.signInEmail({ body: { email: 'ana@exemple.fr', password: 'autre-mot' } }).catch((e: { statusCode: number }) => e.statusCode)
    expect(faux).toBe(401)
    expect(base.db.prepare("SELECT name FROM sqlite_master WHERE name = 'sessions'").get()).toBeUndefined()
    base.fermer()
  })

  it("une base d'avant les migrations et d'avant la photo garde ses comptes, gagne la colonne, et est sauvegardée", () => {
    const chemin = join(dossier(), 'notak.db')
    const ancienne = new DatabaseSync(chemin)
    ancienne.exec(`CREATE TABLE utilisateurs (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, nom TEXT NOT NULL,
      hash TEXT NOT NULL, couleur TEXT NOT NULL, racine TEXT NOT NULL)`)
    ancienne.prepare('INSERT INTO utilisateurs VALUES (?,?,?,?,?,?)').run('u1', 'a@exemple.fr', 'Alice', 'h', '#000', 'r1')
    ancienne.close()

    const base = ouvrirBase(chemin)
    expect(base.utilisateurParId('u1')).toMatchObject({ email: 'a@exemple.fr', photo: null })
    base.fermer()
    expect(existsSync(`${chemin}.avant-1`)).toBe(true)
    const copie = new DatabaseSync(`${chemin}.avant-1`)
    expect(versionDe(copie)).toBe(0)
    copie.close()
  })

  it('une migration qui échoue est annulée en entier et la version ne bouge pas', () => {
    const db = new DatabaseSync(':memory:')
    const essai: Migration[] = [
      { version: 1, nom: 'une', appliquer: (d) => d.exec('CREATE TABLE a (x)') },
      { version: 2, nom: 'deux', appliquer: (d) => d.exec('CREATE TABLE b (x); CREATE TABLE a (x)') },
    ]
    expect(() => migrer(db, undefined, essai)).toThrow(/Migration 2 \(deux\)/)
    expect(versionDe(db)).toBe(1)
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'b'").get()).toBeUndefined()
    db.close()
  })

  it("refuse une base plus récente que le serveur plutôt que d'y écrire", () => {
    const db = new DatabaseSync(':memory:')
    db.exec(`PRAGMA user_version = ${derniere + 1}`)
    expect(() => migrer(db)).toThrow(/plus ancien/)
    db.close()
  })
})
