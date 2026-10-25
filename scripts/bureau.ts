/**
 * L'app de bureau, depuis la racine du dépôt :
 *
 *   bun run bureau:construire                       l'app de bureau : l'édition locale embarquée, sans serveur
 *   bun run bureau:construire -- --serveur https://notak.exemple.fr
 *                                                   une fenêtre sur un serveur Notak (comptes, temps réel)
 *   bun run bureau:cle                              une fois pour toutes : la clé qui signe les mises à jour
 *
 * Les autres arguments vont à `tauri build` (`--bundles dmg`, `--target universal-apple-darwin`…).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const CLI = '@tauri-apps/cli@2.12.4'
const racine = new URL('..', import.meta.url).pathname
const coque = join(racine, 'apps/bureau/src-tauri')
const PUBLICATION = join(coque, 'tauri.publication.json')

/** Ce que peut une page servie par un serveur Notak dans la coque : la même chose que l'app embarquée, plus la photo d'un signalement, moins les mises à jour (la coque d'un serveur n'en a pas). */
const DROITS_SERVEUR = [
  'core:window:allow-start-dragging',
  'core:window:allow-internal-toggle-maximize',
  'allow-choisir-emplacement',
  'allow-ecrire-fichier',
  'allow-capturer-fenetre',
]

/**
 * La configuration d'une coque pour un serveur : la fenêtre s'ouvre sur lui, et seules ses pages reçoivent les droits
 * de la coque (une capacité limitée à son origine, au lieu de « tout site en https »). Pas de mise à jour automatique :
 * celles du projet remplaceraient cette coque par l'app sans serveur.
 */
export function configServeur(adresse: string): object {
  let u: URL
  try {
    u = new URL(adresse)
  } catch {
    throw new Error(`Adresse illisible : ${adresse}`)
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1'
  // Les webviews (macOS surtout) refusent le HTTP simple hors de la machine.
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) throw new Error('Un serveur distant se joint en https')
  if (u.username || u.password || u.search || u.hash) throw new Error('Une adresse de serveur, sans identifiants ni paramètres')
  return {
    build: { frontendDist: u.origin, beforeBuildCommand: null },
    app: {
      security: {
        capabilities: [{ identifier: 'serveur', windows: ['principale'], remote: { urls: [`${u.origin}/*`] }, permissions: DROITS_SERVEUR }],
      },
    },
  }
}

function tauri(args: string[], env: NodeJS.ProcessEnv = process.env): number {
  const r = spawnSync('bunx', [CLI, ...args], { cwd: coque, stdio: 'inherit', env, shell: process.platform === 'win32' })
  return r.status ?? 1
}

function construire(args: string[]): number {
  const i = args.indexOf('--serveur')
  if (i < 0) return tauri(['build', ...args])
  const adresse = args[i + 1]
  if (!adresse) throw new Error('--serveur <https://notak.exemple.fr>')
  const reste = [...args.slice(0, i), ...args.slice(i + 2)]
  const fichier = join(mkdtempSync(join(tmpdir(), 'notak-bureau-')), 'serveur.json')
  writeFileSync(fichier, JSON.stringify(configServeur(adresse), null, 2))
  console.log(`Une coque pour ${new URL(adresse).origin}, sans mise à jour automatique.`)
  return tauri(['build', '--config', fichier, ...reste])
}

/**
 * La clé des mises à jour : la privée chez soi (`~/.tauri/notak.key`, protégée par un mot de passe), la publique dans
 * `tauri.publication.json`, que chaque app embarque. On ne la change pas à la légère : une app installée n'accepte que
 * les versions signées par la clé qu'elle connaît.
 */
function cle(args: string[]): number {
  const publication = JSON.parse(readFileSync(PUBLICATION, 'utf8')) as { plugins: { updater: { pubkey: string } } }
  if (publication.plugins.updater.pubkey && !args.includes('--remplacer')) {
    console.error(
      'Une clé publique est déjà dans tauri.publication.json. La remplacer coupe les mises à jour de toutes les apps déjà\n' +
        'installées (elles refuseront ce que signe la nouvelle) : seulement si l’ancienne est perdue ou volée, avec --remplacer.',
    )
    return 1
  }
  const prive = join(homedir(), '.tauri', 'notak.key')
  if (existsSync(prive) && !args.includes('--remplacer')) {
    console.error(`${prive} existe déjà : rien n'est écrasé (--remplacer pour le faire).`)
    return 1
  }
  console.log('Choisissez un mot de passe solide, et gardez-le avec la clé (un gestionnaire de mots de passe).')
  const statut = tauri(['signer', 'generate', '-w', prive, ...(args.includes('--remplacer') ? ['-f'] : [])])
  if (statut !== 0) return statut
  publication.plugins.updater.pubkey = readFileSync(`${prive}.pub`, 'utf8').trim()
  writeFileSync(PUBLICATION, JSON.stringify(publication, null, 2) + '\n')
  console.log(`
La clé publique est dans apps/bureau/src-tauri/tauri.publication.json : commitez-la.

Sur GitHub, Settings → Environments → New environment « publication » :
  - Required reviewers : vous (rien ne se signe sans votre accord) ;
  - Deployment branches and tags : seulement les étiquettes v* ;
  - Environment secrets :
      TAURI_SIGNING_PRIVATE_KEY           le contenu de ${prive}
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD  son mot de passe

Gardez une copie de ${prive} et de son mot de passe hors de cet ordinateur : sans eux, plus aucune mise à jour.`)
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [geste, ...args] = process.argv.slice(2)
  try {
    process.exit(geste === 'construire' ? construire(args) : geste === 'cle' ? cle(args) : (console.error('geste attendu : construire ou cle'), 1))
  } catch (e) {
    console.error(`bureau : ${(e as Error).message}`)
    process.exit(1)
  }
}
