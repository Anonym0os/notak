import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { creerAuth, secretDe } from './auth.ts'
import { ouvrirBase } from './base.ts'
import { lireCle } from './chiffrement.ts'
import { creerCourrier } from './courriel.ts'

/**
 * Crée un compte depuis la machine du serveur : c'est la porte d'entrée quand les inscriptions sont fermées
 * (`NOTAK_INSCRIPTIONS=fermees`, docs/AUTO-HEBERGER.md). Il passe par Better Auth, comme une inscription.
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
// La même clé que le serveur : l'accueil du compte s'écrit chiffré comme les autres documents.
const base = ouvrirBase(join(dossier, 'notak.db'), lireCle({ cle: process.env.NOTAK_CLE, fichier: process.env.NOTAK_CLE_FICHIER }))
const auth = creerAuth({
  base,
  secret: secretDe(process.env, dossier),
  origine: process.env.NOTAK_ORIGINE ?? 'http://localhost:3005',
  cookieSecurise: false,
  courrier: creerCourrier(undefined, ''),
})
try {
  const r = await auth.api.signUpEmail({ body: { email: values.email, password: motDePasse, name: values.nom, langue: values.langue === 'en' ? 'en' : 'fr' } as never })
  console.log(`Compte créé : ${r.user.email} (${r.user.name})`)
  if (tire) console.log(`Mot de passe : ${motDePasse}`)
  console.log('Ses droits partiront vers OpenFGA au prochain démarrage du serveur, ou dans les secondes s’il tourne.')
} catch (e) {
  console.error(`Compte refusé : ${e instanceof Error ? e.message : String(e)}`)
  process.exitCode = 1
} finally {
  base.fermer()
}
