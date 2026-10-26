import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { relaisDe } from './app.ts'
import { fournisseursDe, normaliserOrigine, secretDe } from './auth.ts'
import { type Cle, ErreurChiffrement, lireCle } from './chiffrement.ts'
import { adminsDe } from './comptes.ts'
import { instanceDe } from './instance.ts'
import { type ServeurDemarre, demarrer } from './serveur.ts'

// Une variable vide vaut une variable absente : une ligne `NOTAK_X=` laissée dans le .env de Compose ne casse rien.
const port = Number(process.env.PORT || 3005)
const hote = process.env.NOTAK_HOTE?.trim() || undefined
const dossier = process.env.NOTAK_DONNEES || join(dirname(fileURLToPath(import.meta.url)), '..', 'data')

mkdirSync(dossier, { recursive: true })
// Le dossier des thèmes existe d'office : on y dépose un fichier sans avoir à le créer (docs/AUTO-HEBERGER.md).
if (!process.env.NOTAK_HABILLAGES) mkdirSync(join(dossier, 'habillages'), { recursive: true })

/** Un réglage qui ne se lit pas : comme une clé fausse, on s'arrête avant d'avoir servi quoi que ce soit. */
class ErreurReglage extends Error {}

/**
 * Une origine de l'environnement, sous la forme qu'envoie un navigateur, à laquelle se comparent les pages qui appellent
 * le serveur. Écrite autrement (« / » final, majuscules, port par défaut), elle passerait à un endroit et pas à un
 * autre : on la corrige, et on le dit.
 */
function origineDe(variable: string, valeur: string): string {
  const origine = normaliserOrigine(valeur)
  if (!origine) throw new ErreurReglage(`${variable}=${valeur} n'est pas une adresse (par exemple https://notak.exemple.fr)`)
  if (origine !== valeur) console.warn(`Notak : ${variable}=${valeur} est lue ${origine} (sans chemin ni « / » final) ; écrivez-la ainsi.`)
  return origine
}

// Une clé illisible, ou qui ne déchiffre pas les données : on s'arrête avant d'avoir servi quoi que ce soit.
let cle: Cle | null
let serveur: ServeurDemarre
try {
  const origine = process.env.NOTAK_ORIGINE?.trim() ? origineDe('NOTAK_ORIGINE', process.env.NOTAK_ORIGINE) : undefined
  if (origine && !/^https?:\/\//.test(origine)) throw new ErreurReglage(`NOTAK_ORIGINE=${origine} doit commencer par https:// (ou http:// pour un essai)`)
  cle = lireCle({ cle: process.env.NOTAK_CLE, fichier: process.env.NOTAK_CLE_FICHIER })
  serveur = await demarrer({
    port,
    hote,
    dossier,
    secret: secretDe(process.env, dossier),
    origine,
    // Sans adresse publique, on est en développement : les pages viennent du serveur de Vite. `NOTAK_AUTRES_ORIGINES`
    // ajoute d'autres pages qui appellent l'API (un second serveur de Vite, l'app de bureau en développement).
    autresOrigines: [
      ...(origine ? [] : ['http://localhost:5173']),
      ...(process.env.NOTAK_AUTRES_ORIGINES ?? '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
        .map((o) => origineDe('NOTAK_AUTRES_ORIGINES', o)),
    ],
    openfga: process.env.NOTAK_OPENFGA_URL || 'http://localhost:8080',
    fournisseurs: fournisseursDe(process.env),
    // Comparées à l'origine de l'émetteur (`decouvrirOidc`) et aux pages qui appellent : écrites comme le fait un navigateur.
    idpInternes: (process.env.NOTAK_IDP_INTERNES ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
      .map((o) => origineDe('NOTAK_IDP_INTERNES', o)),
    smtp: process.env.NOTAK_SMTP_URL,
    expediteur: process.env.NOTAK_EXPEDITEUR?.trim() || undefined,
    relais: relaisDe(process.env.NOTAK_RELAIS),
    cookieSecurise: process.env.NOTAK_COOKIE_SECURISE === '1',
    dossierWeb: process.env.NOTAK_WEB || undefined,
    instance: instanceDe(process.env, dossier),
    cle,
    // Les signalements de bugs (⇧⌘S) : d'office en développement, dans les données ; ailleurs, là où le dit l'instance.
    dossierSignalements: process.env.NOTAK_SIGNALEMENTS || (origine ? null : join(dossier, 'signalements')),
    admins: adminsDe(process.env.NOTAK_ADMINS),
    // Un serveur de développement (sans adresse publique) ne cherche pas de mise à jour : il est en avance sur elles.
    misesAJour: Boolean(origine) && process.env.NOTAK_VERIFIER_MAJ?.trim() !== '0',
  })
} catch (e) {
  if (!(e instanceof ErreurChiffrement || e instanceof ErreurReglage)) throw e
  console.error(`Notak : refus de démarrer, ${e.message}`)
  process.exit(1)
}
console.log(`Notak : serveur sur le port ${serveur.port}${hote ? ` de ${hote}` : ''}, données dans ${dossier}${cle ? ', chiffrées au repos' : ''}`)
// Une valeur illisible (`oui`, `1,2`) vaut aucun relais : derrière Caddy, tous les clients compteraient pour un seul.
const relaisEcrit = process.env.NOTAK_RELAIS?.trim()
if (relaisEcrit && relaisDe(relaisEcrit) === 0 && Number(relaisEcrit) !== 0) {
  console.warn(`Notak : NOTAK_RELAIS=${relaisEcrit} n'est pas un nombre de relais (1, 2…) : il est lu 0, et l'adresse du client est celle de la connexion.`)
}
// L'adresse par défaut de compose.yaml, avec des cookies `Secure` : un .env oublié, sans doute. Les navigateurs qui
// arrivent par la vraie adresse seraient refusés sans un mot.
if (process.env.NOTAK_ORIGINE?.trim().startsWith('http://localhost') && process.env.NOTAK_COOKIE_SECURISE === '1') {
  console.warn('Notak : NOTAK_ORIGINE vaut http://localhost et les cookies sont `Secure` : écrivez l’adresse publique du serveur dans le .env (docs/AUTO-HEBERGER.md).')
}

const arreter = () => void serveur.fermer().then(() => process.exit(0))
process.on('SIGINT', arreter)
process.on('SIGTERM', arreter)
