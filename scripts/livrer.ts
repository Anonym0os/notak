/**
 * Livrer Notak sur TestFlight : l'iPhone, l'iPad et le Mac, d'une même commande, depuis un Mac avec Xcode
 * (`docs/LIVRER.md`). La CI fait la même chose à chaque fusion sur main (`.github/workflows/livrer.yml`).
 *
 *   bun run livrer verifier     ce qui manque, ici et chez Apple (clé, fiche, certificats, profil), sans rien changer
 *   bun run livrer profil       crée ou renouvelle le profil « Mac App Store » de Notak, par l'API App Store Connect
 *   bun run livrer ios          construit l'IPA (iPhone et iPad) et l'envoie à App Store Connect
 *   bun run livrer mac          construit Notak.app cloisonné, son .pkg signé, et l'envoie
 *   bun run livrer              les deux, sous le même numéro de build
 *
 * `--numero 202611042230` impose le numéro de build ; sans lui, l'heure UTC (AAAAMMJJHHMM) : il ne fait que croître,
 * que le build parte de la CI ou de ce Mac. `--sans-envoi` construit sans rien envoyer.
 *
 * La clé App Store Connect : son identifiant et celui de l'émetteur dans `~/.appstoreconnect/notak.json`
 * (`{ "cle": "ABC123DEFG", "emetteur": "uuid" }`), ou `APPLE_API_KEY` et `APPLE_API_ISSUER` dans l'environnement ; la
 * clé privée dans `~/.appstoreconnect/private_keys/AuthKey_<cle>.p8` (là où `altool` la cherche), ou
 * `APPLE_API_KEY_PATH`. Elle ne quitte jamais ce Mac : seul un jeton de vingt minutes, signé par elle, part chez Apple.
 */
import { spawnSync } from 'node:child_process'
import { createPrivateKey, sign } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CLI } from './bureau.ts'

const racine = new URL('..', import.meta.url).pathname
const coque = join(racine, 'apps/bureau/src-tauri')
const projetIos = join(coque, 'gen/apple')

export const IDENTIFIANT = 'app.notak.bureau'
export const EQUIPE = '2MLG399MFA'
export const CONTENEUR_ICLOUD = 'iCloud.app.notak.bureau'
export const NOM_PROFIL_MAC = 'Notak Mac App Store'
/** À côté de la clé, hors du dépôt : la construction de la CI (un autre dossier sur ce Mac) le trouve aussi. */
export const PROFIL_MAC = join(homedir(), '.appstoreconnect/Notak_Mac_App_Store.provisionprofile')
const API = 'https://api.appstoreconnect.apple.com'

export interface Identifiants {
  cle: string
  emetteur: string
  chemin: string
}

/** La clé App Store Connect : l'environnement d'abord, puis `~/.appstoreconnect/notak.json` ; `null` sans elle. */
export function identifiants(env: NodeJS.ProcessEnv, fichier: string | null, maison: string): Identifiants | null {
  let cle = env.APPLE_API_KEY?.trim()
  let emetteur = env.APPLE_API_ISSUER?.trim()
  if ((!cle || !emetteur) && fichier) {
    try {
      const f = JSON.parse(fichier) as { cle?: string; emetteur?: string }
      cle ||= f.cle?.trim()
      emetteur ||= f.emetteur?.trim()
    } catch {
      // Un fichier illisible vaut un fichier absent : `verifier` le dit.
    }
  }
  if (!cle || !emetteur) return null
  const chemin = env.APPLE_API_KEY_PATH?.trim() || join(maison, '.appstoreconnect/private_keys', `AuthKey_${cle}.p8`)
  return { cle, emetteur, chemin }
}

/** Le numéro de build : l'heure UTC, AAAAMMJJHHMM. Le même pour iOS et le Mac d'une livraison. */
export function numeroDeBuild(d: Date): string {
  const z = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${z(d.getUTCMonth() + 1)}${z(d.getUTCDate())}${z(d.getUTCHours())}${z(d.getUTCMinutes())}`
}

/** Le nom de l'identité qui signe le .pkg du Mac, lu dans `security find-identity -v` ; `null` sans elle. */
export function identiteInstalleur(sortie: string, equipe = EQUIPE): string | null {
  for (const ligne of sortie.split('\n')) {
    const m = /"((?:3rd Party Mac Developer Installer|Mac Installer Distribution): [^"]*\((\w+)\))"/.exec(ligne)
    if (m && m[2] === equipe) return m[1]
  }
  return null
}

/** Le jeton d'une requête à l'API App Store Connect : un JWT ES256 de vingt minutes, signé par la clé. */
export function jeton(ids: Identifiants, pem: string, maintenant = Date.now()): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const t = Math.floor(maintenant / 1000)
  const tete = `${b64({ alg: 'ES256', kid: ids.cle, typ: 'JWT' })}.${b64({ iss: ids.emetteur, iat: t, exp: t + 20 * 60, aud: 'appstoreconnect-v1' })}`
  const signature = sign('sha256', Buffer.from(tete), { key: createPrivateKey(pem), dsaEncoding: 'ieee-p1363' })
  return `${tete}.${signature.toString('base64url')}`
}

// ---------------------------------------------------------------------------------------------------------------------

const lire = (chemin: string) => (existsSync(chemin) ? readFileSync(chemin, 'utf8') : null)
const IDS_FICHIER = join(homedir(), '.appstoreconnect/notak.json')

function lancer(cmd: string, args: string[], o: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): number {
  console.log(`\n$ ${cmd} ${args.join(' ')}`)
  return spawnSync(cmd, args, { stdio: 'inherit', cwd: o.cwd ?? racine, env: o.env ?? process.env }).status ?? 1
}
const sortie = (cmd: string, args: string[]) => spawnSync(cmd, args, { encoding: 'utf8' }).stdout ?? ''

interface Reponse<T> {
  data: T
  included?: unknown[]
  errors?: { title: string; detail: string }[]
}

async function api<T>(ids: Identifiants, chemin: string, init: RequestInit = {}): Promise<Reponse<T>> {
  const r = await fetch(`${API}${chemin}`, {
    ...init,
    headers: { Authorization: `Bearer ${jeton(ids, readFileSync(ids.chemin, 'utf8'))}`, 'Content-Type': 'application/json', ...init.headers },
  })
  const corps = (await r.json().catch(() => ({}))) as Reponse<T>
  if (!r.ok) throw new Error(`App Store Connect ${r.status} sur ${chemin} : ${corps.errors?.map((e) => e.detail || e.title).join(' ; ') ?? r.statusText}`)
  return corps
}

type Ressource = { id: string; type: string; attributes: Record<string, unknown> }

/** Ce qui manque sur ce Mac pour construire et envoyer. */
function manquesIci(ids: Identifiants | null): string[] {
  const m: string[] = []
  if (process.platform !== 'darwin') return ['un Mac : Xcode ne tourne nulle part ailleurs']
  if (spawnSync('xcode-select', ['-p'], { stdio: 'ignore' }).status !== 0) m.push('Xcode (xcode-select --install, puis Xcode depuis l’App Store)')
  const cibles = sortie('rustup', ['target', 'list', '--installed'])
  for (const c of ['aarch64-apple-ios', 'aarch64-apple-darwin']) if (!cibles.includes(c)) m.push(`la cible Rust ${c} : rustup target add ${c}`)
  // swift-rs (le plugin « appareil ») a besoin de llvm-objcopy, sans quoi le lien échoue sur _init_plugin_appareil.
  if (!sortie('rustup', ['component', 'list', '--installed']).includes('llvm-tools')) m.push('llvm-tools : rustup component add llvm-tools')
  const identites = sortie('security', ['find-identity', '-v'])
  if (!identites.includes(`Apple Distribution: Silak (${EQUIPE})`)) m.push(`le certificat « Apple Distribution » de l’équipe ${EQUIPE} dans le trousseau`)
  if (!identiteInstalleur(identites)) m.push('le certificat « Mac Installer Distribution » : Xcode → Réglages → Comptes → Gérer les certificats → + ')
  if (!ids) m.push(`la clé App Store Connect : ${IDS_FICHIER} ({ "cle": "…", "emetteur": "…" }) ou APPLE_API_KEY et APPLE_API_ISSUER`)
  else if (!existsSync(ids.chemin)) m.push(`la clé privée ${ids.chemin} (le .p8 téléchargé une seule fois chez Apple)`)
  return m
}

/** Ce qui manque chez Apple : la fiche, l'identifiant et ses droits, le profil du Mac. */
async function manquesChezApple(ids: Identifiants): Promise<string[]> {
  const m: string[] = []
  const apps = await api<Ressource[]>(ids, `/v1/apps?filter[bundleId]=${IDENTIFIANT}`)
  if (!apps.data.length) m.push(`la fiche de l’app dans App Store Connect (Apps → + → Nouvelle app, iOS et macOS, identifiant ${IDENTIFIANT})`)
  const bundle = await identifiantApple(ids)
  if (!bundle) m.push(`l’identifiant ${IDENTIFIANT} dans Certificats, identifiants et profils`)
  else {
    const plateforme = bundle.attributes.platform
    if (plateforme !== 'UNIVERSAL' && plateforme !== 'MAC_OS') m.push(`l’identifiant ${IDENTIFIANT} est réservé à ${String(plateforme)} : il faut aussi macOS (achat universel)`)
    const capacites = await api<Ressource[]>(ids, `/v1/bundleIds/${bundle.id}/bundleIdCapabilities`)
    if (!capacites.data.some((c) => c.attributes.capabilityType === 'ICLOUD')) m.push(`la capacité iCloud (conteneur ${CONTENEUR_ICLOUD}) sur ${IDENTIFIANT}`)
  }
  if (!existsSync(PROFIL_MAC)) m.push('le profil « Mac App Store » : bun run livrer profil')
  return m
}

async function identifiantApple(ids: Identifiants): Promise<Ressource | undefined> {
  const r = await api<Ressource[]>(ids, `/v1/bundleIds?filter[identifier]=${IDENTIFIANT}`)
  // Le filtre prend aussi les identifiants qui commencent pareil : on garde l'exact.
  return r.data.find((b) => b.attributes.identifier === IDENTIFIANT)
}

async function verifier(): Promise<number> {
  const ids = identifiants(process.env, lire(IDS_FICHIER), homedir())
  const m = manquesIci(ids)
  if (ids && existsSync(ids.chemin)) {
    try {
      m.push(...(await manquesChezApple(ids)))
    } catch (e) {
      m.push(`une réponse d’App Store Connect : ${(e as Error).message}`)
    }
  }
  if (!m.length) {
    console.log('Tout est prêt : bun run livrer')
    return 0
  }
  console.error('Il manque :')
  for (const x of m) console.error(`  - ${x}`)
  return 1
}

/**
 * Le profil « Mac App Store » de Notak : l'identifiant, ses droits (iCloud compris) et le certificat « Apple
 * Distribution » de l'équipe. Un profil d'un an ; on en refait un neuf (l'ancien du même nom est supprimé).
 */
async function profil(): Promise<number> {
  const ids = identifiants(process.env, lire(IDS_FICHIER), homedir())
  if (!ids || !existsSync(ids.chemin)) return (console.error('La clé App Store Connect manque : bun run livrer verifier'), 1)
  const bundle = await identifiantApple(ids)
  if (!bundle) return (console.error(`${IDENTIFIANT} n’est pas enregistré chez Apple.`), 1)
  const certificats = await api<Ressource[]>(ids, '/v1/certificates?filter[certificateType]=DISTRIBUTION&limit=200')
  const valides = certificats.data.filter((c) => new Date(String(c.attributes.expirationDate)) > new Date())
  if (!valides.length) return (console.error('Aucun certificat « Apple Distribution » valide chez Apple.'), 1)
  const anciens = await api<Ressource[]>(ids, `/v1/profiles?filter[name]=${encodeURIComponent(NOM_PROFIL_MAC)}`)
  for (const p of anciens.data) await api(ids, `/v1/profiles/${p.id}`, { method: 'DELETE' }).catch(() => undefined)
  const cree = await api<Ressource>(ids, '/v1/profiles', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'profiles',
        attributes: { name: NOM_PROFIL_MAC, profileType: 'MAC_APP_STORE' },
        relationships: {
          bundleId: { data: { type: 'bundleIds', id: bundle.id } },
          certificates: { data: valides.map((c) => ({ type: 'certificates', id: c.id })) },
        },
      },
    }),
  })
  mkdirSync(join(homedir(), '.appstoreconnect'), { recursive: true })
  writeFileSync(PROFIL_MAC, Buffer.from(String(cree.data.attributes.profileContent), 'base64'))
  console.log(`Profil « ${NOM_PROFIL_MAC} » écrit dans ${PROFIL_MAC} (jusqu’au ${String(cree.data.attributes.expirationDate).slice(0, 10)}).`)
  return 0
}

/** Les fichiers suivis de `gen/apple` qu'une construction modifie (le numéro de version) : on les rend tels quels. */
function fichiersModifies(): Set<string> {
  const s = sortie('git', ['-C', racine, 'status', '--porcelain', '--', 'apps/bureau/src-tauri/gen/apple'])
  return new Set(s.split('\n').filter(Boolean).map((l) => l.slice(3)))
}

function envoyer(ids: Identifiants, fichier: string): number {
  return lancer('xcrun', ['altool', '--upload-package', fichier, '--api-key', ids.cle, '--api-issuer', ids.emetteur, '--p8-file-path', ids.chemin, '--wait'])
}

function ios(ids: Identifiants, numero: string, envoi: boolean): number {
  const avant = fichiersModifies()
  // La clé sert aussi à la signature : Xcode crée ou renouvelle lui-même le profil de distribution d'iOS.
  const env = { ...process.env, APPLE_API_KEY: ids.cle, APPLE_API_ISSUER: ids.emetteur, APPLE_API_KEY_PATH: ids.chemin, APPLE_DEVELOPMENT_TEAM: EQUIPE }
  const statut = lancer('bunx', [CLI, 'ios', 'build', '--ci', '--export-method', 'app-store-connect', '--config', JSON.stringify({ bundle: { iOS: { bundleVersion: numero } } })], { cwd: coque, env })
  const rendre = [...fichiersModifies()].filter((f) => !avant.has(f))
  if (rendre.length) spawnSync('git', ['-C', racine, 'checkout', '--', ...rendre])
  if (statut !== 0) return statut
  const dossier = join(projetIos, 'build/arm64')
  const ipa = readdirSync(dossier).find((f) => f.endsWith('.ipa'))
  if (!ipa) return (console.error(`Pas d’IPA dans ${dossier}`), 1)
  console.log(`\niOS ${numero} : ${join(dossier, ipa)}`)
  return envoi ? envoyer(ids, join(dossier, ipa)) : 0
}

function mac(ids: Identifiants, numero: string, envoi: boolean): number {
  if (!existsSync(PROFIL_MAC)) return (console.error('Le profil « Mac App Store » manque : bun run livrer profil'), 1)
  const installeur = identiteInstalleur(sortie('security', ['find-identity', '-v']))
  if (!installeur) return (console.error('Le certificat « Mac Installer Distribution » manque : bun run livrer verifier'), 1)
  // Sans les variables APPLE_* : Tauri notariserait (c'est l'App Store qui s'en charge), et la mise à jour de GitHub
  // n'a pas sa place ici (tauri.publication.json n'est pas fondu, et la coque cloisonnée ne la lance pas).
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('APPLE_')))
  const config = JSON.stringify({ bundle: { macOS: { bundleVersion: numero, files: { 'embedded.provisionprofile': PROFIL_MAC } } } })
  const cible = 'aarch64-apple-darwin'
  const statut = lancer('bunx', [CLI, 'build', '--bundles', 'app', '--target', cible, '--config', 'tauri.boutique.json', '--config', config], { cwd: coque, env })
  if (statut !== 0) return statut
  const dossier = join(coque, `target/${cible}/release/bundle/macos`)
  const app = join(dossier, 'Notak.app')
  const pkg = join(dossier, 'Notak.pkg')
  const p = lancer('xcrun', ['productbuild', '--sign', installeur, '--component', app, '/Applications', pkg])
  if (p !== 0) return p
  console.log(`\nMac ${numero} : ${pkg}`)
  return envoi ? envoyer(ids, pkg) : 0
}

async function livrer(geste: string, args: string[]): Promise<number> {
  const ids = identifiants(process.env, lire(IDS_FICHIER), homedir())
  const m = manquesIci(ids)
  if (m.length) {
    console.error('Il manque :')
    for (const x of m) console.error(`  - ${x}`)
    return 1
  }
  const i = args.indexOf('--numero')
  const numero = i >= 0 ? args[i + 1] : numeroDeBuild(new Date())
  if (!numero || !/^\d+$/.test(numero)) return (console.error('--numero attend un entier (AAAAMMJJHHMM).'), 1)
  const envoi = !args.includes('--sans-envoi')
  if (geste === 'ios' || geste === 'tout') {
    const s = ios(ids!, numero, envoi)
    if (s !== 0) return s
  }
  if (geste === 'mac' || geste === 'tout') {
    const s = mac(ids!, numero, envoi)
    if (s !== 0) return s
  }
  console.log(`\nLivré sous le numéro ${numero}${envoi ? ' : TestFlight le propose dans quelques minutes, le temps qu’Apple le traite.' : ' (sans envoi).'}`)
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [premier, ...reste] = process.argv.slice(2)
  const geste = !premier || premier.startsWith('--') ? 'tout' : premier
  const args = !premier || premier.startsWith('--') ? process.argv.slice(2) : reste
  const faire = geste === 'verifier' ? verifier() : geste === 'profil' ? profil() : ['ios', 'mac', 'tout'].includes(geste) ? livrer(geste, args) : Promise.resolve((console.error('geste attendu : verifier, profil, ios, mac ou rien (les deux)'), 1))
  faire.then(
    (s) => process.exit(s),
    (e: Error) => {
      console.error(`livrer : ${e.message}`)
      process.exit(1)
    },
  )
}
