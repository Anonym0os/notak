import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fournisseursDe, secretDe } from './auth.ts'
import { demarrer } from './serveur.ts'

const port = Number(process.env.PORT ?? 3005)
const dossier = process.env.NOTAK_DONNEES ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'data')

mkdirSync(dossier, { recursive: true })
const origine = process.env.NOTAK_ORIGINE
const serveur = await demarrer({
  port,
  dossier,
  secret: secretDe(process.env, dossier),
  origine,
  // Sans adresse publique, on est en développement : les pages viennent du serveur de Vite.
  autresOrigines: origine ? [] : ['http://localhost:5173'],
  fournisseurs: fournisseursDe(process.env),
  idpInternes: (process.env.NOTAK_IDP_INTERNES ?? '').split(',').map((o) => o.trim()).filter(Boolean),
  smtp: process.env.NOTAK_SMTP_URL,
  expediteur: process.env.NOTAK_EXPEDITEUR,
  relaisFiable: process.env.NOTAK_RELAIS === '1',
  cookieSecurise: process.env.NOTAK_COOKIE_SECURISE === '1',
  dossierWeb: process.env.NOTAK_WEB,
})
console.log(`Notak : serveur sur le port ${serveur.port}, données dans ${dossier}`)

const arreter = () => void serveur.fermer().then(() => process.exit(0))
process.on('SIGINT', arreter)
process.on('SIGTERM', arreter)
