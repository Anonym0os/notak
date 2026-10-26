/**
 * Notak sur iPhone et iPad, depuis la racine du dépôt, sur un Mac avec Xcode (`docs/IOS.md`) :
 *
 *   bun run ios:init                 une fois : le projet Xcode (apps/bureau/src-tauri/gen/apple), à commiter
 *   bun run ios:dev                  l'app sur le simulateur, rechargée à chaque changement (`-- --host` : un appareil)
 *   bun run ios:construire           l'archive signée pour App Store Connect (`-- --build-number 42`)
 *
 * Les autres arguments vont à la commande Tauri. L'équipe Apple : `APPLE_DEVELOPMENT_TEAM` dans l'environnement, ou
 * `bundle.iOS.developmentTeam` dans `tauri.ios.conf.json`.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CLI } from './bureau.ts'

const racine = new URL('..', import.meta.url).pathname
const coque = join(racine, 'apps/bureau/src-tauri')
const PROJET = join(coque, 'gen/apple')
const CONF_IOS = join(coque, 'tauri.ios.conf.json')

/** L'équipe Apple connue, de l'environnement ou de la configuration ; `null` sans elle. */
export function equipeApple(env: NodeJS.ProcessEnv, confIos: string): string | null {
  const e = env.APPLE_DEVELOPMENT_TEAM?.trim()
  if (e) return e
  try {
    const c = JSON.parse(confIos) as { bundle?: { iOS?: { developmentTeam?: string } } }
    return c.bundle?.iOS?.developmentTeam?.trim() || null
  } catch {
    return null
  }
}

/** Ce qui manque pour construire : rien sur un Mac avec Xcode et une équipe Apple. */
export function manques(o: { plateforme: string; xcode: boolean; equipe: string | null }): string[] {
  const m: string[] = []
  if (o.plateforme !== 'darwin') m.push('un Mac : Xcode ne tourne nulle part ailleurs')
  if (!o.xcode) m.push('Xcode et ses outils en ligne de commande (xcode-select --install)')
  if (!o.equipe) m.push('l’équipe Apple : APPLE_DEVELOPMENT_TEAM=XXXXXXXXXX, ou bundle.iOS.developmentTeam dans tauri.ios.conf.json')
  return m
}

function tauri(args: string[]): number {
  const r = spawnSync('bunx', [CLI, ...args], { cwd: coque, stdio: 'inherit', env: process.env })
  return r.status ?? 1
}

const xcodePresent = () => spawnSync('xcode-select', ['-p'], { stdio: 'ignore' }).status === 0

function verifier(): boolean {
  const m = manques({ plateforme: process.platform, xcode: xcodePresent(), equipe: equipeApple(process.env, existsSync(CONF_IOS) ? readFileSync(CONF_IOS, 'utf8') : '{}') })
  if (m.length) {
    console.error('Il manque :')
    for (const x of m) console.error(`  - ${x}`)
    return false
  }
  return true
}

function init(args: string[]): number {
  if (!verifier()) return 1
  if (existsSync(PROJET) && !args.includes('--reinstall-deps')) {
    console.log(`${PROJET} existe : rien à refaire (supprimez le dossier pour repartir, ou passez --reinstall-deps).`)
    return 0
  }
  const statut = tauri(['ios', 'init', '--ci', ...args])
  if (statut !== 0) return statut
  console.log(`
Le projet Xcode est dans apps/bureau/src-tauri/gen/apple : commitez-le (docs/IOS.md dit ce qu'on y règle ensuite :
project.yml, InfoPlist.strings, l'icône, l'extension de partage). Puis : bun run ios:dev`)
  return 0
}

function dev(args: string[]): number {
  if (!verifier()) return 1
  // Sur un appareil réel, la page doit joindre Vite par le réseau : `--host`. Sur le simulateur, localhost suffit.
  return tauri(['ios', 'dev', ...args])
}

function construire(args: string[]): number {
  if (!verifier()) return 1
  const i = args.indexOf('--build-number')
  const numero = i >= 0 ? args[i + 1] : process.env.GITHUB_RUN_NUMBER
  const reste = i >= 0 ? [...args.slice(0, i), ...args.slice(i + 2)] : args
  if (!numero || !/^\d+$/.test(numero)) {
    console.error('Un numéro de build entier : --build-number 42 (la CI prend GITHUB_RUN_NUMBER).')
    return 1
  }
  return tauri(['ios', 'build', '--ci', '--export-method', 'app-store-connect', '--build-number', numero, ...reste])
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [geste, ...args] = process.argv.slice(2)
  try {
    process.exit(geste === 'init' ? init(args) : geste === 'dev' ? dev(args) : geste === 'construire' ? construire(args) : (console.error('geste attendu : init, dev ou construire'), 1))
  } catch (e) {
    console.error(`ios : ${(e as Error).message}`)
    process.exit(1)
  }
}
