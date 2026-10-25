import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { A_TRAITER, TRAITES, listerSignalements, marquerTraite } from '../src/signalements.ts'

/**
 * La file des signalements de bugs, d'un coup :
 *   npm run signalements                 tous ceux à traiter, en entier (mots, contexte, chemins des captures)
 *   npm run signalements -- traite ID…   les passe dans les traités
 *   npm run signalements -- traites      ceux déjà traités, en une ligne chacun
 * Le dossier : `NOTAK_SIGNALEMENTS`, sinon `signalements/` dans les données du serveur (`NOTAK_DONNEES`).
 */

const donnees = process.env.NOTAK_DONNEES ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'data')
const dossier = process.env.NOTAK_SIGNALEMENTS || join(donnees, 'signalements')
const [commande, ...ids] = process.argv.slice(2)

if (commande === 'traite') {
  for (const id of ids) console.log((await marquerTraite(dossier, id)) ? `traité : ${id}` : `introuvable dans ${A_TRAITER} : ${id}`)
} else if (commande === 'traites') {
  for (const s of await listerSignalements(dossier, TRAITES)) console.log(`${s.id}  ${premiereLigne(s.markdown)}`)
} else {
  const file = await listerSignalements(dossier)
  console.log(`${file.length} signalement(s) à traiter dans ${join(dossier, A_TRAITER)}\n`)
  for (const s of file) {
    console.log(`${'='.repeat(80)}\n${s.markdown.trim()}\n`)
    console.log(s.captures.length === 0 ? 'Pas de capture' : s.captures.map((c) => `Capture : ${c}`).join('\n'))
    console.log(`Une fois traité : npm run signalements -- traite ${s.id}\n`)
  }
}

function premiereLigne(markdown: string): string {
  return markdown.split('\n').slice(1).find((l) => l.trim())?.slice(0, 100) ?? ''
}
