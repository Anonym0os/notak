/**
 * La publication de l'app de bureau, en trois gestes que fait la CI (`.github/workflows/publier-bureau.yml`) :
 *
 *   node scripts/publication.ts notes <version>                       les notes de cette version (docs/NOUVEAUTES.md)
 *   node scripts/publication.ts paquets <dossier bundle> <plateforme> <version> <sortie>
 *                                                                      range les paquets d'une plateforme sous des noms stables
 *   node scripts/publication.ts annonce <dossier> <version> <dépôt>    écrit latest.json et SHA256SUMS.txt
 *
 * `latest.json` est ce que lit chaque app installée pour savoir qu'une version existe : son numéro, ses notes, et pour
 * chaque plateforme l'adresse du paquet et sa signature. L'annonce refuse de s'écrire s'il manque une plateforme, ou
 * si un paquet de mise à jour n'a pas sa signature, ou une signature qui ne porte pas ce numéro : une version à moitié
 * publiée ne se propose à personne.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export type Plateforme = 'macos-aarch64' | 'macos-x86_64' | 'linux-x86_64' | 'windows-x86_64'
export const PLATEFORMES: readonly Plateforme[] = ['macos-aarch64', 'macos-x86_64', 'linux-x86_64', 'windows-x86_64']

/** Une version : trois nombres, sans rien d'autre (pas de « v », pas de suffixe). */
export const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

/** Ce qu'on publie de chaque sorte de paquet : où Tauri le range, et le nom stable qu'il prend. */
interface Sorte {
  dossier: string
  /** La fin du nom de fichier que Tauri écrit. */
  fin: string
  nom(version: string): string
  /** Tauri n'écrit pas le numéro dans ce nom (`Notak.app.tar.gz`) : rien à vérifier. */
  sansNumero?: true
}

const SORTES: Record<Plateforme, Sorte[]> = {
  'macos-aarch64': [
    { dossier: 'dmg', fin: '.dmg', nom: (v) => `Notak_${v}_macos_aarch64.dmg` },
    { dossier: 'macos', fin: '.app.tar.gz', nom: (v) => `Notak_${v}_macos_aarch64.app.tar.gz`, sansNumero: true },
  ],
  'macos-x86_64': [
    { dossier: 'dmg', fin: '.dmg', nom: (v) => `Notak_${v}_macos_x86_64.dmg` },
    { dossier: 'macos', fin: '.app.tar.gz', nom: (v) => `Notak_${v}_macos_x86_64.app.tar.gz`, sansNumero: true },
  ],
  'linux-x86_64': [
    { dossier: 'appimage', fin: '.AppImage', nom: (v) => `Notak_${v}_linux_x86_64.AppImage` },
    { dossier: 'deb', fin: '.deb', nom: (v) => `Notak_${v}_linux_amd64.deb` },
    { dossier: 'rpm', fin: '.rpm', nom: (v) => `Notak_${v}_linux_x86_64.rpm` },
  ],
  'windows-x86_64': [
    { dossier: 'nsis', fin: '-setup.exe', nom: (v) => `Notak_${v}_windows_x64-setup.exe` },
    { dossier: 'msi', fin: '.msi', nom: (v) => `Notak_${v}_windows_x64.msi` },
  ],
}

/**
 * Les clés de `latest.json` que sert chaque paquet de mise à jour. L'app cherche d'abord la clé de sa sorte
 * d'installation (`windows-x86_64-msi`), puis celle de sa plateforme (`windows-x86_64`).
 */
const CLES: { fin: string; cles: string[] }[] = [
  { fin: '_macos_aarch64.app.tar.gz', cles: ['darwin-aarch64', 'darwin-aarch64-app'] },
  { fin: '_macos_x86_64.app.tar.gz', cles: ['darwin-x86_64', 'darwin-x86_64-app'] },
  { fin: '_linux_x86_64.AppImage', cles: ['linux-x86_64', 'linux-x86_64-appimage'] },
  { fin: '_linux_amd64.deb', cles: ['linux-x86_64-deb'] },
  { fin: '_linux_x86_64.rpm', cles: ['linux-x86_64-rpm'] },
  { fin: '_windows_x64-setup.exe', cles: ['windows-x86_64', 'windows-x86_64-nsis'] },
  { fin: '_windows_x64.msi', cles: ['windows-x86_64-msi'] },
]
/** Sans ces quatre-là, l'annonce ne s'écrit pas. */
const CLES_REQUISES = ['darwin-aarch64', 'darwin-x86_64', 'linux-x86_64', 'windows-x86_64']

/** Les notes d'une version : sa section de `docs/NOUVEAUTES.md` (`## 0.2.0 — 25/10/2026`), sans son titre. */
export function notesDe(nouveautes: string, version: string): string | null {
  const lignes = nouveautes.split('\n')
  const debut = lignes.findIndex((l) => new RegExp(`^## ${version.replace(/\./g, '\\.')}(\\s|$)`).test(l))
  if (debut < 0) return null
  const fin = lignes.findIndex((l, i) => i > debut && l.startsWith('## '))
  const notes = lignes
    .slice(debut + 1, fin < 0 ? undefined : fin)
    .join('\n')
    .trim()
  return notes || null
}

/**
 * Les paquets d'une plateforme, trouvés dans le dossier `bundle` de Tauri, et le nom qu'ils prennent. Un paquet d'une
 * autre version (resté là d'une construction d'avant) n'est jamais pris pour celui-ci : là où Tauri écrit le numéro
 * dans le nom, il doit être le bon.
 */
export function paquets(fichiers: Record<string, string[]>, plateforme: Plateforme, version: string): { source: string; nom: string }[] {
  const res: { source: string; nom: string }[] = []
  const numero = new RegExp(`[_-]${version.replace(/\./g, '\\.')}[_-]`)
  for (const sorte of SORTES[plateforme]) {
    const ici = (fichiers[sorte.dossier] ?? []).filter((f) => f.endsWith(sorte.fin) && (sorte.sansNumero || numero.test(f)))
    if (ici.length > 1) throw new Error(`Plusieurs paquets ${sorte.fin} dans ${sorte.dossier} : ${ici.join(', ')}`)
    const [source] = ici
    if (!source) continue
    res.push({ source: `${sorte.dossier}/${source}`, nom: sorte.nom(version) })
    const signature = (fichiers[sorte.dossier] ?? []).find((f) => f === `${source}.sig`)
    if (signature) res.push({ source: `${sorte.dossier}/${signature}`, nom: `${sorte.nom(version)}.sig` })
  }
  return res
}

/**
 * Le numéro qu'une signature de Tauri porte dans son commentaire de confiance (`version:0.2.0`, couvert par la
 * signature), ou `null`. Le `.sig` est le fichier de minisign, en base64 ; le commentaire, des champs `clé:valeur`
 * séparés par des tabulations, lus comme les lit l'app (`tauri-plugin-updater`, `signed_version`).
 */
export function versionSignee(signature: string): string | null {
  const texte = Buffer.from(signature, 'base64').toString('utf8')
  const commentaire = texte
    .split('\n')
    .find((l) => l.startsWith('trusted comment: '))
    ?.slice('trusted comment: '.length)
    .replace(/\r$/, '')
  const champ = commentaire?.split('\t').find((c) => c.startsWith('version:'))
  return champ === undefined ? null : champ.slice('version:'.length)
}

export interface Annonce {
  version: string
  notes: string
  pub_date: string
  platforms: Record<string, { signature: string; url: string }>
}

/**
 * `latest.json`, d'après les noms publiés et leurs signatures. `adresse` : où un fichier de la version se télécharge
 * une fois publiée (`https://github.com/<dépôt>/releases/download/v<version>/<nom>`).
 */
export function annonce(o: { version: string; notes: string; date: Date; noms: string[]; signature(nom: string): string; adresse(nom: string): string }): Annonce {
  const platforms: Annonce['platforms'] = {}
  for (const { fin, cles } of CLES) {
    const nom = o.noms.find((n) => n === `Notak_${o.version}${fin}`)
    if (!nom) continue
    if (!o.noms.includes(`${nom}.sig`)) {
      // Un paquet de mise à jour sans signature : l'app le refuserait de toute façon ; on ne l'annonce pas.
      if (cles.some((c) => CLES_REQUISES.includes(c))) throw new Error(`${nom} n'a pas de signature (${nom}.sig)`)
      continue
    }
    const signature = o.signature(`${nom}.sig`).trim()
    if (!signature) throw new Error(`${nom}.sig est vide`)
    // Les apps exigent ce numéro (`requireSignedVersion`) : sans lui, ou avec un autre, chacune refuserait la mise à
    // jour, et une version publiée ne se refait pas sous le même numéro.
    const signee = versionSignee(signature)
    if (signee !== o.version) throw new Error(`${nom}.sig ${signee === null ? 'ne porte pas de numéro (version:)' : `est signé pour ${signee}`}, pas pour ${o.version}`)
    for (const cle of cles) platforms[cle] = { signature, url: o.adresse(nom) }
  }
  const manquantes = CLES_REQUISES.filter((c) => !platforms[c])
  if (manquantes.length) throw new Error(`Il manque des plateformes : ${manquantes.join(', ')}`)
  return { version: o.version, notes: o.notes, pub_date: o.date.toISOString().replace(/\.\d{3}Z$/, 'Z'), platforms }
}

/** `SHA256SUMS.txt` : de quoi vérifier un fichier téléchargé à la main (`shasum -a 256 -c SHA256SUMS.txt`). */
export function empreintes(fichiers: { nom: string; octets: Uint8Array }[]): string {
  return (
    [...fichiers]
      .sort((a, b) => a.nom.localeCompare(b.nom))
      .map((f) => `${createHash('sha256').update(f.octets).digest('hex')}  ${f.nom}`)
      .join('\n') + '\n'
  )
}

const racine = new URL('..', import.meta.url).pathname

function principal(args: string[]) {
  const [geste, ...reste] = args
  if (geste === 'notes') {
    const [version] = reste
    const notes = version ? notesDe(readFileSync(join(racine, 'docs/NOUVEAUTES.md'), 'utf8'), version) : null
    if (!notes) throw new Error(`Pas de notes pour ${version} dans docs/NOUVEAUTES.md : une version publiée dit ce qu'elle apporte.`)
    process.stdout.write(notes + '\n')
    return
  }
  if (geste === 'paquets') {
    const [bundle, plateforme, version, sortie] = reste
    if (!bundle || !sortie || !version || !VERSION.test(version) || !PLATEFORMES.includes(plateforme as Plateforme)) {
      throw new Error('paquets <dossier bundle> <plateforme> <version> <sortie>')
    }
    const fichiers: Record<string, string[]> = {}
    for (const d of readdirSync(bundle)) if (existsSync(join(bundle, d))) fichiers[d] = readdirSync(join(bundle, d))
    const liste = paquets(fichiers, plateforme as Plateforme, version)
    if (!liste.some((p) => p.nom.endsWith('.sig'))) throw new Error(`Aucun paquet signé dans ${bundle} : la clé de signature manque-t-elle ?`)
    mkdirSync(sortie, { recursive: true })
    for (const p of liste) {
      copyFileSync(join(bundle, p.source), join(sortie, p.nom))
      console.log(`${p.source} → ${p.nom}`)
    }
    return
  }
  if (geste === 'annonce') {
    const [dossier, version, depot] = reste
    if (!dossier || !version || !VERSION.test(version) || !depot || !/^[\w.-]+\/[\w.-]+$/.test(depot)) throw new Error('annonce <dossier> <version> <propriétaire/dépôt>')
    const notes = notesDe(readFileSync(join(racine, 'docs/NOUVEAUTES.md'), 'utf8'), version)
    if (!notes) throw new Error(`Pas de notes pour ${version} dans docs/NOUVEAUTES.md`)
    const noms = readdirSync(dossier).filter((n) => n !== 'latest.json' && n !== 'SHA256SUMS.txt')
    const a = annonce({
      version,
      notes,
      date: new Date(),
      noms,
      signature: (nom) => readFileSync(join(dossier, nom), 'utf8'),
      adresse: (nom) => `https://github.com/${depot}/releases/download/v${version}/${encodeURIComponent(nom)}`,
    })
    writeFileSync(join(dossier, 'latest.json'), JSON.stringify(a, null, 2) + '\n')
    writeFileSync(join(dossier, 'SHA256SUMS.txt'), empreintes(noms.map((nom) => ({ nom, octets: readFileSync(join(dossier, nom)) }))))
    console.log(`latest.json : ${Object.keys(a.platforms).join(', ')}`)
    return
  }
  throw new Error('geste attendu : notes, paquets ou annonce')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    principal(process.argv.slice(2))
  } catch (e) {
    console.error(`publication : ${(e as Error).message}`)
    process.exit(1)
  }
}
