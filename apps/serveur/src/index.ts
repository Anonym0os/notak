import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fournisseursDe, secretDe } from './auth.ts'
import { type Cle, ErreurChiffrement, lireCle } from './chiffrement.ts'
import { instanceDe } from './instance.ts'
import { type ServeurDemarre, demarrer } from './serveur.ts'

const port = Number(process.env.PORT ?? 3005)
const dossier = process.env.NOTAK_DONNEES ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'data')

mkdirSync(dossier, { recursive: true })
const origine = process.env.NOTAK_ORIGINE
// Une clé illisible, ou qui ne déchiffre pas les données : on s'arrête avant d'avoir servi quoi que ce soit.
let cle: Cle | null
let serveur: ServeurDemarre
try {
  cle = lireCle({ cle: process.env.NOTAK_CLE, fichier: process.env.NOTAK_CLE_FICHIER })
  serveur = await demarrer({
    port,
    dossier,
    secret: secretDe(process.env, dossier),
    origine,
    // Sans adresse publique, on est en développement : les pages viennent du serveur de Vite. `NOTAK_AUTRES_ORIGINES`
    // ajoute d'autres pages qui appellent l'API (un second serveur de Vite, l'app de bureau en développement).
    autresOrigines: [
      ...(origine ? [] : ['http://localhost:5173']),
      ...(process.env.NOTAK_AUTRES_ORIGINES ?? '').split(',').map((o) => o.trim()).filter(Boolean),
    ],
    openfga: process.env.NOTAK_OPENFGA_URL ?? 'http://localhost:8080',
    fournisseurs: fournisseursDe(process.env),
    idpInternes: (process.env.NOTAK_IDP_INTERNES ?? '').split(',').map((o) => o.trim()).filter(Boolean),
    smtp: process.env.NOTAK_SMTP_URL,
    expediteur: process.env.NOTAK_EXPEDITEUR,
    relaisFiable: process.env.NOTAK_RELAIS === '1',
    cookieSecurise: process.env.NOTAK_COOKIE_SECURISE === '1',
    dossierWeb: process.env.NOTAK_WEB,
    instance: instanceDe(process.env, dossier),
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
