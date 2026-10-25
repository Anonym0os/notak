// Chiffre tout l'existant d'un serveur : bun run serveur:chiffrer (serveur arrêté, de préférence).
// La clé et le dossier se donnent comme au serveur : NOTAK_CLE ou NOTAK_CLE_FICHIER, et NOTAK_DONNEES.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ErreurChiffrement, lireCle } from '../src/chiffrement.ts'
import { chiffrerTout } from '../src/chiffrerTout.ts'

const dossier = process.env.NOTAK_DONNEES ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'data')

try {
  const cle = lireCle({ cle: process.env.NOTAK_CLE, fichier: process.env.NOTAK_CLE_FICHIER })
  if (!cle) throw new ErreurChiffrement('aucune clé : donner NOTAK_CLE ou NOTAK_CLE_FICHIER')
  const bilan = chiffrerTout(dossier, cle)
  console.log(
    `Notak : ${bilan.documents} document(s) et ${bilan.fichiers} fichier(s) chiffrés dans ${dossier}` +
      (bilan.dejaChiffres > 0 ? `, ${bilan.dejaChiffres} l’étaient déjà` : ''),
  )
} catch (e) {
  if (!(e instanceof ErreurChiffrement)) throw e
  console.error(`Notak : ${e.message}`)
  process.exit(1)
}
