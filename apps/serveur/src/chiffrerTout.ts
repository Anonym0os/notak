import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { type Cle, ErreurChiffrement, chiffrer, dechiffrer, estChiffre } from './chiffrement.ts'

// Chiffre d'un coup tout ce qu'un serveur a écrit en clair avant qu'on lui donne une clé : l'état des documents et
// les fichiers déposés (copies réduites comprises). Ce qui est déjà chiffré est laissé tel quel, après avoir vérifié
// que la clé le lit : on ne mélange pas deux clés dans le même dossier. Le serveur sait déjà lire un mélange de clair
// et de chiffré ; ce passage évite seulement d'attendre que chaque donnée soit réécrite.

export interface BilanChiffrement {
  documents: number
  fichiers: number
  dejaChiffres: number
}

export function chiffrerTout(dossier: string, cle: Cle): BilanChiffrement {
  const bilan: BilanChiffrement = { documents: 0, fichiers: 0, dejaChiffres: 0 }
  const verifier = (octets: Uint8Array, quoi: string) => {
    try {
      dechiffrer(cle, octets)
    } catch (e) {
      throw new ErreurChiffrement(`${quoi} est chiffré avec une autre clé (${e instanceof Error ? e.message : String(e)}) : rien n’a été changé après lui`)
    }
    bilan.dejaChiffres++
  }

  const chemin = join(dossier, 'notak.db')
  if (existsSync(chemin)) {
    const db = new DatabaseSync(chemin)
    try {
      // L'état en clair qu'on remplace est mis à zéro, puis la base est réécrite : il ne reste nulle part dans le fichier.
      db.exec('PRAGMA secure_delete = ON')
      const lignes = db.prepare('SELECT nom, etat FROM documents').all() as { nom: string; etat: Uint8Array }[]
      const ecrire = db.prepare('UPDATE documents SET etat = ? WHERE nom = ?')
      // Une seule transaction : la base passe tout entière, ou pas du tout.
      db.exec('BEGIN IMMEDIATE')
      try {
        for (const { nom, etat } of lignes) {
          if (estChiffre(etat)) verifier(etat, `le document ${nom}`)
          else {
            ecrire.run(chiffrer(cle, etat), nom)
            bilan.documents++
          }
        }
        db.exec('COMMIT')
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
      if (bilan.documents > 0) {
        db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
        db.exec('VACUUM')
      }
    } finally {
      db.close()
    }
  }

  const fichiers = join(dossier, 'fichiers')
  if (existsSync(fichiers)) {
    for (const nom of readdirSync(fichiers)) {
      // Un provisoire laissé par un serveur arrêté en pleine écriture : il n'a jamais été posé, on l'ignore.
      if (nom.endsWith('.tmp')) continue
      const chemin = join(fichiers, nom)
      if (!statSync(chemin).isFile()) continue
      const octets = readFileSync(chemin)
      if (estChiffre(octets)) {
        verifier(octets, `le fichier ${nom}`)
        continue
      }
      // Écrit à côté, puis posé d'un coup : un arrêt en plein milieu laisse l'original intact.
      const provisoire = `${chemin}.${randomUUID()}.tmp`
      try {
        writeFileSync(provisoire, chiffrer(cle, octets))
        renameSync(provisoire, chemin)
      } catch (e) {
        rmSync(provisoire, { force: true })
        throw e
      }
      bilan.fichiers++
    }
  }
  return bilan
}
