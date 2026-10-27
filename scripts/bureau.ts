/**
 * L'app de bureau, depuis la racine du dépôt :
 *
 *   bun run bureau:construire    l'app de bureau : l'édition locale embarquée ; un serveur Notak se choisit dans l'app
 *   bun run bureau:cle           une fois pour toutes : la clé qui signe les mises à jour
 *
 * Les autres arguments vont à `tauri build` (`--bundles dmg`, `--target universal-apple-darwin`…).
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const CLI = '@tauri-apps/cli@2.12.4'
const racine = new URL('..', import.meta.url).pathname
const coque = join(racine, 'apps/bureau/src-tauri')
const PUBLICATION = join(coque, 'tauri.publication.json')

function tauri(args: string[], env: NodeJS.ProcessEnv = process.env): number {
  const r = spawnSync('bunx', [CLI, ...args], { cwd: coque, stdio: 'inherit', env, shell: process.platform === 'win32' })
  return r.status ?? 1
}

/**
 * Les arguments de `tauri build`. Il n'y a plus de coque construite pour un serveur : la même app, mise à jour comme
 * les autres, joint le serveur que la personne choisit (`apps/bureau/src-tauri/src/acces.rs`).
 */
export function argumentsDeConstruction(args: string[]): string[] {
  if (args.includes('--serveur')) throw new Error('--serveur n’existe plus : le serveur Notak se choisit dans l’app (« Changer de serveur… »)')
  return ['build', ...args]
}

const construire = (args: string[]): number => tauri(argumentsDeConstruction(args))

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
