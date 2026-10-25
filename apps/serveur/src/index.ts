import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Cle, ErreurChiffrement, lireCle } from './chiffrement.ts'
import { type ServeurDemarre, demarrer } from './serveur.ts'

const port = Number(process.env.PORT ?? 3005)
const dossier = process.env.NOTAK_DONNEES ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'data')

// Une clé illisible, ou qui ne déchiffre pas les données : on s'arrête avant d'avoir servi quoi que ce soit.
let cle: Cle | null
let serveur: ServeurDemarre
try {
  cle = lireCle({ cle: process.env.NOTAK_CLE, fichier: process.env.NOTAK_CLE_FICHIER })
  serveur = await demarrer({
    port,
    dossier,
    relaisFiable: process.env.NOTAK_RELAIS === '1',
    cookieSecurise: process.env.NOTAK_COOKIE_SECURISE === '1',
    dossierWeb: process.env.NOTAK_WEB,
    cle,
  })
} catch (e) {
  if (!(e instanceof ErreurChiffrement)) throw e
  console.error(`Notak : refus de démarrer, ${e.message}`)
  process.exit(1)
}
console.log(`Notak : serveur sur le port ${serveur.port}, données dans ${dossier}${cle ? ', chiffrées au repos' : ''}`)

const arreter = () => void serveur.fermer().then(() => process.exit(0))
process.on('SIGINT', arreter)
process.on('SIGTERM', arreter)
