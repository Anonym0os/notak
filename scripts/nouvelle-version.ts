/**
 * Prépare une nouvelle version de l'app de bureau, en une commande :
 *
 *   bun run nouvelle-version 0.2.0
 *
 * 1. vérifie que le numéro suit le précédent et que rien n'est en cours dans le dépôt ;
 * 2. fait des notes « À venir » de `docs/NOUVEAUTES.md` celles de la version (à défaut, la liste des commits depuis la
 *    version d'avant) ;
 * 3. écrit le numéro partout où il vit : `tauri.conf.json` (celui que voit l'app), `Cargo.toml` et `Cargo.lock` ;
 * 4. en fait un commit et une étiquette `v0.2.0`.
 *
 * Rien ne part : `git push origin HEAD v0.2.0` lance la publication (`docs/MISES-A-JOUR.md`), qui s'arrête sur un
 * brouillon à relire avant que les apps installées ne le voient.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { VERSION } from './publication.ts'

const racine = new URL('..', import.meta.url).pathname
const CONF = 'apps/bureau/src-tauri/tauri.conf.json'
const CARGO = 'apps/bureau/src-tauri/Cargo.toml'
const VERROU = 'apps/bureau/src-tauri/Cargo.lock'
const NOUVEAUTES = 'docs/NOUVEAUTES.md'
export const A_VENIR = '## À venir'

/** `a` vient-elle après `b` ? */
export function suit(a: string, b: string): boolean {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number))
  for (let i = 0; i < 3; i++) if (x![i]! !== y![i]!) return x![i]! > y![i]!
  return false
}

/** Le numéro remplacé dans chaque fichier, à sa place, sans rien toucher d'autre. */
export function avecVersion(fichier: 'conf' | 'cargo' | 'verrou', texte: string, version: string): string {
  const motif = {
    conf: /^(\s*"version":\s*")[^"]+(")/m,
    cargo: /^(\[package\][^[]*?\nversion = ")[^"]+(")/,
    verrou: /(\nname = "notak-bureau"\nversion = ")[^"]+(")/,
  }[fichier]
  if (!motif.test(texte)) throw new Error(`Pas de numéro de version à remplacer (${fichier})`)
  return texte.replace(motif, `$1${version}$2`)
}

/**
 * Les nouveautés avec la section de la version : les notes « À venir » prennent son numéro et sa date, et une section
 * « À venir » vide les remplace en tête. Sans notes, celles qu'on donne (les commits).
 */
export function avecNotes(md: string, version: string, date: string, aDefaut: string): { md: string; notes: string } {
  if (new RegExp(`^## ${version.replace(/\./g, '\\.')}(\\s|$)`, 'm').test(md)) throw new Error(`${NOUVEAUTES} a déjà une section ${version}`)
  const lignes = md.split('\n')
  const debut = lignes.indexOf(A_VENIR)
  const titre = `## ${version} — ${date}`
  if (debut < 0) {
    // Pas de section « À venir » : la version se pose sous le titre du fichier.
    const apresTitre = lignes.findIndex((l) => l.startsWith('## '))
    const i = apresTitre < 0 ? lignes.length : apresTitre
    lignes.splice(i, 0, A_VENIR, '', titre, '', aDefaut, '')
    return { md: lignes.join('\n'), notes: aDefaut }
  }
  const fin = lignes.findIndex((l, i) => i > debut && l.startsWith('## '))
  const corps = lignes.slice(debut + 1, fin < 0 ? undefined : fin).join('\n').trim()
  const notes = corps || aDefaut
  lignes.splice(debut, (fin < 0 ? lignes.length : fin) - debut, A_VENIR, '', titre, '', notes, '')
  return { md: lignes.join('\n'), notes }
}

const git = (...args: string[]) => execFileSync('git', args, { cwd: racine, encoding: 'utf8' }).trim()
const lire = (f: string) => readFileSync(join(racine, f), 'utf8')
const ecrire = (f: string, t: string) => writeFileSync(join(racine, f), t)

function principal(version: string | undefined) {
  if (!version || !VERSION.test(version)) throw new Error('bun run nouvelle-version <x.y.z>, par exemple 0.2.0')
  const avant = (JSON.parse(lire(CONF)) as { version: string }).version
  if (!suit(version, avant)) throw new Error(`${version} ne suit pas la version actuelle (${avant}) : les apps installées ne la prendraient pas`)
  if (git('status', '--porcelain')) throw new Error('Le dépôt a du travail en cours : commitez-le ou mettez-le de côté avant de préparer une version')
  if (git('tag', '--list', `v${version}`)) throw new Error(`L'étiquette v${version} existe déjà`)

  // Les commits depuis la version d'avant, si personne n'a écrit les notes.
  const precedente = git('tag', '--list', 'v*', '--sort=-v:refname').split('\n').find(Boolean)
  const commits = git('log', '--no-merges', '--pretty=format:- %s', ...(precedente ? [`${precedente}..HEAD`] : ['-n', '30']))
  const date = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const { md, notes } = avecNotes(lire(NOUVEAUTES), version, date, commits || '- Corrections et améliorations.')

  ecrire(NOUVEAUTES, md)
  ecrire(CONF, avecVersion('conf', lire(CONF), version))
  ecrire(CARGO, avecVersion('cargo', lire(CARGO), version))
  ecrire(VERROU, avecVersion('verrou', lire(VERROU), version))
  git('add', NOUVEAUTES, CONF, CARGO, VERROU)
  git('commit', '-q', '-m', `Bureau : version ${version}`)
  git('tag', '-a', `v${version}`, '-m', `Notak ${version}\n\n${notes}`)

  console.log(`\nNotak ${version} est prête à partir. Ses notes :\n\n${notes}\n`)
  console.log(`Pour la publier :  git push origin HEAD v${version}`)
  console.log('GitHub construit et signe les apps, puis prépare un brouillon : relisez-le, essayez-le, et « Publish release ».')
  console.log(`Pour renoncer avant d'avoir poussé :  git tag -d v${version} && git reset --hard HEAD~1`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    principal(process.argv[2])
  } catch (e) {
    console.error(`nouvelle-version : ${(e as Error).message}`)
    process.exit(1)
  }
}
