import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { demarrer } from './serveur.ts'

const port = Number(process.env.PORT ?? 3005)
const dossier = process.env.NOTAK_DONNEES ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'data')

const serveur = await demarrer({
  port,
  dossier,
  relaisFiable: process.env.NOTAK_RELAIS === '1',
  cookieSecurise: process.env.NOTAK_COOKIE_SECURISE === '1',
  dossierWeb: process.env.NOTAK_WEB,
})
console.log(`Notak : serveur sur le port ${serveur.port}, données dans ${dossier}`)

const arreter = () => void serveur.fermer().then(() => process.exit(0))
process.on('SIGINT', arreter)
process.on('SIGTERM', arreter)
