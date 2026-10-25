import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { ouvrirBase } from './base.ts'
import { MIGRATIONS, type Migration, migrer, versionDe } from './migrations.ts'

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
