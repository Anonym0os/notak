import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { ouvrirBase } from './base.ts'
import { ErreurCompte, inscrire } from './comptes.ts'

/**
 * Crée un compte depuis la machine du serveur : c'est la porte d'entrée quand les inscriptions sont fermées
 * (`NOTAK_INSCRIPTIONS=fermees`, docs/AUTO-HEBERGER.md).
 *
 *     bun run serveur:compte -- --email ana@exemple.fr --nom Ana
 *
 * Le mot de passe vient de `NOTAK_MOT_DE_PASSE` ; sans lui, il est tiré au hasard et écrit une fois, ici : il ne passe
 * jamais par la ligne de commande, qui reste dans l'historique du terminal.
 */
const { values } = parseArgs({ options: { email: { type: 'string' }, nom: { type: 'string' }, langue: { type: 'string' } } })
if (!values.email || !values.nom) {
  console.error('Usage : bun run serveur:compte -- --email <adresse> --nom <nom> [--langue fr|en]')
  process.exit(2)
}

const dossier = process.env.NOTAK_DONNEES ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'data')
const tire = !process.env.NOTAK_MOT_DE_PASSE
const motDePasse = process.env.NOTAK_MOT_DE_PASSE ?? randomBytes(12).toString('base64url')
const base = ouvrirBase(join(dossier, 'notak.db'))
try {
  const u = await inscrire(base, { email: values.email, nom: values.nom, motDePasse, langue: values.langue === 'en' ? 'en' : 'fr' })
  console.log(`Compte créé : ${u.email} (${u.nom})`)
  if (tire) console.log(`Mot de passe : ${motDePasse}`)
} catch (e) {
  if (!(e instanceof ErreurCompte)) throw e
  console.error(`Compte refusé : ${e.message}`)
  process.exitCode = 1
} finally {
  base.fermer()
}
