import type { Node as NoeudPM } from '@tiptap/pm/model'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { langageDe } from './code'

/**
 * La coloration du code (docs/NOTION.md § 2) : un petit analyseur lexical maison, sans dépendance. `jetons` rend les
 * passages à colorer d'un texte selon son langage (une fonction pure, linéaire, qui ne lève jamais) ; le plugin pose
 * ces passages en décorations sur chaque bloc de code ; `colorerCode` fait de même sur un rendu figé.
 */

export type Genre = 'motCle' | 'chaine' | 'commentaire' | 'nombre' | 'fonction' | 'type' | 'propriete' | 'operateur' | 'balise' | 'attribut' | 'variable'

/** Un passage coloré : `[de, a[` dans le texte du code. Les jetons sont rendus dans l'ordre, sans chevauchement. */
export interface Jeton {
  de: number
  a: number
  genre: Genre
}

/** Au-delà, on ne colore plus : un texte colossal ne doit pas figer l'éditeur. */
const TAILLE_MAX = 400_000

/* ── La table des langages ─────────────────────────────────────────────────────────────────────────────────────── */

interface Extra {
  /** Les caractères qui peuvent ouvrir ce motif. */
  debuts: string
  re: RegExp
  genre: Genre
  /** Seulement après une espace ou en tête de texte (les options du shell). */
  apresEspace?: boolean
}

interface Def {
  lignes?: readonly string[]
  blocs?: readonly (readonly [string, string])[]
  /** Chaînes sur une ligne, où `\` échappe. */
  guillemets?: string
  /** Chaînes sans échappement, qui peuvent courir sur plusieurs lignes (`'` du shell et du SQL, `` ` `` de Go). */
  libres?: string
  /** Les chaînes à guillemets peuvent courir sur plusieurs lignes. */
  multiligne?: boolean
  triples?: readonly string[]
  /** Le gabarit `` `…${…}…` `` de JavaScript. */
  gabarit?: boolean
  mots: string
  /** Les valeurs littérales (true, null…), colorées comme des nombres. */
  litt?: string
  types?: string
  insensible?: boolean
  /** Un nom en PascalCase est un type. */
  majuscule?: boolean
  /** Après un point, un nom n'est plus un mot-clé. */
  membre?: boolean
  /** Une clé suivie de `:` : dans un objet (après `{` ou `,`), partout (JSON), ou à la YAML (`:` suivi d'une espace). */
  cles?: 'objet' | 'toujours' | 'yaml'
  prepro?: boolean
  macro?: boolean
  apostrophe?: 'rust'
  prefixes?: string
  ops?: string
  ident?: RegExp
  extras?: readonly Extra[]
  /** Un commentaire de ligne doit suivre une espace (shell, YAML). */
  commentaireApresEspace?: boolean
  mode?: 'html' | 'css' | 'markdown' | 'shell'
}

const IDENT = /[\p{L}_$][\p{L}\p{N}_$]*/uy
const IDENT_YAML = /[\p{L}_](?:[\p{L}\p{N}_]|[-./](?=[\p{L}\p{N}_]))*/uy
const MOT_SHELL = /[^\s;|&<>()"'`$\\#={}]+/y
const NOMBRE = /(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)[a-zA-Z]{0,3}/y
const NOMBRE_POINT = /\.\d[\d_]*(?:[eE][+-]?\d+)?[a-zA-Z]{0,3}/y
const CARACTERE_RUST = /'(?:\\(?:u\{[0-9a-fA-F_]{1,6}\}|x[0-9a-fA-F]{2}|.)|[^\\'\n])'/y
const DUREE_RUST = /'[A-Za-z_]\w*/y
const PREPRO = /#[ \t]*[A-Za-z_]+/y
const INCLUSION = /[ \t]*<[^>\n]{0,200}>/y

const C_BLOCS = [['/*', '*/']] as const
const OPS_C = '+-*/%=<>!&|^~?'

const MOTS_JS =
  'as async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield'
const LITT_JS = 'true false null undefined NaN Infinity'

const JS: Def = {
  lignes: ['//'],
  blocs: C_BLOCS,
  guillemets: '"\'',
  gabarit: true,
  mots: MOTS_JS,
  litt: LITT_JS,
  majuscule: true,
  membre: true,
  cles: 'objet',
  ops: OPS_C,
  extras: [{ debuts: '@', re: /@[\p{L}_$][\w$.]*/uy, genre: 'attribut' }],
}

const TS: Def = {
  ...JS,
  mots: `${MOTS_JS} abstract declare enum implements interface namespace private protected public readonly type keyof satisfies infer override module`,
  types: 'string number boolean any unknown never object symbol bigint',
}

const C_BASE: Def = { lignes: ['//'], blocs: C_BLOCS, guillemets: '"\'', mots: '', membre: true, ops: OPS_C }

const TYPES_C = 'int char float double void long short signed unsigned bool size_t ssize_t uint8_t uint16_t uint32_t uint64_t int8_t int16_t int32_t int64_t FILE'
const MOTS_C = 'auto break case const continue default do else enum extern for goto if inline register restrict return sizeof static struct switch typedef union volatile while'

const DEFS: Record<string, Def> = {
  javascript: JS,
  typescript: TS,
  c: { ...C_BASE, prepro: true, mots: MOTS_C, litt: 'NULL true false', types: TYPES_C },
  cpp: {
    ...C_BASE,
    prepro: true,
    triples: ['R"('],
    mots: `${MOTS_C} class namespace template typename public private protected virtual override final new delete this using try catch throw operator friend explicit constexpr noexcept static_cast dynamic_cast const_cast reinterpret_cast`,
    litt: 'nullptr NULL true false',
    types: `${TYPES_C} string vector map auto wchar_t`,
  },
  csharp: {
    ...C_BASE,
    prepro: true,
    triples: ['"""'],
    majuscule: true,
    mots: 'abstract as base break case catch checked class const continue default delegate do else enum event explicit extern finally fixed for foreach goto if implicit in interface internal is lock namespace new operator out override params private protected public readonly ref return sealed sizeof static struct switch this throw try typeof unchecked unsafe using virtual volatile while var async await yield',
    litt: 'true false null',
    types: 'bool byte char decimal double float int long object sbyte short string uint ulong ushort void dynamic',
  },
  java: {
    ...C_BASE,
    triples: ['"""'],
    majuscule: true,
    mots: 'abstract assert break case catch class const continue default do else enum extends final finally for goto if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try volatile while var record sealed permits yield',
    litt: 'true false null',
    types: 'boolean byte char double float int long short void',
    extras: [{ debuts: '@', re: /@[\p{L}_$][\w$.]*/uy, genre: 'attribut' }],
  },
  go: {
    ...C_BASE,
    cles: 'objet',
    guillemets: '"\'',
    libres: '`',
    mots: 'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var',
    litt: 'true false nil iota',
    types: 'bool byte complex64 complex128 error float32 float64 int int8 int16 int32 int64 rune string uint uint8 uint16 uint32 uint64 uintptr any',
  },
  kotlin: {
    ...C_BASE,
    triples: ['"""'],
    majuscule: true,
    mots: 'abstract annotation as break catch class companion const constructor continue crossinline data do else enum external final finally for fun if import in infix init inline inner interface internal is lateinit noinline object open operator override package private protected public reified return sealed super suspend tailrec this throw try typealias val var vararg when while',
    litt: 'true false null',
    types: 'Int Long Short Byte Float Double Boolean Char String Unit Any Nothing',
    extras: [{ debuts: '@', re: /@[\p{L}_$][\w$.]*/uy, genre: 'attribut' }],
  },
  swift: {
    ...C_BASE,
    triples: ['"""'],
    majuscule: true,
    mots: 'associatedtype break case catch class continue default defer deinit do else enum extension fallthrough fileprivate for func guard if import in init inout internal is let open operator private protocol public repeat rethrows return self Self static struct subscript super switch throw throws try typealias var where while async await actor some any',
    litt: 'true false nil',
    types: 'Int Double Float Bool String Character Void Any',
    extras: [{ debuts: '@', re: /@[\p{L}_$][\w$.]*/uy, genre: 'attribut' }],
  },
  rust: {
    ...C_BASE,
    cles: 'objet',
    guillemets: '"',
    apostrophe: 'rust',
    macro: true,
    majuscule: true,
    mots: 'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while',
    litt: 'true false',
    types: 'bool char f32 f64 i8 i16 i32 i64 i128 isize u8 u16 u32 u64 u128 usize str',
    extras: [{ debuts: '#', re: /#!?\[[^\]\n]{0,200}\]/y, genre: 'attribut' }],
  },
  php: {
    lignes: ['//', '#'],
    blocs: C_BLOCS,
    guillemets: '"\'',
    insensible: true,
    majuscule: true,
    membre: true,
    ops: '+-*/%=<>!&|^~?.',
    mots: 'abstract and as break callable case catch class clone const continue declare default do echo else elseif empty extends final finally fn for foreach function global goto if implements include include_once instanceof insteadof interface isset list match namespace new or print private protected public readonly require require_once return static switch throw trait try unset use var while xor yield',
    litt: 'true false null',
    types: 'int float string bool array object void mixed iterable callable self',
    extras: [
      { debuts: '$', re: /\$[\p{L}_]\w*/uy, genre: 'variable' },
      { debuts: '<?', re: /<\?(?:php|=)?|\?>/y, genre: 'balise' },
    ],
  },
  python: {
    lignes: ['#'],
    guillemets: '"\'',
    triples: ['"""', "'''"],
    prefixes: 'rbfu',
    majuscule: true,
    membre: true,
    ops: '+-*/%=<>!&|^~',
    mots: 'and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield',
    litt: 'True False None',
    types: 'int float str bool list dict set tuple bytes complex object',
    extras: [{ debuts: '@', re: /@[\p{L}_][\w.]*/uy, genre: 'attribut' }],
  },
  ruby: {
    lignes: ['#'],
    blocs: [['=begin', '=end']],
    guillemets: '"\'',
    majuscule: true,
    membre: true,
    cles: 'objet',
    ops: '+-*/%=<>!&|^~?',
    mots: 'alias and begin break case class def do else elsif end ensure for if in module next not or redo rescue retry return self super then undef unless until when while yield',
    litt: 'true false nil',
    extras: [
      { debuts: '@$', re: /(?:@@?|\$)[\p{L}_]\w*/uy, genre: 'variable' },
      { debuts: ':', re: /(?<![\p{L}\d_:]):[\p{L}_]\w*[?!]?/uy, genre: 'propriete' },
    ],
  },
  sql: {
    lignes: ['--'],
    blocs: C_BLOCS,
    libres: "'",
    guillemets: '"`',
    multiligne: true,
    insensible: true,
    ops: '+-*/%=<>!|',
    mots: 'select from where and or not in is like between exists insert into values update set delete create alter drop table index view database schema primary key foreign references unique default check constraint join inner left right full outer cross on group by order having limit offset union all distinct as case when then else end asc desc with recursive begin commit rollback transaction truncate grant revoke returning using natural if cascade add column rename to over partition',
    litt: 'null true false',
    types: 'int integer bigint smallint tinyint serial bigserial text varchar char boolean bool date time timestamp timestamptz datetime decimal numeric float double real json jsonb uuid blob bytea',
  },
  bash: {
    mode: 'shell',
    lignes: ['#'],
    commentaireApresEspace: true,
    guillemets: '"',
    libres: "'",
    multiligne: true,
    ops: '|&;<>',
    mots: 'if then else elif fi for while until do done case esac in function select local export readonly declare unset return exit break continue source',
    extras: [
      { debuts: '$', re: /\$(?:\{[^}\n]{0,200}\}|[\p{L}_]\w*|[0-9@#?*!$-])/uy, genre: 'variable' },
      { debuts: '-', re: /-{1,2}[A-Za-z][\w-]*/y, genre: 'attribut', apresEspace: true },
    ],
  },
  json: { lignes: ['//'], blocs: C_BLOCS, guillemets: '"', cles: 'toujours', mots: '', litt: 'true false null' },
  yaml: {
    lignes: ['#'],
    commentaireApresEspace: true,
    guillemets: '"\'',
    cles: 'yaml',
    ident: IDENT_YAML,
    ops: '-|>',
    mots: '',
    litt: 'true false null yes no on off',
    extras: [{ debuts: '&*', re: /[&*][\w-]+/y, genre: 'variable' }],
  },
  css: { mode: 'css', mots: '' },
  html: { mode: 'html', mots: '' },
  markdown: { mode: 'markdown', mots: '' },
}

/** Les noms qui ne sont pas dans le menu mais qu'on tape volontiers après ```. */
const AUTRES: Record<string, string> = { jsx: 'javascript', mjs: 'javascript', cjs: 'javascript', tsx: 'typescript', jsonc: 'json', scss: 'css', less: 'css', xml: 'html', svg: 'html', vue: 'html', golang: 'go', 'objective-c': 'c', h: 'c', hpp: 'cpp', cc: 'cpp', mysql: 'sql', postgres: 'sql', postgresql: 'sql', sqlite: 'sql', fish: 'bash', console: 'bash' }

interface Langue {
  def: Def
  mots: Set<string>
  litt: Set<string>
  types: Set<string>
  ident: RegExp
}

const mots = (s: string | undefined) => new Set((s ?? '').split(/\s+/).filter(Boolean))
const COMPILES = new Map<string, Langue | null>()

function langue(nom: string): Langue | null {
  const cle = DEFS[nom] ? nom : (AUTRES[nom] ?? nom)
  const connu = COMPILES.get(cle)
  if (connu !== undefined) return connu
  const def = DEFS[cle]
  const compile: Langue | null = def
    ? { def, mots: mots(def.insensible ? def.mots.toLowerCase() : def.mots), litt: mots(def.insensible ? def.litt?.toLowerCase() : def.litt), types: mots(def.insensible ? def.types?.toLowerCase() : def.types), ident: def.ident ?? IDENT }
    : null
  COMPILES.set(cle, compile)
  return compile
}

/** Les langages qu'on sait colorer, tels qu'ils sont nommés dans la table. */
export const LANGAGES_COLORES: readonly string[] = Object.keys(DEFS)

/* ── Les briques communes ──────────────────────────────────────────────────────────────────────────────────────── */

const estEspace = (c: string | undefined) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f'

/** La fin (exclue) d'une chaîne ouverte en `debut` par le guillemet `q` : au guillemet fermant, sinon à la fin de la ligne. */
function lireChaine(texte: string, debut: number, q: string, multiligne: boolean): number {
  const n = texte.length
  let j = debut + 1
  while (j < n) {
    const c = texte[j]
    if (c === '\\') j += 2
    else if (c === q) return j + 1
    else if (c === '\n' && !multiligne) return j
    else j++
  }
  return n
}

/** Le premier non-blanc de la ligne de `i`, ou le début du texte, est-il `i` ? */
function enTeteDeLigne(texte: string, i: number): boolean {
  let j = i - 1
  while (j >= 0 && (texte[j] === ' ' || texte[j] === '\t')) j--
  return j < 0 || texte[j] === '\n'
}

/* ── Le moteur générique (les langages à accolades, Python, Ruby, SQL, shell, JSON, YAML) ─────────────────────────── */

function moteur(texte: string, L: Langue, base: number, sortie: Jeton[], niveau: number): void {
  const n = texte.length
  const d = L.def
  const shell = d.mode === 'shell'
  const pousser = (de: number, a: number, genre: Genre) => {
    if (a > de) sortie.push({ de: base + de, a: base + Math.min(a, n), genre })
  }
  const suitParenthese = (j: number): boolean => {
    while (j < n && (texte[j] === ' ' || texte[j] === '\t')) j++
    if (texte[j] === '(') return true
    return !!d.macro && texte[j] === '!' && (texte[j + 1] === '(' || texte[j + 1] === '[' || texte[j + 1] === '{')
  }
  const cleSuit = (j: number, strict: boolean): boolean => {
    while (j < n && (texte[j] === ' ' || texte[j] === '\t')) j++
    if (texte[j] !== ':' || texte[j + 1] === ':') return false
    if (!strict) return true
    const s = texte[j + 1]
    return s === undefined || estEspace(s)
  }
  const commentaireEn = (j: number): boolean => !!d.lignes?.some((o) => texte.startsWith(o, j)) || !!d.blocs?.some(([o]) => texte.startsWith(o, j))

  /** Une chaîne ouverte en `j` : sa fin, ou -1 si ce n'en est pas une. */
  const chaineEn = (j: number): number => {
    const c = texte[j]!
    for (const q3 of d.triples ?? []) {
      if (!texte.startsWith(q3, j)) continue
      const fermant = q3 === 'R"(' ? ')"' : q3
      let k = texte.indexOf(fermant, j + q3.length)
      while (k > 0 && texte[k - 1] === '\\' && fermant !== ')"') k = texte.indexOf(fermant, k + 1)
      return k < 0 ? n : k + fermant.length
    }
    if (d.apostrophe === 'rust' && c === "'") {
      CARACTERE_RUST.lastIndex = j
      const m = CARACTERE_RUST.exec(texte)
      return m ? j + m[0].length : -1
    }
    if (d.libres?.includes(c)) {
      const k = texte.indexOf(c, j + 1)
      return k < 0 ? n : k + 1
    }
    if (d.guillemets?.includes(c)) return lireChaine(texte, j, c, !!d.multiligne)
    return -1
  }

  /** Un gabarit JavaScript : le texte est chaîne, chaque `${…}` est du code. */
  const gabarit = (debut: number): number => {
    let seg = debut
    let j = debut + 1
    while (j < n) {
      const c = texte[j]
      if (c === '\\') j += 2
      else if (c === '`') {
        pousser(seg, j + 1, 'chaine')
        return j + 1
      } else if (c === '$' && texte[j + 1] === '{' && niveau < 6) {
        pousser(seg, j + 2, 'chaine')
        const fin = parcourir(j + 2, true, niveau + 1)
        if (fin >= n) return n
        seg = fin
        j = fin + 1
      } else j++
    }
    pousser(seg, n, 'chaine')
    return n
  }

  /** Parcourt le texte depuis `depart` ; avec `accolade`, s'arrête sur l'accolade fermante qui clôt un `${`. */
  const parcourir = (depart: number, accolade: boolean, prof: number): number => {
    const sauve = niveau
    niveau = prof
    let i = depart
    let profAcc = 0
    let prec = ''
    let commande = true
    while (i < n) {
      const c = texte.charCodeAt(i)
      if (c === 10) {
        if (shell && texte[i - 1] !== '\\') commande = true
        i++
        continue
      }
      if (c <= 32) {
        i++
        continue
      }
      const ch = texte[i]!

      // Les commentaires.
      let trouve = false
      for (const o of d.lignes ?? []) {
        if (!texte.startsWith(o, i)) continue
        if (d.commentaireApresEspace && i > 0 && !estEspace(texte[i - 1]) && !/[;|&(]/.test(texte[i - 1]!)) continue
        const fin = texte.indexOf('\n', i)
        const f = fin < 0 ? n : fin
        pousser(i, f, 'commentaire')
        i = f
        trouve = true
        break
      }
      if (trouve) continue
      for (const [o, f] of d.blocs ?? []) {
        if (!texte.startsWith(o, i)) continue
        if (o === '=begin' && !enTeteDeLigne(texte, i)) continue
        const k = texte.indexOf(f, i + o.length)
        const fin = k < 0 ? n : k + f.length
        pousser(i, fin, 'commentaire')
        i = fin
        trouve = true
        break
      }
      if (trouve) continue

      // Les directives du préprocesseur : `#include <stdio.h>`.
      if (d.prepro && ch === '#' && enTeteDeLigne(texte, i)) {
        PREPRO.lastIndex = i
        const m = PREPRO.exec(texte)
        if (m) {
          pousser(i, i + m[0].length, 'motCle')
          i += m[0].length
          if (/include|import/.test(m[0])) {
            INCLUSION.lastIndex = i
            const inc = INCLUSION.exec(texte)
            if (inc) {
              pousser(i + inc[0].indexOf('<'), i + inc[0].length, 'chaine')
              i += inc[0].length
            }
          }
          continue
        }
      }

      // Les motifs propres au langage (variables, annotations…).
      if (d.extras) {
        for (const e of d.extras) {
          if (!e.debuts.includes(ch)) continue
          if (e.apresEspace && i > 0 && !estEspace(texte[i - 1]) && !/[;|&(]/.test(texte[i - 1]!)) continue
          e.re.lastIndex = i
          const m = e.re.exec(texte)
          if (!m || !m[0].length) continue
          pousser(i, i + m[0].length, e.genre)
          i += m[0].length
          prec = texte[i - 1]!
          commande = false
          trouve = true
          break
        }
        if (trouve) continue
      }

      // Les chaînes.
      if (d.gabarit && ch === '`') {
        i = gabarit(i)
        prec = '`'
        continue
      }
      const finChaine = chaineEn(i)
      if (finChaine >= 0) {
        const estCle = d.cles && (d.cles === 'objet' ? prec === '{' || prec === ',' : true) && cleSuit(finChaine, d.cles === 'yaml')
        pousser(i, finChaine, estCle ? 'propriete' : 'chaine')
        i = finChaine
        prec = ch
        commande = false
        continue
      }
      if (d.apostrophe === 'rust' && ch === "'") {
        DUREE_RUST.lastIndex = i
        const m = DUREE_RUST.exec(texte)
        if (m) {
          pousser(i, i + m[0].length, 'type')
          i += m[0].length
          continue
        }
      }

      // Le shell lit des mots, pas des identifiants ni des nombres.
      if (shell) {
        MOT_SHELL.lastIndex = i
        const m = MOT_SHELL.exec(texte)
        if (m) {
          const mot = m[0]
          const fin = i + mot.length
          let genre: Genre | null = null
          if (L.mots.has(mot)) {
            genre = 'motCle'
            commande = /^(?:if|then|else|elif|do|while|until)$/.test(mot)
          } else if (commande && texte[fin] === '=') {
            genre = 'variable'
            commande = true
          } else if (commande) {
            genre = 'fonction'
            commande = false
          } else {
            if (/^\d+(?:\.\d+)?$/.test(mot)) genre = 'nombre'
            commande = false
          }
          if (genre) pousser(i, fin, genre)
          i = fin
          prec = texte[fin - 1]!
          continue
        }
      }

      // Les nombres.
      if ((c >= 48 && c <= 57) || (ch === '.' && texte.charCodeAt(i + 1) >= 48 && texte.charCodeAt(i + 1) <= 57 && !/[\w)\]]/.test(texte[i - 1] ?? ' '))) {
        const re = ch === '.' ? NOMBRE_POINT : NOMBRE
        re.lastIndex = i
        const m = re.exec(texte)
        if (m) {
          pousser(i, i + m[0].length, 'nombre')
          i += m[0].length
          prec = '0'
          continue
        }
      }

      // Les identifiants : mots-clés, valeurs, types, appels, clés.
      L.ident.lastIndex = i
      const m = L.ident.exec(texte)
      if (m) {
        const mot = m[0]
        const fin = i + mot.length
        // Un préfixe de chaîne colle au guillemet : f"…", b'…'.
        if (d.prefixes && mot.length <= 2 && (texte[fin] === '"' || texte[fin] === "'") && [...mot.toLowerCase()].every((x) => d.prefixes!.includes(x))) {
          const f = chaineEn(fin)
          if (f >= 0) {
            pousser(i, f, 'chaine')
            i = f
            prec = texte[f - 1]!
            continue
          }
        }
        const bas = d.insensible ? mot.toLowerCase() : mot
        const appel = d.cles !== 'yaml' && suitParenthese(fin)
        let genre: Genre | null = null
        if (d.membre && texte[i - 1] === '.' && texte[i - 2] !== '.') genre = appel ? 'fonction' : null
        else if (d.cles === 'yaml' && cleSuit(fin, true)) genre = 'propriete'
        else if (L.mots.has(bas)) genre = 'motCle'
        else if (L.litt.has(bas)) genre = 'nombre'
        else if (L.types.has(bas)) genre = 'type'
        else if (appel) genre = 'fonction'
        else if (d.cles === 'objet' && (prec === '{' || prec === ',') && cleSuit(fin, false)) genre = 'propriete'
        else if (d.majuscule && /^\p{Lu}/u.test(mot) && (mot.length === 1 || /\p{Ll}/u.test(mot))) genre = 'type'
        if (genre) pousser(i, fin, genre)
        i = fin
        prec = texte[fin - 1]!
        commande = false
        continue
      }

      // Les accolades (celles d'un `${` comptent), les opérateurs, le reste.
      if (ch === '{') profAcc++
      else if (ch === '}') {
        if (accolade && profAcc === 0) {
          niveau = sauve
          return i
        }
        if (profAcc > 0) profAcc--
      } else if (d.ops && d.ops.includes(ch)) {
        let j = i + 1
        while (j < n && d.ops.includes(texte[j]!) && !commentaireEn(j)) j++
        pousser(i, j, 'operateur')
        if (shell) commande = /[;|&]/.test(texte.slice(i, j))
        prec = texte[j - 1]!
        i = j
        continue
      } else if (shell && ch === '(') commande = true
      prec = ch
      i++
    }
    niveau = sauve
    return n
  }

  parcourir(0, false, niveau)
}

/* ── CSS ───────────────────────────────────────────────────────────────────────────────────────────────────────── */

const CSS_IDENT = /-{0,2}[A-Za-z_ -￿][\w -￿-]*/y
const CSS_NOMBRE = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?(?:[a-zA-Z]+|%)?/y
const CSS_HEX = /#[0-9a-fA-F]{3,8}(?![\w-])/y
const CSS_CLASSE = /[.#]-?[A-Za-z_ -￿][\w -￿-]*/y
const CSS_PSEUDO = /::?-?[A-Za-z_][\w-]*/y
const CSS_AT = /@[A-Za-z-]+/y
const CSS_IMPORTANT = /![ \t]*[A-Za-z]+/y
const MOTS_AT = new Set(['and', 'or', 'not', 'only', 'screen', 'print', 'all', 'from', 'to'])

/** Le passage qui s'ouvre en `i` est-il un sélecteur (il se termine par `{`) plutôt qu'une déclaration (par `;` ou `}`) ? */
function estSelecteur(texte: string, i: number): boolean {
  const limite = Math.min(texte.length, i + 4000)
  let parens = 0
  for (let j = i; j < limite; j++) {
    const c = texte[j]
    if (c === '"' || c === "'") j = lireChaine(texte, j, c, false) - 1
    else if (c === '/' && texte[j + 1] === '*') {
      const k = texte.indexOf('*/', j + 2)
      if (k < 0) return false
      j = k + 1
    } else if (c === '(') parens++
    else if (c === ')') {
      if (parens > 0) parens--
    } else if (c === '{') return true
    else if (c === '}') return false
    else if (c === ';' && parens === 0) return false
  }
  return false
}

function css(texte: string, base: number, sortie: Jeton[]): void {
  const n = texte.length
  const pousser = (de: number, a: number, genre: Genre) => {
    if (a > de) sortie.push({ de: base + de, a: base + a, genre })
  }
  const lire = (re: RegExp, i: number) => {
    re.lastIndex = i
    return re.exec(texte)
  }
  let i = 0
  let debut = true
  let mode: 'sel' | 'decl' | 'at' = 'decl'
  let valeur = false
  let parens = 0
  while (i < n) {
    const c = texte[i]!
    if (estEspace(c)) {
      i++
      continue
    }
    if (c === '/' && texte[i + 1] === '*') {
      const k = texte.indexOf('*/', i + 2)
      const fin = k < 0 ? n : k + 2
      pousser(i, fin, 'commentaire')
      i = fin
      continue
    }
    if (c === '{' || c === '}' || (c === ';' && parens === 0)) {
      debut = true
      valeur = false
      parens = 0
      i++
      continue
    }
    if (debut) {
      debut = false
      valeur = false
      mode = c === '@' ? 'at' : estSelecteur(texte, i) ? 'sel' : 'decl'
    }
    if (c === '"' || c === "'") {
      const fin = lireChaine(texte, i, c, false)
      pousser(i, fin, 'chaine')
      i = fin
      continue
    }
    if (c === '(') {
      parens++
      i++
      continue
    }
    if (c === ')') {
      if (parens > 0) parens--
      i++
      continue
    }
    if (c === ':' && mode === 'decl' && !valeur && texte[i + 1] !== ':') {
      valeur = true
      i++
      continue
    }
    let m: RegExpExecArray | null
    if (c === '@' && (m = lire(CSS_AT, i))) {
      pousser(i, i + m[0].length, 'motCle')
      i += m[0].length
      continue
    }
    if (mode === 'sel') {
      if ((c === '.' || c === '#') && (m = lire(CSS_CLASSE, i))) pousser(i, i + m[0].length, 'balise')
      else if (c === '[') {
        const k = texte.indexOf(']', i)
        const fin = k < 0 ? n : k + 1
        pousser(i, fin, 'attribut')
        i = fin
        continue
      } else if (c === ':' && (m = lire(CSS_PSEUDO, i))) pousser(i, i + m[0].length, 'attribut')
      else if ((m = lire(CSS_NOMBRE, i)) && /[\d]/.test(c)) pousser(i, i + m[0].length, 'nombre')
      else if ((m = lire(CSS_IDENT, i))) pousser(i, i + m[0].length, 'balise')
      i += m ? m[0].length : 1
      continue
    }
    // Une déclaration (propriété puis valeur) ou le préambule d'une règle en @.
    if (c === '#' && (m = lire(CSS_HEX, i))) pousser(i, i + m[0].length, 'nombre')
    else if (c === '!' && (m = lire(CSS_IMPORTANT, i))) pousser(i, i + m[0].length, 'motCle')
    else if ((/[\d.]/.test(c) || (c === '-' && /[\d.]/.test(texte[i + 1] ?? ''))) && (m = lire(CSS_NOMBRE, i))) pousser(i, i + m[0].length, 'nombre')
    else if ((m = lire(CSS_IDENT, i))) {
      const mot = m[0]
      let j = i + mot.length
      while (j < n && (texte[j] === ' ' || texte[j] === '\t')) j++
      if (mode === 'decl' && !valeur) {
        if (texte[j] === ':') pousser(i, i + mot.length, 'propriete')
      } else if (texte[j] === '(') pousser(i, i + mot.length, 'fonction')
      else if (mode === 'at' && texte[j] === ':') pousser(i, i + mot.length, 'propriete')
      else if (mot.startsWith('--')) pousser(i, i + mot.length, 'variable')
      else if (mode === 'at' && MOTS_AT.has(mot)) pousser(i, i + mot.length, 'motCle')
    }
    i += m ? m[0].length : 1
  }
}

/* ── HTML et XML (avec le script et le style qu'ils portent) ──────────────────────────────────────────────────────── */

const HTML_BALISE = /<\/?[A-Za-z][\w:.-]*/y
const HTML_ATTRIBUT = /[^\s"'<>/=]+/y
const HTML_VALEUR = /[^\s"'<>]+/y

function html(texte: string, base: number, sortie: Jeton[], niveau: number): void {
  const n = texte.length
  const pousser = (de: number, a: number, genre: Genre) => {
    if (a > de) sortie.push({ de: base + de, a: base + a, genre })
  }
  let i = 0
  while (i < n) {
    i = texte.indexOf('<', i)
    if (i < 0) return
    if (texte.startsWith('<!--', i)) {
      const k = texte.indexOf('-->', i + 4)
      const fin = k < 0 ? n : k + 3
      pousser(i, fin, 'commentaire')
      i = fin
      continue
    }
    if (texte[i + 1] === '!' || texte[i + 1] === '?') {
      const k = texte.indexOf('>', i + 2)
      const fin = k < 0 ? n : k + 1
      pousser(i, fin, 'commentaire')
      i = fin
      continue
    }
    HTML_BALISE.lastIndex = i
    const m = HTML_BALISE.exec(texte)
    if (!m) {
      i++
      continue
    }
    const ouvrante = m[0][1] !== '/'
    const nom = m[0].replace(/^<\/?/, '').toLowerCase()
    pousser(i, i + m[0].length, 'balise')
    i += m[0].length
    let auto = false
    while (i < n) {
      const c = texte[i]!
      if (estEspace(c)) i++
      else if (c === '>') {
        pousser(i, i + 1, 'balise')
        i++
        break
      } else if (c === '/' && texte[i + 1] === '>') {
        pousser(i, i + 2, 'balise')
        i += 2
        auto = true
        break
      } else if (c === '<') break
      else if (c === '"' || c === "'") {
        const k = texte.indexOf(c, i + 1)
        const fin = k < 0 ? n : k + 1
        pousser(i, fin, 'chaine')
        i = fin
      } else if (c === '=') {
        i++
        while (i < n && estEspace(texte[i])) i++
        HTML_VALEUR.lastIndex = i
        const v = texte[i] === '"' || texte[i] === "'" ? null : HTML_VALEUR.exec(texte)
        if (v) {
          pousser(i, i + v[0].length, 'chaine')
          i += v[0].length
        }
      } else {
        HTML_ATTRIBUT.lastIndex = i
        const a = HTML_ATTRIBUT.exec(texte)
        if (a) {
          pousser(i, i + a[0].length, 'attribut')
          i += a[0].length
        } else i++
      }
    }
    // Le script et le style portent leur propre langage jusqu'à leur balise fermante.
    if (ouvrante && !auto && (nom === 'script' || nom === 'style') && niveau < 1) {
      const re = new RegExp(`</${nom}`, 'gi')
      re.lastIndex = i
      const r = re.exec(texte)
      const fin = r ? r.index : n
      if (fin > i) {
        const sous = texte.slice(i, fin)
        if (nom === 'style') css(sous, base + i, sortie)
        else moteur(sous, langue('javascript')!, base + i, sortie, 1)
      }
      i = fin
    }
  }
}

/* ── Markdown ──────────────────────────────────────────────────────────────────────────────────────────────────────── */

const MD_TITRE = /^ {0,3}#{1,6}(?:\s|$)/
const MD_CLOTURE = /^ {0,3}(?:```|~~~)/
const MD_LISTE = /^\s{0,12}(?:[-*+]|\d{1,9}[.)])\s/
const MD_CITATION = /^\s{0,3}>/
const MD_REGLE = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/
const MD_EN_LIGNE = /`[^`\n]{1,500}`|\[[^\]\n]{0,200}\]\([^)\n]{0,500}\)/g

function markdown(texte: string, base: number, sortie: Jeton[]): void {
  const n = texte.length
  const pousser = (de: number, a: number, genre: Genre) => {
    if (a > de) sortie.push({ de: base + de, a: base + a, genre })
  }
  let enClos = false
  let debut = 0
  while (debut <= n) {
    const k = texte.indexOf('\n', debut)
    const fin = k < 0 ? n : k
    const ligne = texte.slice(debut, fin)
    if (MD_CLOTURE.test(ligne)) {
      pousser(debut, fin, 'commentaire')
      enClos = !enClos
    } else if (!enClos) {
      let m: RegExpExecArray | null
      if (MD_TITRE.test(ligne)) pousser(debut, fin, 'motCle')
      else if (MD_REGLE.test(ligne)) pousser(debut, fin, 'operateur')
      else {
        const marque = MD_LISTE.exec(ligne) ?? MD_CITATION.exec(ligne)
        if (marque) {
          const lead = marque[0].length - marque[0].trimStart().length
          pousser(debut + lead, debut + (marque[0].endsWith('>') ? marque[0].length : marque[0].trimEnd().length), 'operateur')
        }
        if (ligne.length <= 2000) {
          MD_EN_LIGNE.lastIndex = 0
          while ((m = MD_EN_LIGNE.exec(ligne))) {
            const de = debut + m.index
            if (m[0][0] === '`') pousser(de, de + m[0].length, 'chaine')
            else {
              const milieu = m[0].indexOf('](')
              pousser(de, de + milieu + 1, 'fonction')
              pousser(de + milieu + 1, de + m[0].length, 'chaine')
            }
          }
        }
      }
    }
    debut = fin + 1
  }
}

/* ── L'entrée publique ─────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Les jetons de `code` pour le langage `langage` (un nom du menu, un alias ou `null`). Un langage inconnu, `null` ou un
 * texte vide ne donne rien ; une erreur inattendue non plus (on ne colore pas, on ne casse pas l'éditeur).
 */
export function jetons(code: string, langage: string | null): Jeton[] {
  const nom = langageDe(langage)
  if (!nom || !code || code.length > TAILLE_MAX) return []
  const L = langue(nom)
  if (!L) return []
  const sortie: Jeton[] = []
  try {
    if (L.def.mode === 'css') css(code, 0, sortie)
    else if (L.def.mode === 'html') html(code, 0, sortie, 0)
    else if (L.def.mode === 'markdown') markdown(code, 0, sortie)
    else moteur(code, L, 0, sortie, 0)
  } catch {
    return []
  }
  return sortie
}

/* ── Le plugin ProseMirror ─────────────────────────────────────────────────────────────────────────────────────────── */

interface Etat {
  decos: DecorationSet
  /** Les blocs de code décorés, avec le nœud qu'on a coloré : s'il est identique après la transaction, rien à refaire. */
  blocs: readonly { pos: number; noeud: NoeudPM }[]
}

const CLE = new PluginKey<Etat>('colorationCode')

/** Les jetons d'un nœud, gardés tant que le nœud (immuable) vit : un bloc déplacé n'est pas analysé deux fois. */
const CACHE = new WeakMap<NoeudPM, Jeton[]>()

function jetonsDuBloc(noeud: NoeudPM): Jeton[] {
  let j = CACHE.get(noeud)
  if (!j) {
    j = jetons(noeud.textContent, noeud.attrs.language as string | null)
    CACHE.set(noeud, j)
  }
  return j
}

const decorationsDuBloc = (noeud: NoeudPM, pos: number): Decoration[] =>
  jetonsDuBloc(noeud).map((j) => Decoration.inline(pos + 1 + j.de, pos + 1 + j.a, { class: `notak-code-${j.genre}` }))

/** Tous les blocs de code d'un document, avec leur position (les blocs de texte ne sont pas explorés). */
function blocsDeCode(doc: NoeudPM): { pos: number; noeud: NoeudPM }[] {
  const sortie: { pos: number; noeud: NoeudPM }[] = []
  doc.descendants((n, pos) => {
    if (n.type.name === 'codeBlock') {
      sortie.push({ pos, noeud: n })
      return false
    }
    return !n.isTextblock
  })
  return sortie
}

function construire(doc: NoeudPM): Etat {
  const blocs = blocsDeCode(doc)
  const decos = blocs.flatMap((b) => decorationsDuBloc(b.noeud, b.pos))
  return { decos: decos.length ? DecorationSet.create(doc, decos) : DecorationSet.empty, blocs }
}

/** Après une transaction : les blocs inchangés gardent leurs décorations (déplacées), les autres sont recolorés. */
function mettreAJour(tr: Transaction, etat: Etat): Etat {
  const doc = tr.doc
  let decos = etat.decos.map(tr.mapping, doc)
  const intacts = new Map<number, NoeudPM>()
  for (const b of etat.blocs) {
    const r = tr.mapping.mapResult(b.pos, 1)
    if (!r.deleted) intacts.set(r.pos, b.noeud)
  }
  const blocs = blocsDeCode(doc)
  const ajouts: Decoration[] = []
  for (const b of blocs) {
    if (intacts.get(b.pos) === b.noeud) continue
    const anciennes = decos.find(b.pos, b.pos + b.noeud.nodeSize)
    if (anciennes.length) decos = decos.remove(anciennes)
    ajouts.push(...decorationsDuBloc(b.noeud, b.pos))
  }
  if (ajouts.length) decos = decos.add(doc, ajouts)
  return { decos, blocs }
}

/** Colore chaque bloc de code selon son langage (attribut `language`) ; un changement de langage recolore le bloc. */
export const pluginColoration = (): Plugin<Etat> =>
  new Plugin<Etat>({
    key: CLE,
    state: {
      init: (_, state) => construire(state.doc),
      apply: (tr, etat) => (tr.docChanged ? mettreAJour(tr, etat) : etat),
    },
    props: {
      decorations: (state) => CLE.getState(state)?.decos ?? null,
    },
  })

/* ── Le rendu figé ─────────────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Colore les `pre[data-langage] code` d'un rendu statique (lecture, aperçu) en enveloppant les jetons de
 * `<span class="notak-code-<genre>">`. Un code qui porte déjà des éléments (déjà coloré) n'est pas retouché.
 */
export function colorerCode(racine: HTMLElement): void {
  for (const code of racine.querySelectorAll<HTMLElement>('pre[data-langage] code')) {
    if (code.childElementCount > 0) continue
    const texte = code.textContent ?? ''
    const liste = jetons(texte, code.closest('pre')?.getAttribute('data-langage') ?? null)
    if (!liste.length) continue
    const doc = code.ownerDocument
    const morceaux: Node[] = []
    let curseur = 0
    for (const j of liste) {
      if (j.de > curseur) morceaux.push(doc.createTextNode(texte.slice(curseur, j.de)))
      const span = doc.createElement('span')
      span.className = `notak-code-${j.genre}`
      span.textContent = texte.slice(j.de, j.a)
      morceaux.push(span)
      curseur = j.a
    }
    if (curseur < texte.length) morceaux.push(doc.createTextNode(texte.slice(curseur)))
    code.replaceChildren(...morceaux)
  }
}
