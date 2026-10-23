import type { FormatCellule, TypeCellule } from '../../coeur/tableau'

/**
 * Le moteur de formules de la table : une cellule qui commence par `=` est une formule (références A1, plages
 * A1:B3, `$` absolu, opérateurs, environ deux cents fonctions de tableur). Tout est pur : l'horloge se passe en paramètre.
 * Les lignes et colonnes sont comptées à partir de 0 (A1 = ligne 0, colonne 0).
 */

export type CodeErreur = '#PARSE' | '#DIV/0!' | '#REF!' | '#NAME?' | '#VALUE!' | '#CYCLE!' | '#N/A'
export type Valeur = number | string | boolean | null
export interface Resultat {
  valeur: Valeur
  erreur?: CodeErreur
}

export interface Reference {
  ligne: number
  colonne: number
  absLigne: boolean
  absColonne: boolean
}

/** Une plage, bornes comprises. */
export interface Plage {
  l1: number
  c1: number
  l2: number
  c2: number
}

/** Une référence ou une plage citée dans un texte, avec sa place (`debut` inclus, `fin` exclu). */
export interface Citation {
  debut: number
  fin: number
  plage: Plage
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Noms de cellules                                                                                              */
/* ------------------------------------------------------------------------------------------------------------ */

/** 0 -> A, 25 -> Z, 26 -> AA. */
export function nomColonne(j: number): string {
  let n = Math.floor(j) + 1
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export const nomCellule = (i: number, j: number): string => nomColonne(j) + (i + 1)

const RE_REF = /^(\$?)([A-Za-z]{1,3})(\$?)(\d+)$/

function numeroColonne(lettres: string): number {
  let n = 0
  for (const c of lettres.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64)
  return n - 1
}

/** 'B3' -> ligne 2, colonne 1 ; `$` marque la partie absolue. Rend null si ce n'est pas une référence. */
export function lireReference(s: string): Reference | null {
  const m = RE_REF.exec(s.trim())
  if (!m) return null
  const ligne = Number(m[4]) - 1
  if (ligne < 0) return null
  return { ligne, colonne: numeroColonne(m[2]!), absLigne: m[3] === '$', absColonne: m[1] === '$' }
}

function ecrireReference(r: Reference): string {
  return `${r.absColonne ? '$' : ''}${nomColonne(r.colonne)}${r.absLigne ? '$' : ''}${r.ligne + 1}`
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Dates : numéros de série façon tableur (1 = 01/01/1900, avec le faux 29/02/1900)                              */
/* ------------------------------------------------------------------------------------------------------------ */

/** Jours depuis le 01/01/1970 d'une date civile ; le mois et le jour peuvent déborder. */
function joursCivils(a: number, m: number, j: number): number {
  a += Math.floor((m - 1) / 12)
  m = (((m - 1) % 12) + 12) % 12 + 1
  const y = m <= 2 ? a - 1 : a
  const ere = Math.floor(y / 400)
  const yoe = y - ere * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + j - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return ere * 146097 + doe - 719468
}

function dateCivile(jours: number): { a: number; m: number; j: number } {
  const z = jours + 719468
  const ere = Math.floor(z / 146097)
  const doe = z - ere * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const j = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  return { a: yoe + ere * 400 + (m <= 2 ? 1 : 0), m, j }
}

/** Le jour 0 des numéros de série (30/12/1899), en jours depuis 1970. */
const BASE_SERIE = joursCivils(1899, 12, 30)

/** Avant le 01/03/1900 le tableur compte un jour de moins (le 29/02/1900 qui n'a pas existé). */
const serieDepuisJours = (jours: number): number => {
  const d = jours - BASE_SERIE
  return d < 61 ? d - 1 : d
}
const joursDepuisSerie = (serie: number): number => BASE_SERIE + (serie < 60 ? serie + 1 : serie)

/** Année, mois (1-12) et jour d'un numéro de série ; 60 donne le faux 29/02/1900. */
function composantes(serie: number): { a: number; m: number; j: number } {
  const d = Math.floor(serie)
  if (d === 60) return { a: 1900, m: 2, j: 29 }
  return dateCivile(joursDepuisSerie(d))
}

/** Le numéro de série d'une date (heure locale), la partie décimale est l'heure du jour. */
export function dateVersSerie(d: Date): number {
  const jour = serieDepuisJours(joursCivils(d.getFullYear(), d.getMonth() + 1, d.getDate()))
  const ms = ((d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds()) * 1000 + d.getMilliseconds()
  return jour + ms / 86_400_000
}

/** La date (heure locale) d'un numéro de série. Le 60 (faux 29/02/1900) rend le 28/02/1900. */
export function serieVersDate(n: number): Date {
  const { a, m, j } = composantes(n)
  const ms = Math.round((n - Math.floor(n)) * 86_400_000)
  const d = new Date(2000, 0, 1)
  d.setFullYear(a, m - 1, j)
  d.setHours(0, 0, 0, ms)
  return d
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Valeur brute d'une cellule qui n'est pas une formule                                                          */
/* ------------------------------------------------------------------------------------------------------------ */

const RE_ESPACES = /[\s  ]/g
const RE_NOMBRE = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/

function lireNombre(s: string): number | null {
  const t = s.replace(RE_ESPACES, '')
  if (!RE_NOMBRE.test(t)) return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Nombre si le texte se lit comme tel (point ou virgule, espaces de milliers), booléen, vide ou texte. */
function lireBrut(s: string): Valeur {
  const t = s.trim()
  if (t === '') return null
  const n = lireNombre(t)
  if (n !== null) return n
  const bas = t.toLowerCase()
  if (bas === 'true') return true
  if (bas === 'false') return false
  return s
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Lexique                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------ */

type Jeton =
  | { k: 'num'; v: number; debut: number; fin: number }
  | { k: 'str'; v: string; debut: number; fin: number }
  | { k: 'ref'; ref: Reference; debut: number; fin: number }
  | { k: 'nom'; v: string; debut: number; fin: number }
  | { k: 'op'; v: string; debut: number; fin: number }
  | { k: 'err'; debut: number; fin: number }
  | { k: 'inconnu'; debut: number; fin: number }

const RE_JETON_NOMBRE = /(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/y
const RE_JETON_REF = /\$?[A-Za-z]{1,3}\$?\d+(?![A-Za-z0-9_.(])/y
const RE_JETON_NOM = /[A-Za-z_][A-Za-z0-9_.]*/y
const RE_JETON_ERR = /#REF!/iy
const OPERATEURS_DOUBLES = ['<=', '>=', '<>']
const OPERATEURS = '+-*/^&=<>%(),;:'

/** Découpe sans jamais échouer : un caractère inconnu devient un jeton `inconnu`, une chaîne ouverte va à la fin. */
function lire(texte: string, depart = 0): Jeton[] {
  const jetons: Jeton[] = []
  let i = depart
  const essayer = (re: RegExp): RegExpExecArray | null => {
    re.lastIndex = i
    return re.exec(texte)
  }
  while (i < texte.length) {
    const c = texte[i]!
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (c === '"') {
      let j = i + 1
      let v = ''
      while (j < texte.length) {
        if (texte[j] === '"') {
          if (texte[j + 1] === '"') {
            v += '"'
            j += 2
            continue
          }
          break
        }
        v += texte[j]
        j++
      }
      const fin = Math.min(j + 1, texte.length)
      jetons.push({ k: 'str', v, debut: i, fin })
      i = fin
      continue
    }
    let m: RegExpExecArray | null
    if ((m = essayer(RE_JETON_ERR))) {
      jetons.push({ k: 'err', debut: i, fin: i + m[0].length })
      i += m[0].length
      continue
    }
    if (/[0-9.]/.test(c) && (m = essayer(RE_JETON_NOMBRE))) {
      jetons.push({ k: 'num', v: Number(m[0]), debut: i, fin: i + m[0].length })
      i += m[0].length
      continue
    }
    if ((c === '$' || /[A-Za-z]/.test(c)) && (m = essayer(RE_JETON_REF))) {
      const ref = lireReference(m[0])
      if (ref) {
        jetons.push({ k: 'ref', ref, debut: i, fin: i + m[0].length })
        i += m[0].length
        continue
      }
    }
    if ((m = essayer(RE_JETON_NOM))) {
      jetons.push({ k: 'nom', v: m[0], debut: i, fin: i + m[0].length })
      i += m[0].length
      continue
    }
    const deux = texte.slice(i, i + 2)
    if (OPERATEURS_DOUBLES.includes(deux)) {
      jetons.push({ k: 'op', v: deux, debut: i, fin: i + 2 })
      i += 2
      continue
    }
    if (OPERATEURS.includes(c)) {
      jetons.push({ k: 'op', v: c, debut: i, fin: i + 1 })
      i++
      continue
    }
    jetons.push({ k: 'inconnu', debut: i, fin: i + 1 })
    i++
  }
  return jetons
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Analyse                                                                                                       */
/* ------------------------------------------------------------------------------------------------------------ */

type Noeud =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'bool'; v: boolean }
  | { t: 'vide' }
  | { t: 'err'; code: CodeErreur }
  | { t: 'nom'; nom: string }
  | { t: 'ref'; l: number; c: number }
  | { t: 'plage'; l1: number; c1: number; l2: number; c2: number }
  | { t: 'appel'; nom: string; args: Noeud[] }
  | { t: 'bin'; op: string; g: Noeud; d: Noeud }
  | { t: 'un'; op: string; e: Noeud }
  | { t: 'pct'; e: Noeud }

class ErreurFormule {
  constructor(readonly code: CodeErreur) {}
}

const echec = (code: CodeErreur): never => {
  throw new ErreurFormule(code)
}

const COMPARAISONS = ['=', '<>', '<', '>', '<=', '>=']

class Analyseur {
  private p = 0
  constructor(private readonly jetons: Jeton[]) {}

  analyser(): Noeud {
    const n = this.expression()
    if (this.p < this.jetons.length) echec('#PARSE')
    return n
  }

  private suivant(): Jeton | undefined {
    return this.jetons[this.p]
  }

  private op(...valeurs: string[]): string | null {
    const j = this.jetons[this.p]
    if (j && j.k === 'op' && valeurs.includes(j.v)) {
      this.p++
      return j.v
    }
    return null
  }

  private expression(): Noeud {
    let g = this.concat()
    for (let o = this.op(...COMPARAISONS); o; o = this.op(...COMPARAISONS)) g = { t: 'bin', op: o, g, d: this.concat() }
    return g
  }

  private concat(): Noeud {
    let g = this.somme()
    while (this.op('&')) g = { t: 'bin', op: '&', g, d: this.somme() }
    return g
  }

  private somme(): Noeud {
    let g = this.produit()
    for (let o = this.op('+', '-'); o; o = this.op('+', '-')) g = { t: 'bin', op: o, g, d: this.produit() }
    return g
  }

  private produit(): Noeud {
    let g = this.puissance()
    for (let o = this.op('*', '/'); o; o = this.op('*', '/')) g = { t: 'bin', op: o, g, d: this.puissance() }
    return g
  }

  /** Comme dans les tableurs : le moins unaire lie plus fort que `^` (-2^2 = 4), et `^` va de gauche à droite. */
  private puissance(): Noeud {
    let g = this.unaire()
    while (this.op('^')) g = { t: 'bin', op: '^', g, d: this.unaire() }
    return g
  }

  private unaire(): Noeud {
    const o = this.op('+', '-')
    if (o) return { t: 'un', op: o, e: this.unaire() }
    let e = this.primaire()
    while (this.op('%')) e = { t: 'pct', e }
    return e
  }

  private primaire(): Noeud {
    const j = this.suivant()
    if (!j) return echec('#PARSE')
    this.p++
    switch (j.k) {
      case 'num':
        return { t: 'num', v: j.v }
      case 'str':
        return { t: 'str', v: j.v }
      case 'err':
        return { t: 'err', code: '#REF!' }
      case 'ref': {
        const s = this.suivant()
        const f = this.jetons[this.p + 1]
        if (s && s.k === 'op' && s.v === ':' && f && f.k === 'ref') {
          this.p += 2
          return {
            t: 'plage',
            l1: Math.min(j.ref.ligne, f.ref.ligne),
            c1: Math.min(j.ref.colonne, f.ref.colonne),
            l2: Math.max(j.ref.ligne, f.ref.ligne),
            c2: Math.max(j.ref.colonne, f.ref.colonne),
          }
        }
        return { t: 'ref', l: j.ref.ligne, c: j.ref.colonne }
      }
      case 'nom': {
        const s = this.suivant()
        if (s && s.k === 'op' && s.v === '(') {
          this.p++
          return { t: 'appel', nom: j.v.toUpperCase(), args: this.arguments() }
        }
        const haut = j.v.toUpperCase()
        if (haut === 'TRUE') return { t: 'bool', v: true }
        if (haut === 'FALSE') return { t: 'bool', v: false }
        return { t: 'nom', nom: haut }
      }
      case 'op': {
        if (j.v === '(') {
          const e = this.expression()
          if (!this.op(')')) echec('#PARSE')
          return e
        }
        return echec('#PARSE')
      }
      default:
        return echec('#PARSE')
    }
  }

  /** Les arguments après `(`, séparés par `,` ou `;` ; un argument peut être vide. */
  private arguments(): Noeud[] {
    const args: Noeud[] = []
    if (this.op(')')) return args
    for (;;) {
      const s = this.suivant()
      const vide = s && s.k === 'op' && (s.v === ',' || s.v === ';' || s.v === ')')
      args.push(vide ? { t: 'vide' } : this.expression())
      if (this.op(',', ';')) continue
      if (this.op(')')) return args
      return echec('#PARSE')
    }
  }
}

function analyser(texte: string): Noeud | CodeErreur {
  try {
    return new Analyseur(lire(texte, 1)).analyser()
  } catch (e) {
    if (e instanceof ErreurFormule) return e.code
    throw e
  }
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Valeurs et conversions                                                                                        */
/* ------------------------------------------------------------------------------------------------------------ */

type Matrice = Resultat[][]
type Arg = Valeur | Matrice

const net = (n: number): number => (Number.isFinite(n) ? parseFloat(n.toPrecision(15)) : n)

function fini(n: number): number {
  if (!Number.isFinite(n)) return echec('#VALUE!')
  return net(n)
}

function versNombre(v: Valeur): number {
  if (typeof v === 'number') return v
  if (v === null) return 0
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v.trim() === '') return echec('#VALUE!')
  const n = lireNombre(v)
  return n === null ? echec('#VALUE!') : n
}

function versTexte(v: Valeur): string {
  if (v === null) return ''
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'number') return String(net(v))
  return v
}

function versBool(v: Valeur): boolean {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (v === null) return false
  const bas = v.trim().toLowerCase()
  if (bas === 'true') return true
  if (bas === 'false') return false
  return echec('#VALUE!')
}

/** Comparaison façon tableur : nombres < textes < booléens ; le vide vaut le neutre de l'autre côté. */
function comparer(a: Valeur, b: Valeur): number {
  const neutre = (autre: Valeur): Valeur => (typeof autre === 'string' ? '' : typeof autre === 'boolean' ? false : 0)
  const x = a === null ? neutre(b) : a
  const y = b === null ? neutre(a) : b
  const rang = (v: Valeur) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2)
  if (rang(x) !== rang(y)) return rang(x) - rang(y)
  if (typeof x === 'string' && typeof y === 'string') {
    const p = x.toLowerCase()
    const q = y.toLowerCase()
    return p < q ? -1 : p > q ? 1 : 0
  }
  return Math.sign(Number(x) - Number(y))
}

/** Un argument scalaire : une plage d'une seule cellule se lit comme sa cellule, une plus grande est une erreur. */
function scalaire(a: Arg): Valeur {
  if (!Array.isArray(a)) return a
  const ligne = a[0]
  const cel = ligne?.[0]
  if (a.length !== 1 || !ligne || ligne.length !== 1 || !cel) return echec('#VALUE!')
  if (cel.erreur) return echec(cel.erreur)
  return cel.valeur
}

/** Les nombres des arguments : dans une plage seuls les nombres comptent, un argument direct est converti. */
function nombres(args: Arg[]): number[] {
  const out: number[] = []
  for (const a of args) {
    if (Array.isArray(a)) {
      for (const ligne of a)
        for (const c of ligne) {
          if (c.erreur) echec(c.erreur)
          if (typeof c.valeur === 'number') out.push(c.valeur)
        }
    } else out.push(versNombre(a))
  }
  return out
}

/** Les valeurs des arguments à plat (une plage donne ses cellules) ; une cellule en erreur lève son erreur. */
function aPlat(args: Arg[]): Valeur[] {
  const out: Valeur[] = []
  for (const a of args) {
    if (Array.isArray(a)) {
      for (const ligne of a)
        for (const c of ligne) {
          if (c.erreur) echec(c.erreur)
          out.push(c.valeur)
        }
    } else out.push(a)
  }
  return out
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Critères (SUMIF, COUNTIF, AVERAGEIF)                                                                          */
/* ------------------------------------------------------------------------------------------------------------ */

/** Le motif (sans ancres) d'un texte à jokers : `*` pour toute suite de caractères, `?` pour un seul. */
function corpsJoker(s: string): string {
  return s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
}

function motifJoker(s: string): RegExp {
  return new RegExp(`^${corpsJoker(s)}$`, 'i')
}

/** `">5"`, `"<>x"`, `"=texte"`, `"texte"` ou une valeur directe : le test que doit passer une cellule. */
function critere(c: Valeur): (v: Valeur) => boolean {
  let op = '='
  let cible: Valeur = c
  if (typeof c === 'string') {
    const m = /^(<=|>=|<>|=|<|>)?([\s\S]*)$/.exec(c)!
    op = m[1] ?? '='
    const reste = m[2]!
    cible = reste === '' ? null : lireBrut(reste)
    if (typeof cible === 'string') cible = reste
  }
  const egal = (v: Valeur): boolean => {
    if (cible === null) return v === null || v === ''
    if (typeof cible === 'string') {
      if (typeof v !== 'string') return false
      return /[*?]/.test(cible) ? motifJoker(cible).test(v) : v.toLowerCase() === cible.toLowerCase()
    }
    return typeof v === typeof cible && v === cible
  }
  if (op === '=') return egal
  if (op === '<>') return (v) => !egal(v)
  // Un ordre ne compare que des valeurs de même nature.
  return (v) => {
    if (v === null || cible === null || typeof v !== typeof cible) return false
    const d = comparer(v, cible)
    return op === '<' ? d < 0 : op === '>' ? d > 0 : op === '<=' ? d <= 0 : d >= 0
  }
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Arrondis et texte                                                                                             */
/* ------------------------------------------------------------------------------------------------------------ */

function decaler(n: number, d: number): number {
  return d >= 0 ? n * 10 ** d : n / 10 ** -d
}

/** Arrondit `x` à `d` décimales ; `mode` : au plus proche (moitié loin de zéro), vers le haut ou vers le bas (en valeur absolue). */
function arrondir(x: number, d: number, mode: 'proche' | 'haut' | 'bas'): number {
  const dd = Math.trunc(d)
  const v = parseFloat(decaler(Math.abs(x), dd).toPrecision(15))
  const r = mode === 'proche' ? Math.round(v) : mode === 'haut' ? Math.ceil(v) : Math.floor(v)
  return net(Math.sign(x) * decaler(r, -dd))
}

function formaterNombre(n: number, format: string): string {
  const f = format.replace(/"/g, '')
  const m = /^([^0#]*)([0#][0#.,]*)([^0#]*)$/.exec(f)
  if (!m) return versTexte(n)
  const [, prefixe, motif, suffixe] = m as unknown as [string, string, string, string]
  const v = f.includes('%') ? n * 100 : n
  const [entierMotif = '', decMotif = ''] = motif.split('.')
  const decimales = decMotif.replace(/[^0#]/g, '').length
  const decimalesMin = (decMotif.match(/0/g) ?? []).length
  const chiffresMin = (entierMotif.match(/0/g) ?? []).length
  const [entier = '0', dec = ''] = arrondir(Math.abs(v), decimales, 'proche').toFixed(decimales).split('.')
  let decimalesTexte = dec
  while (decimalesTexte.length > decimalesMin && decimalesTexte.endsWith('0')) decimalesTexte = decimalesTexte.slice(0, -1)
  let e = entier.padStart(chiffresMin, '0')
  if (entierMotif.includes(',')) e = e.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const corps = e + (decimalesTexte ? '.' + decimalesTexte : '')
  const signe = v < 0 && /[1-9]/.test(corps) ? '-' : ''
  return signe + prefixe + corps + suffixe
}

const deuxChiffres = (n: number) => String(n).padStart(2, '0')

function formaterDate(serie: number, format: string): string {
  const { a, m, j } = composantes(serie)
  const sec = Math.round((serie - Math.floor(serie)) * 86400) % 86400
  const h = Math.floor(sec / 3600)
  const mn = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return format.replace(/"([^"]*)"|yyyy|yy|mm|m|dd|d|hh|h|nn|ss|s/gi, (jeton: string, litteral?: string) => {
    if (litteral !== undefined) return litteral
    switch (jeton.toLowerCase()) {
      case 'yyyy':
        return String(a).padStart(4, '0')
      case 'yy':
        return deuxChiffres(a % 100)
      case 'mm':
        return deuxChiffres(m)
      case 'm':
        return String(m)
      case 'dd':
        return deuxChiffres(j)
      case 'd':
        return String(j)
      case 'hh':
        return deuxChiffres(h)
      case 'h':
        return String(h)
      case 'nn':
        return deuxChiffres(mn)
      default:
        return jeton.length === 2 ? deuxChiffres(s) : String(s)
    }
  })
}

/** TEXT : formats de nombre (`0.00`, `#,##0`, `0%`, `0 "€"`) ou de date (`dd/mm/yyyy`, `hh:nn`) ; séparateurs à l'anglaise. */
function texteFormate(v: Valeur, format: string): string {
  if (typeof v === 'string') return v
  const n = versNombre(v)
  const sansCitations = format.replace(/"[^"]*"/g, '')
  if (/[ymdhs]/i.test(sansCitations) && !/[0#]/.test(sansCitations)) return formaterDate(n, format)
  return formaterNombre(n, format)
}

const joursDuMois = (a: number, m: number): number => joursCivils(a, m + 1, 1) - joursCivils(a, m, 1)
const estBissextile = (a: number): boolean => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0

/** Le numéro de série d'un texte `aaaa-mm-jj` ou `jj/mm/aaaa` (ou `jj/mm/aa`) ; null si ce n'est pas une date valide. */
function lireDate(t: string): number | null {
  let a: number, m: number, j: number
  let r = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t)
  if (r) [a, m, j] = [Number(r[1]), Number(r[2]), Number(r[3])]
  else if ((r = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\s*$/.exec(t))) {
    ;[j, m, a] = [Number(r[1]), Number(r[2]), Number(r[3])]
    if (r[3]!.length === 2) a += a < 30 ? 2000 : 1900
  } else return null
  if (m < 1 || m > 12 || j < 1 || j > joursDuMois(a, m)) return null
  return serieDepuisJours(joursCivils(a, m, j))
}

/** Une heure `hh:mm`, `hh:mm:ss`, avec AM/PM possible, en fraction de jour ; null sinon. */
function lireHeure(t: string): number | null {
  const r = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?\s*$/i.exec(t)
  if (!r) return null
  let h = Number(r[1])
  const mn = Number(r[2])
  const sec = Number(r[3] ?? 0)
  if (r[4]) {
    if (h < 1 || h > 12) return null
    h = (h % 12) + (r[4].toUpperCase() === 'PM' ? 12 : 0)
  }
  if (h > 23 || mn > 59 || sec > 59) return null
  return (h * 3600 + mn * 60 + sec) / 86400
}

/** Un numéro de série lu dans un nombre ou dans un texte de date. */
function serieDe(v: Valeur): number {
  if (typeof v === 'string') {
    const d = lireDate(v)
    if (d !== null) return d
  }
  return versNombre(v)
}

const joursDe = (serie: number): number => joursDepuisSerie(Math.floor(serie))
/** Jour de la semaine, dimanche = 0. */
const jourSemaine = (serie: number): number => (((joursDe(serie) + 4) % 7) + 7) % 7
const secondesDuJour = (serie: number): number => Math.round((serie - Math.floor(serie)) * 86400) % 86400

/* ------------------------------------------------------------------------------------------------------------ */
/* Évaluation                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------ */

interface Contexte {
  lignes: number
  colonnes: number
  /** La cellule dont la formule se calcule (pour ROW() et COLUMN() sans argument). */
  courante?: { l: number; c: number }
  maintenant: () => Date
  cellule(i: number, j: number): Resultat
}

type Evaluer = (n: Noeud) => Arg
type Eager = (args: Arg[], ctx: Contexte) => Valeur
type Paresseux = (args: Noeud[], ev: Evaluer, ctx: Contexte) => Valeur

const dansLaGrille = (ctx: Contexte, l: number, c: number): boolean => l >= 0 && c >= 0 && l < ctx.lignes && c < ctx.colonnes

function lireMatrice(ctx: Contexte, z: Plage): Matrice {
  if (!dansLaGrille(ctx, z.l1, z.c1) || !dansLaGrille(ctx, z.l2, z.c2)) return echec('#REF!')
  const m: Matrice = []
  for (let i = z.l1; i <= z.l2; i++) {
    const ligne: Resultat[] = []
    for (let j = z.c1; j <= z.c2; j++) ligne.push(ctx.cellule(i, j))
    m.push(ligne)
  }
  return m
}

function zoneDe(n: Noeud | undefined): Plage {
  if (n?.t === 'ref') return { l1: n.l, c1: n.c, l2: n.l, c2: n.c }
  if (n?.t === 'plage') return n
  return echec('#VALUE!')
}

function arite(args: unknown[], min: number, max = min): void {
  if (args.length < min || args.length > max) echec('#VALUE!')
}

const argument = (args: Arg[], i: number): Valeur => scalaire(args[i] ?? null)
const nombreArg = (args: Arg[], i: number, defaut?: number): number =>
  args[i] === undefined && defaut !== undefined ? defaut : versNombre(argument(args, i))

function matriceArg(a: Arg | undefined): Matrice {
  if (Array.isArray(a)) return a
  return echec('#VALUE!')
}

/** Le dénominateur nul d'une division. */
const diviser = (a: number, b: number): number => (b === 0 ? echec('#DIV/0!') : fini(a / b))

function si(
  args: Noeud[],
  ev: Evaluer,
  agreger: (valeurs: number[]) => Valeur,
  ctx: Contexte,
): Valeur {
  arite(args, 2, 3)
  const zone = zoneDe(args[0])
  const test = critere(scalaire(ev(args[1]!)))
  const plage = lireMatrice(ctx, zone)
  const hauteur = zone.l2 - zone.l1
  const largeur = zone.c2 - zone.c1
  const somme =
    args[2] === undefined
      ? plage
      : lireMatrice(ctx, { l1: zoneDe(args[2]).l1, c1: zoneDe(args[2]).c1, l2: zoneDe(args[2]).l1 + hauteur, c2: zoneDe(args[2]).c1 + largeur })
  const retenus: number[] = []
  plage.forEach((ligne, i) =>
    ligne.forEach((cel, j) => {
      if (cel.erreur || !test(cel.valeur)) return
      const s = somme[i]![j]!
      if (s.erreur) echec(s.erreur)
      if (typeof s.valeur === 'number') retenus.push(s.valeur)
      else if (args[2] === undefined) retenus.push(NaN)
    }),
  )
  return agreger(retenus.filter((n) => !Number.isNaN(n)))
}

const somme = (v: number[]): number => net(v.reduce((a, b) => a + b, 0))

/** Le résultat d'un argument, erreur comprise : une plage d'une seule cellule rend sa cellule telle quelle (vide compris). */
function essai(n: Noeud | undefined, ev: Evaluer): Resultat {
  if (!n) return { valeur: null }
  try {
    const x = ev(n)
    if (!Array.isArray(x)) return { valeur: x }
    const cel = x.length === 1 && x[0]!.length === 1 ? x[0]![0] : undefined
    return cel ?? { valeur: null, erreur: '#VALUE!' }
  } catch (e) {
    if (e instanceof ErreurFormule) return { valeur: null, erreur: e.code }
    throw e
  }
}

/** Les cellules qui passent tous les couples plage / critère des arguments à partir de `debut` (SUMIFS et cie). */
function filtrer(args: Noeud[], debut: number, ev: Evaluer, ctx: Contexte): { h: number; l: number; ok: boolean[][] } {
  if (args.length - debut < 2 || (args.length - debut) % 2 !== 0) return echec('#VALUE!')
  let h = -1
  let l = -1
  let ok: boolean[][] = []
  for (let k = debut; k < args.length; k += 2) {
    const z = zoneDe(args[k])
    const hh = z.l2 - z.l1 + 1
    const ll = z.c2 - z.c1 + 1
    if (h < 0) {
      h = hh
      l = ll
      ok = Array.from({ length: h }, () => Array<boolean>(l).fill(true))
    } else if (hh !== h || ll !== l) return echec('#VALUE!')
    const test = critere(scalaire(ev(args[k + 1]!)))
    lireMatrice(ctx, z).forEach((ligne, i) =>
      ligne.forEach((c, j) => {
        if (c.erreur || !test(c.valeur)) ok[i]![j] = false
      }),
    )
  }
  return { h, l, ok }
}

/** SUMIFS, AVERAGEIFS, MAXIFS, MINIFS : les nombres de la première plage, là où tous les critères passent. */
function agregerSi(args: Noeud[], ev: Evaluer, ctx: Contexte, agreger: (valeurs: number[]) => Valeur): Valeur {
  arite(args, 3, 255)
  const f = filtrer(args, 1, ev, ctx)
  const z = zoneDe(args[0])
  if (z.l2 - z.l1 + 1 !== f.h || z.c2 - z.c1 + 1 !== f.l) return echec('#VALUE!')
  const out: number[] = []
  lireMatrice(ctx, z).forEach((ligne, i) =>
    ligne.forEach((c, j) => {
      if (!f.ok[i]![j]) return
      if (c.erreur) echec(c.erreur)
      if (typeof c.valeur === 'number') out.push(c.valeur)
    }),
  )
  return agreger(out)
}

const maximum = (v: number[]): number => v.reduce((a, b) => Math.max(a, b), -Infinity)
const minimum = (v: number[]): number => v.reduce((a, b) => Math.min(a, b), Infinity)

/** Une ligne ou une colonne de cellules ; autre chose n'est pas une recherche possible (#N/A). */
function vecteur(a: Arg | undefined): Resultat[] {
  const m = matriceArg(a)
  if (m.length === 1) return m[0]!
  if (m.every((l) => l.length === 1)) return m.map((l) => l[0]!)
  return echec('#N/A')
}

/**
 * L'indice de la cellule cherchée, ou -1. `type` 0 : égalité (avec jokers pour un texte si `joker`) ; 1 : la dernière
 * valeur inférieure ou égale ; -1 : la dernière valeur supérieure ou égale. Seules les cellules de même nature comptent.
 */
function chercher(cherche: Valeur, cellules: Resultat[], type: 0 | 1 | -1, joker = true): number {
  const avecJoker = joker && typeof cherche === 'string' && /[*?]/.test(cherche)
  const motif = avecJoker ? motifJoker(cherche as string) : null
  let k = -1
  cellules.forEach((c, i) => {
    const x = c.valeur
    if (c.erreur || x === null || typeof x !== typeof cherche) return
    if (type === 0) {
      if (k < 0 && (motif ? motif.test(x as string) : comparer(x, cherche) === 0)) k = i
      return
    }
    const d = comparer(x, cherche)
    if (type === 1 ? d <= 0 : d >= 0) k = i
  })
  return k
}

function rechercheTable(a: Arg[], horizontal: boolean): Valeur {
  arite(a, 3, 4)
  const cherche = argument(a, 0)
  const m = matriceArg(a[1])
  const indice = Math.trunc(nombreArg(a, 2))
  const approche = a[3] === undefined ? true : versBool(argument(a, 3))
  const t = horizontal ? (m[0] ?? []).map((_, j) => m.map((ligne) => ligne[j]!)) : m
  if (indice < 1) return echec('#VALUE!')
  if (indice > (t[0]?.length ?? 0)) return echec('#REF!')
  const k = chercher(cherche, t.map((ligne) => ligne[0]!), approche ? 1 : 0)
  if (k < 0) return echec('#N/A')
  const cel = t[k]![indice - 1]!
  return cel.erreur ? echec(cel.erreur) : cel.valeur
}

const entier = (a: Arg[], i: number, defaut?: number): number => Math.trunc(nombreArg(a, i, defaut))

/** Variance des nombres (échantillon : n - 1, sinon n). */
function variance(n: number[], echantillon: boolean): number {
  const d = n.length - (echantillon ? 1 : 0)
  if (d <= 0) return echec('#DIV/0!')
  const moy = somme(n) / n.length
  return net(n.reduce((s, x) => s + (x - moy) ** 2, 0) / d)
}

/** Le k-ième plus grand (ou plus petit) des nombres du premier argument. */
function rang(a: Arg[], grand: boolean): number {
  arite(a, 2)
  const n = nombres([a[0]!]).sort((x, y) => (grand ? y - x : x - y))
  const k = entier(a, 1)
  return k < 1 || k > n.length ? echec('#VALUE!') : n[k - 1]!
}

const pgcd = (a: number, b: number): number => (b === 0 ? a : pgcd(b, a % b))

/** Ajoute `n` mois à une date de série, en gardant le jour s'il existe (sinon le dernier du mois). */
function ajouterMois(serie: number, n: number): number {
  const { a, m, j } = composantes(serie)
  const debut = joursCivils(a, m + n, 1)
  const jour = Math.min(j, joursCivils(a, m + n + 1, 1) - debut)
  return serieDepuisJours(debut + jour - 1)
}

/** Les jours fériés d'un argument (nombres de série entiers). */
const feries = (a: Arg | undefined): Set<number> =>
  new Set(a === undefined ? [] : aPlat([a]).filter((x): x is number => typeof x === 'number').map(Math.floor))

const ouvre = (serie: number, conges: Set<number>): boolean => {
  const j = jourSemaine(serie)
  return j !== 0 && j !== 6 && !conges.has(Math.floor(serie))
}

/** Jours entre deux dates sur une année de 360 jours (méthode américaine, ou européenne). */
function jours360(s: number, e: number, europeen: boolean): number {
  const d = composantes(s)
  const f = composantes(e)
  let j1 = d.j
  let j2 = f.j
  if (europeen) {
    j1 = Math.min(j1, 30)
    j2 = Math.min(j2, 30)
  } else {
    const finFevrier = (c: { a: number; m: number; j: number }) => c.m === 2 && c.j === joursDuMois(c.a, 2)
    if (finFevrier(d)) {
      if (finFevrier(f)) j2 = 30
      j1 = 30
    }
    if (j2 === 31 && j1 >= 30) j2 = 30
    if (j1 === 31) j1 = 30
  }
  return (f.a - d.a) * 360 + (f.m - d.m) * 30 + (j2 - j1)
}

function numeroSemaine(serie: number, debutSemaine: number): number {
  const { a } = composantes(serie)
  const premier = joursCivils(a, 1, 1)
  const rangPremier = (((premier + 4) % 7) + 7) % 7
  return Math.floor((joursDe(serie) - premier + ((rangPremier - debutSemaine + 7) % 7)) / 7) + 1
}

function semaineIso(serie: number): number {
  const j = joursDe(serie)
  const lundi0 = (((j + 3) % 7) + 7) % 7
  const jeudi = j - lundi0 + 3
  const a = dateCivile(jeudi).a
  return Math.floor((jeudi - joursCivils(a, 1, 1)) / 7) + 1
}

function anneeFraction(s: number, e: number, base: number): number {
  if (s > e) [s, e] = [e, s]
  switch (base) {
    case 0:
      return jours360(s, e, false) / 360
    case 4:
      return jours360(s, e, true) / 360
    case 2:
      return (e - s) / 360
    case 3:
      return (e - s) / 365
    case 1: {
      const d = composantes(s)
      const f = composantes(e)
      let longueur: number
      if (d.a === f.a) longueur = estBissextile(d.a) ? 366 : 365
      else if (f.a === d.a + 1 && (f.m < d.m || (f.m === d.m && f.j <= d.j))) {
        const fevrier29 = (estBissextile(d.a) && d.m <= 2) || (estBissextile(f.a) && (f.m > 2 || (f.m === 2 && f.j === 29)))
        longueur = fevrier29 ? 366 : 365
      } else {
        let total = 0
        for (let a = d.a; a <= f.a; a++) total += estBissextile(a) ? 366 : 365
        longueur = total / (f.a - d.a + 1)
      }
      return (e - s) / longueur
    }
    default:
      return echec('#VALUE!')
  }
}

function datedif(a: Arg[]): number {
  arite(a, 3)
  const s = Math.floor(serieDe(argument(a, 0)))
  const e = Math.floor(serieDe(argument(a, 1)))
  if (s > e) return echec('#VALUE!')
  const d = composantes(s)
  const f = composantes(e)
  const avantAnniv = f.m < d.m || (f.m === d.m && f.j < d.j)
  const moisEntiers = (f.a - d.a) * 12 + f.m - d.m - (f.j < d.j ? 1 : 0)
  switch (versTexte(argument(a, 2)).toUpperCase()) {
    case 'Y':
      return f.a - d.a - (avantAnniv ? 1 : 0)
    case 'M':
      return moisEntiers
    case 'D':
      return e - s
    case 'YM':
      return ((moisEntiers % 12) + 12) % 12
    case 'MD':
      return f.j >= d.j ? f.j - d.j : f.j - d.j + joursDuMois(f.m === 1 ? f.a - 1 : f.a, f.m === 1 ? 12 : f.m - 1)
    case 'YD':
      return joursCivils(f.a, f.m, f.j) - joursCivils(avantAnniv ? f.a - 1 : f.a, d.m, d.j)
    default:
      return echec('#VALUE!')
  }
}

const motifPartiel = (s: string): RegExp => new RegExp(corpsJoker(s), 'i')

/** Lit un nombre dans un texte : nombre, pourcentage ou date. */
function valeurDeTexte(t: string): number {
  const n = lireNombre(t)
  if (n !== null) return n
  const p = /^(.*\S)\s*%$/.exec(t.trim())
  const np = p ? lireNombre(p[1]!) : null
  if (np !== null) return net(np / 100)
  const d = lireDate(t)
  if (d !== null) return d
  const h = lireHeure(t)
  return h === null ? echec('#VALUE!') : h
}

function modeUnique(a: Arg[]): number {
  const n = nombres(a)
  const compte = new Map<number, number>()
  for (const x of n) compte.set(x, (compte.get(x) ?? 0) + 1)
  let meilleur: number | undefined
  for (const [x, c] of compte) if (c > 1 && (meilleur === undefined || c > compte.get(meilleur)!)) meilleur = x
  return meilleur === undefined ? echec('#N/A') : meilleur
}

function classement(a: Arg[]): number {
  arite(a, 2, 3)
  const x = nombreArg(a, 0)
  const n = nombres([a[1]!])
  if (!n.includes(x)) return echec('#N/A')
  const croissant = nombreArg(a, 2, 0) !== 0
  return n.filter((y) => (croissant ? y < x : y > x)).length + 1
}

const PARESSEUX: Record<string, Paresseux> = {
  IF: (args, ev) => {
    arite(args, 2, 3)
    if (versBool(scalaire(ev(args[0]!)))) return scalaire(ev(args[1]!))
    return args[2] === undefined ? false : scalaire(ev(args[2]))
  },
  IFERROR: (args, ev) => {
    arite(args, 2)
    try {
      return scalaire(ev(args[0]!))
    } catch (e) {
      if (!(e instanceof ErreurFormule)) throw e
      return scalaire(ev(args[1]!))
    }
  },
  SUMIF: (args, ev, ctx) => si(args, ev, somme, ctx),
  AVERAGEIF: (args, ev, ctx) => si(args, ev, (v) => diviser(somme(v), v.length), ctx),
  IFNA: (args, ev) => {
    arite(args, 2)
    const r = essai(args[0], ev)
    if (r.erreur === '#N/A') return scalaire(ev(args[1]!))
    return r.erreur ? echec(r.erreur) : r.valeur
  },
  IFS: (args, ev) => {
    arite(args, 2, 254)
    if (args.length % 2 !== 0) return echec('#VALUE!')
    for (let i = 0; i < args.length; i += 2) if (versBool(scalaire(ev(args[i]!)))) return scalaire(ev(args[i + 1]!))
    return echec('#N/A')
  },
  SWITCH: (args, ev) => {
    arite(args, 3, 255)
    const cible = scalaire(ev(args[0]!))
    let i = 1
    for (; i + 1 < args.length; i += 2) if (comparer(cible, scalaire(ev(args[i]!))) === 0) return scalaire(ev(args[i + 1]!))
    return i < args.length ? scalaire(ev(args[i]!)) : echec('#N/A')
  },
  CHOOSE: (args, ev) => {
    arite(args, 2, 255)
    const k = Math.trunc(versNombre(scalaire(ev(args[0]!))))
    return k < 1 || k >= args.length ? echec('#VALUE!') : scalaire(ev(args[k]!))
  },
  SUMIFS: (args, ev, ctx) => agregerSi(args, ev, ctx, somme),
  AVERAGEIFS: (args, ev, ctx) => agregerSi(args, ev, ctx, (v) => diviser(somme(v), v.length)),
  MAXIFS: (args, ev, ctx) => agregerSi(args, ev, ctx, (v) => (v.length ? maximum(v) : 0)),
  MINIFS: (args, ev, ctx) => agregerSi(args, ev, ctx, (v) => (v.length ? minimum(v) : 0)),
  COUNTIFS: (args, ev, ctx) => {
    arite(args, 2, 254)
    return filtrer(args, 0, ev, ctx).ok.flat().filter(Boolean).length
  },
  ROW: (args, _ev, ctx) => (arite(args, 0, 1), args.length ? zoneDe(args[0]).l1 + 1 : (ctx.courante?.l ?? 0) + 1),
  COLUMN: (args, _ev, ctx) => (arite(args, 0, 1), args.length ? zoneDe(args[0]).c1 + 1 : (ctx.courante?.c ?? 0) + 1),
  ISBLANK: (args, ev) => (arite(args, 1), (r => !r.erreur && r.valeur === null)(essai(args[0], ev))),
  ISNUMBER: (args, ev) => (arite(args, 1), (r => !r.erreur && typeof r.valeur === 'number')(essai(args[0], ev))),
  ISTEXT: (args, ev) => (arite(args, 1), (r => !r.erreur && typeof r.valeur === 'string')(essai(args[0], ev))),
  ISLOGICAL: (args, ev) => (arite(args, 1), (r => !r.erreur && typeof r.valeur === 'boolean')(essai(args[0], ev))),
  ISERROR: (args, ev) => (arite(args, 1), essai(args[0], ev).erreur !== undefined),
  ISERR: (args, ev) => (arite(args, 1), (r => r.erreur !== undefined && r.erreur !== '#N/A')(essai(args[0], ev))),
  ISNA: (args, ev) => (arite(args, 1), essai(args[0], ev).erreur === '#N/A'),
  COUNTIF: (args, ev, ctx) => {
    arite(args, 2)
    const test = critere(scalaire(ev(args[1]!)))
    return lireMatrice(ctx, zoneDe(args[0])).flat().filter((c) => !c.erreur && test(c.valeur)).length
  },
}

const EAGER: Record<string, Eager> = {
  SUM: (a) => somme(nombres(a)),
  AVERAGE: (a) => {
    const n = nombres(a)
    return diviser(somme(n), n.length)
  },
  MIN: (a) => {
    const n = nombres(a)
    return n.length ? Math.min(...n) : 0
  },
  MAX: (a) => {
    const n = nombres(a)
    return n.length ? Math.max(...n) : 0
  },
  COUNT: (a) => {
    let n = 0
    for (const x of a) {
      if (Array.isArray(x)) n += x.flat().filter((c) => !c.erreur && typeof c.valeur === 'number').length
      else {
        try {
          versNombre(x)
          if (x !== null) n++
        } catch (e) {
          if (!(e instanceof ErreurFormule)) throw e
        }
      }
    }
    return n
  },
  COUNTA: (a) => {
    let n = 0
    for (const x of a) {
      if (Array.isArray(x)) n += x.flat().filter((c) => c.erreur || (c.valeur !== null && c.valeur !== '')).length
      else if (x !== null) n++
    }
    return n
  },
  COUNTBLANK: (a) => {
    let n = 0
    for (const x of a) for (const c of Array.isArray(x) ? x.flat() : [{ valeur: x }]) if (c.valeur === null || c.valeur === '') n++
    return n
  },
  PRODUCT: (a) => {
    const n = nombres(a)
    return n.length ? fini(n.reduce((p, x) => p * x, 1)) : 0
  },
  MEDIAN: (a) => {
    const n = nombres(a).sort((x, y) => x - y)
    if (!n.length) return echec('#VALUE!')
    const m = Math.floor(n.length / 2)
    return n.length % 2 ? n[m]! : net((n[m - 1]! + n[m]!) / 2)
  },
  ROUND: (a) => (arite(a, 1, 2), arrondir(nombreArg(a, 0), nombreArg(a, 1, 0), 'proche')),
  ROUNDUP: (a) => (arite(a, 1, 2), arrondir(nombreArg(a, 0), nombreArg(a, 1, 0), 'haut')),
  ROUNDDOWN: (a) => (arite(a, 1, 2), arrondir(nombreArg(a, 0), nombreArg(a, 1, 0), 'bas')),
  ABS: (a) => (arite(a, 1), Math.abs(nombreArg(a, 0))),
  SQRT: (a) => (arite(a, 1), fini(Math.sqrt(nombreArg(a, 0)))),
  POWER: (a) => {
    arite(a, 2)
    const x = nombreArg(a, 0)
    const y = nombreArg(a, 1)
    return x === 0 && y < 0 ? echec('#DIV/0!') : fini(x ** y)
  },
  MOD: (a) => {
    arite(a, 2)
    const x = nombreArg(a, 0)
    const d = nombreArg(a, 1)
    return d === 0 ? echec('#DIV/0!') : net(x - d * Math.floor(x / d))
  },
  INT: (a) => (arite(a, 1), Math.floor(nombreArg(a, 0))),
  AND: (a) => booleens(a).every(Boolean),
  OR: (a) => booleens(a).some(Boolean),
  NOT: (a) => (arite(a, 1), !versBool(argument(a, 0))),
  CONCAT: (a) => aPlat(a).map(versTexte).join(''),
  CONCATENATE: (a) => aPlat(a).map(versTexte).join(''),
  LEN: (a) => (arite(a, 1), versTexte(argument(a, 0)).length),
  UPPER: (a) => (arite(a, 1), versTexte(argument(a, 0)).toUpperCase()),
  LOWER: (a) => (arite(a, 1), versTexte(argument(a, 0)).toLowerCase()),
  TRIM: (a) => (arite(a, 1), versTexte(argument(a, 0)).trim().replace(/ {2,}/g, ' ')),
  LEFT: (a) => {
    arite(a, 1, 2)
    const n = nombreArg(a, 1, 1)
    return n < 0 ? echec('#VALUE!') : versTexte(argument(a, 0)).slice(0, Math.trunc(n))
  },
  RIGHT: (a) => {
    arite(a, 1, 2)
    const n = Math.trunc(nombreArg(a, 1, 1))
    const t = versTexte(argument(a, 0))
    return n < 0 ? echec('#VALUE!') : n === 0 ? '' : t.slice(-n)
  },
  MID: (a) => {
    arite(a, 3)
    const debut = Math.trunc(nombreArg(a, 1))
    const n = Math.trunc(nombreArg(a, 2))
    if (debut < 1 || n < 0) return echec('#VALUE!')
    return versTexte(argument(a, 0)).slice(debut - 1, debut - 1 + n)
  },
  TEXT: (a) => (arite(a, 2), texteFormate(argument(a, 0), versTexte(argument(a, 1)))),
  TODAY: (a, ctx) => (arite(a, 0), Math.floor(dateVersSerie(ctx.maintenant()))),
  NOW: (a, ctx) => (arite(a, 0), dateVersSerie(ctx.maintenant())),
  DATE: (a) => {
    arite(a, 3)
    let an = Math.trunc(nombreArg(a, 0))
    if (an >= 0 && an < 1900) an += 1900
    return serieDepuisJours(joursCivils(an, Math.trunc(nombreArg(a, 1)), Math.trunc(nombreArg(a, 2))))
  },
  YEAR: (a) => (arite(a, 1), composantes(serieDe(argument(a, 0))).a),
  MONTH: (a) => (arite(a, 1), composantes(serieDe(argument(a, 0))).m),
  DAY: (a) => (arite(a, 1), composantes(serieDe(argument(a, 0))).j),
  VLOOKUP: (a) => rechercheTable(a, false),
  HLOOKUP: (a) => rechercheTable(a, true),
  /* maths */
  CEILING: (a) => {
    arite(a, 1, 2)
    const x = nombreArg(a, 0)
    const s = nombreArg(a, 1, 1)
    if (s === 0 || x === 0) return 0
    if (x > 0 && s < 0) return echec('#VALUE!')
    const p = Math.abs(s)
    return net(s > 0 || x > 0 ? Math.ceil(parseFloat((x / p).toPrecision(15))) * p : Math.floor(parseFloat((x / p).toPrecision(15))) * p)
  },
  FLOOR: (a) => {
    arite(a, 1, 2)
    const x = nombreArg(a, 0)
    const s = nombreArg(a, 1, 1)
    if (s === 0) return x === 0 ? 0 : echec('#DIV/0!')
    if (x > 0 && s < 0) return echec('#VALUE!')
    const p = Math.abs(s)
    return net(s > 0 || x > 0 ? Math.floor(parseFloat((x / p).toPrecision(15))) * p : Math.ceil(parseFloat((x / p).toPrecision(15))) * p)
  },
  TRUNC: (a) => (arite(a, 1, 2), arrondir(nombreArg(a, 0), nombreArg(a, 1, 0), 'bas')),
  SIGN: (a) => (arite(a, 1), Math.sign(nombreArg(a, 0))),
  RAND: (a) => (arite(a, 0), Math.random()),
  RANDBETWEEN: (a) => {
    arite(a, 2)
    const bas = Math.ceil(nombreArg(a, 0))
    const haut = Math.floor(nombreArg(a, 1))
    return bas > haut ? echec('#VALUE!') : bas + Math.floor(Math.random() * (haut - bas + 1))
  },
  LN: (a) => (arite(a, 1), nombreArg(a, 0) <= 0 ? echec('#VALUE!') : fini(Math.log(nombreArg(a, 0)))),
  LOG: (a) => {
    arite(a, 1, 2)
    const x = nombreArg(a, 0)
    const b = nombreArg(a, 1, 10)
    if (x <= 0 || b <= 0) return echec('#VALUE!')
    return b === 1 ? echec('#DIV/0!') : fini(Math.log(x) / Math.log(b))
  },
  LOG10: (a) => (arite(a, 1), nombreArg(a, 0) <= 0 ? echec('#VALUE!') : fini(Math.log10(nombreArg(a, 0)))),
  EXP: (a) => (arite(a, 1), fini(Math.exp(nombreArg(a, 0)))),
  SUMSQ: (a) => fini(nombres(a).reduce((s, x) => s + x * x, 0)),
  SUMPRODUCT: (a) => {
    arite(a, 1, 255)
    const ms = a.map((x): Matrice => (Array.isArray(x) ? x : [[{ valeur: x }]]))
    const h = ms[0]!.length
    const l = ms[0]![0]?.length ?? 0
    if (ms.some((m) => m.length !== h || m.some((ligne) => ligne.length !== l))) return echec('#VALUE!')
    let total = 0
    for (let i = 0; i < h; i++)
      for (let j = 0; j < l; j++) {
        let p = 1
        for (const m of ms) {
          const c = m[i]![j]!
          if (c.erreur) echec(c.erreur)
          p *= typeof c.valeur === 'number' ? c.valeur : 0
        }
        total += p
      }
    return fini(total)
  },
  QUOTIENT: (a) => (arite(a, 2), nombreArg(a, 1) === 0 ? echec('#DIV/0!') : Math.trunc(nombreArg(a, 0) / nombreArg(a, 1))),
  GCD: (a) => {
    const n = nombres(a).map(Math.trunc)
    return n.some((x) => x < 0) ? echec('#VALUE!') : n.reduce(pgcd, 0)
  },
  LCM: (a) => {
    const n = nombres(a).map(Math.trunc)
    if (n.some((x) => x < 0)) return echec('#VALUE!')
    return n.reduce((p, x) => (p === 0 || x === 0 ? 0 : fini((p / pgcd(p, x)) * x)), 1)
  },
  FACT: (a) => {
    arite(a, 1)
    const n = Math.trunc(nombreArg(a, 0))
    if (n < 0 || n > 170) return echec('#VALUE!')
    let p = 1
    for (let i = 2; i <= n; i++) p *= i
    return p
  },
  EVEN: (a) => {
    arite(a, 1)
    const x = nombreArg(a, 0)
    const r = Math.ceil(Math.abs(x))
    return (x < 0 ? -1 : 1) * (r % 2 === 0 ? r : r + 1)
  },
  ODD: (a) => {
    arite(a, 1)
    const x = nombreArg(a, 0)
    const r = Math.ceil(Math.abs(x))
    return (x < 0 ? -1 : 1) * (r % 2 === 1 ? r : r + 1)
  },
  RADIANS: (a) => (arite(a, 1), fini((nombreArg(a, 0) * Math.PI) / 180)),
  DEGREES: (a) => (arite(a, 1), fini((nombreArg(a, 0) * 180) / Math.PI)),
  SIN: (a) => (arite(a, 1), fini(Math.sin(nombreArg(a, 0)))),
  COS: (a) => (arite(a, 1), fini(Math.cos(nombreArg(a, 0)))),
  TAN: (a) => (arite(a, 1), fini(Math.tan(nombreArg(a, 0)))),
  ASIN: (a) => (arite(a, 1), Math.abs(nombreArg(a, 0)) > 1 ? echec('#VALUE!') : fini(Math.asin(nombreArg(a, 0)))),
  ACOS: (a) => (arite(a, 1), Math.abs(nombreArg(a, 0)) > 1 ? echec('#VALUE!') : fini(Math.acos(nombreArg(a, 0)))),
  ATAN: (a) => (arite(a, 1), fini(Math.atan(nombreArg(a, 0)))),
  ATAN2: (a) => {
    arite(a, 2)
    const x = nombreArg(a, 0)
    const y = nombreArg(a, 1)
    return x === 0 && y === 0 ? echec('#DIV/0!') : fini(Math.atan2(y, x))
  },
  /* logique */
  XOR: (a) => booleens(a).filter(Boolean).length % 2 === 1,
  TRUE: (a) => (arite(a, 0), true),
  FALSE: (a) => (arite(a, 0), false),
  NA: (a) => (arite(a, 0), echec('#N/A')),
  ISEVEN: (a) => (arite(a, 1), Math.trunc(Math.abs(nombreArg(a, 0))) % 2 === 0),
  ISODD: (a) => (arite(a, 1), Math.trunc(Math.abs(nombreArg(a, 0))) % 2 === 1),
  /* statistiques */
  MODE: (a) => modeUnique(a),
  'MODE.SNGL': (a) => modeUnique(a),
  STDEV: (a) => fini(Math.sqrt(variance(nombres(a), true))),
  'STDEV.S': (a) => fini(Math.sqrt(variance(nombres(a), true))),
  STDEVP: (a) => fini(Math.sqrt(variance(nombres(a), false))),
  'STDEV.P': (a) => fini(Math.sqrt(variance(nombres(a), false))),
  VAR: (a) => variance(nombres(a), true),
  'VAR.S': (a) => variance(nombres(a), true),
  VARP: (a) => variance(nombres(a), false),
  'VAR.P': (a) => variance(nombres(a), false),
  LARGE: (a) => rang(a, true),
  SMALL: (a) => rang(a, false),
  RANK: (a) => classement(a),
  'RANK.EQ': (a) => classement(a),
  AVERAGEA: (a) => {
    const n: number[] = []
    for (const x of a) {
      if (!Array.isArray(x)) n.push(versNombre(x))
      else
        for (const c of x.flat()) {
          if (c.erreur) echec(c.erreur)
          if (typeof c.valeur === 'number') n.push(c.valeur)
          else if (typeof c.valeur === 'boolean') n.push(c.valeur ? 1 : 0)
          else if (typeof c.valeur === 'string') n.push(0)
        }
    }
    return diviser(somme(n), n.length)
  },
  /* recherche */
  INDEX: (a) => {
    arite(a, 2, 3)
    const m = matriceArg(a[0])
    const h = m.length
    const l = m[0]?.length ?? 0
    let r = entier(a, 1)
    let c = a[2] === undefined ? undefined : entier(a, 2)
    if (c === undefined) {
      if (h === 1) [r, c] = [1, r]
      else if (l === 1) c = 1
      else return echec('#VALUE!')
    }
    if (r < 0 || c < 0 || r === 0 || c === 0) return echec('#VALUE!')
    if (r > h || c > l) return echec('#REF!')
    const cel = m[r - 1]![c - 1]!
    return cel.erreur ? echec(cel.erreur) : cel.valeur
  },
  MATCH: (a) => {
    arite(a, 2, 3)
    const type = entier(a, 2, 1)
    const k = chercher(argument(a, 0), vecteur(a[1]), type > 0 ? 1 : type < 0 ? -1 : 0)
    return k < 0 ? echec('#N/A') : k + 1
  },
  XLOOKUP: (a) => {
    arite(a, 3, 6)
    const cherche = argument(a, 0)
    const cles = vecteur(a[1])
    const rendus = vecteur(a[2])
    if (cles.length !== rendus.length) return echec('#VALUE!')
    const mode = entier(a, 4, 0)
    const sens = entier(a, 5, 1)
    if (![0, 1, -1, 2].includes(mode) || ![1, -1].includes(sens)) return echec('#VALUE!')
    const ordre = cles.map((_, i) => (sens === 1 ? i : cles.length - 1 - i))
    const pareil = (x: Resultat) => !x.erreur && x.valeur !== null && typeof x.valeur === typeof cherche
    let k = ordre.find((i) => {
      const c = cles[i]!
      if (!pareil(c)) return false
      if (mode === 2 && typeof cherche === 'string' && /[*?]/.test(cherche)) return motifJoker(cherche).test(c.valeur as string)
      return comparer(c.valeur, cherche) === 0
    })
    if (k === undefined && (mode === 1 || mode === -1)) {
      for (const i of ordre) {
        const c = cles[i]!
        if (!pareil(c)) continue
        const d = comparer(c.valeur, cherche)
        if (mode === -1 ? d >= 0 : d <= 0) continue
        if (k === undefined || comparer(c.valeur, cles[k]!.valeur) * (mode === -1 ? 1 : -1) > 0) k = i
      }
    }
    if (k === undefined) return a[3] === undefined ? echec('#N/A') : argument(a, 3)
    const cel = rendus[k]!
    return cel.erreur ? echec(cel.erreur) : cel.valeur
  },
  ROWS: (a) => (arite(a, 1), Array.isArray(a[0]) ? a[0].length : 1),
  COLUMNS: (a) => (arite(a, 1), Array.isArray(a[0]) ? (a[0][0]?.length ?? 0) : 1),
  /* texte */
  PROPER: (a) => (arite(a, 1), versTexte(argument(a, 0)).toLowerCase().replace(/(^|[^\p{L}])(\p{L})/gu, (_m, p: string, l: string) => p + l.toUpperCase())),
  SUBSTITUTE: (a) => {
    arite(a, 3, 4)
    const t = versTexte(argument(a, 0))
    const ancien = versTexte(argument(a, 1))
    const neuf = versTexte(argument(a, 2))
    if (ancien === '') return t
    if (a[3] === undefined) return t.split(ancien).join(neuf)
    const n = entier(a, 3)
    if (n < 1) return echec('#VALUE!')
    let pos = -ancien.length
    for (let i = 0; i < n; i++) {
      pos = t.indexOf(ancien, pos + ancien.length)
      if (pos < 0) return t
    }
    return t.slice(0, pos) + neuf + t.slice(pos + ancien.length)
  },
  REPLACE: (a) => {
    arite(a, 4)
    const t = versTexte(argument(a, 0))
    const debut = entier(a, 1)
    const n = entier(a, 2)
    if (debut < 1 || n < 0) return echec('#VALUE!')
    return t.slice(0, debut - 1) + versTexte(argument(a, 3)) + t.slice(debut - 1 + n)
  },
  FIND: (a) => {
    arite(a, 2, 3)
    const t = versTexte(argument(a, 1))
    const debut = entier(a, 2, 1)
    if (debut < 1 || debut > t.length + 1) return echec('#VALUE!')
    const k = t.indexOf(versTexte(argument(a, 0)), debut - 1)
    return k < 0 ? echec('#VALUE!') : k + 1
  },
  SEARCH: (a) => {
    arite(a, 2, 3)
    const t = versTexte(argument(a, 1))
    const debut = entier(a, 2, 1)
    if (debut < 1 || debut > t.length + 1) return echec('#VALUE!')
    const m = motifPartiel(versTexte(argument(a, 0))).exec(t.slice(debut - 1))
    return m ? m.index + debut : echec('#VALUE!')
  },
  REPT: (a) => {
    arite(a, 2)
    const t = versTexte(argument(a, 0))
    const n = entier(a, 1)
    return n < 0 || t.length * n > 32767 ? echec('#VALUE!') : t.repeat(n)
  },
  TEXTJOIN: (a) => {
    arite(a, 3, 255)
    const ignorer = versBool(argument(a, 1))
    return aPlat(a.slice(2))
      .filter((x) => !(ignorer && (x === null || x === '')))
      .map(versTexte)
      .join(versTexte(argument(a, 0)))
  },
  EXACT: (a) => (arite(a, 2), versTexte(argument(a, 0)) === versTexte(argument(a, 1))),
  VALUE: (a) => {
    arite(a, 1)
    const x = argument(a, 0)
    if (typeof x === 'number') return x
    if (x === null) return 0
    return typeof x === 'boolean' ? echec('#VALUE!') : valeurDeTexte(x)
  },
  T: (a) => {
    arite(a, 1)
    const x = argument(a, 0)
    return typeof x === 'string' ? x : ''
  },
  N: (a) => {
    arite(a, 1)
    const x = argument(a, 0)
    return typeof x === 'number' ? x : typeof x === 'boolean' ? Number(x) : 0
  },
  CHAR: (a) => {
    arite(a, 1)
    const n = Math.trunc(nombreArg(a, 0))
    return n < 1 || n > 255 ? echec('#VALUE!') : String.fromCharCode(n)
  },
  CODE: (a) => {
    arite(a, 1)
    const t = versTexte(argument(a, 0))
    return t === '' ? echec('#VALUE!') : t.charCodeAt(0)
  },
  CLEAN: (a) => (arite(a, 1), versTexte(argument(a, 0)).replace(/[\u0000-\u001f]/g, '')),
  /* dates */
  TIME: (a) => {
    arite(a, 3)
    const s = entier(a, 0) * 3600 + entier(a, 1) * 60 + entier(a, 2)
    return s < 0 ? echec('#VALUE!') : (s % 86400) / 86400
  },
  HOUR: (a) => (arite(a, 1), Math.floor(secondesDuJour(serieDe(argument(a, 0))) / 3600)),
  MINUTE: (a) => (arite(a, 1), Math.floor((secondesDuJour(serieDe(argument(a, 0))) % 3600) / 60)),
  SECOND: (a) => (arite(a, 1), secondesDuJour(serieDe(argument(a, 0))) % 60),
  WEEKDAY: (a) => {
    arite(a, 1, 2)
    const j = jourSemaine(serieDe(argument(a, 0)))
    const type = entier(a, 1, 1)
    if (type === 1) return j + 1
    if (type === 2) return ((j + 6) % 7) + 1
    if (type === 3) return (j + 6) % 7
    if (type >= 11 && type <= 17) return ((j - ((type - 10) % 7) + 7) % 7) + 1
    return echec('#VALUE!')
  },
  WEEKNUM: (a) => {
    arite(a, 1, 2)
    const s = serieDe(argument(a, 0))
    const type = entier(a, 1, 1)
    if (type === 21) return semaineIso(s)
    const debut = type === 1 || type === 17 ? 0 : type === 2 ? 1 : type >= 11 && type <= 16 ? type - 10 : -1
    return debut < 0 ? echec('#VALUE!') : numeroSemaine(s, debut)
  },
  ISOWEEKNUM: (a) => (arite(a, 1), semaineIso(serieDe(argument(a, 0)))),
  EDATE: (a) => (arite(a, 2), ajouterMois(serieDe(argument(a, 0)), entier(a, 1))),
  EOMONTH: (a) => {
    arite(a, 2)
    const { a: an, m } = composantes(serieDe(argument(a, 0)))
    return serieDepuisJours(joursCivils(an, m + entier(a, 1) + 1, 1) - 1)
  },
  DATEDIF: (a) => datedif(a),
  DAYS: (a) => (arite(a, 2), Math.floor(serieDe(argument(a, 0))) - Math.floor(serieDe(argument(a, 1)))),
  DAYS360: (a) => (arite(a, 2, 3), jours360(Math.floor(serieDe(argument(a, 0))), Math.floor(serieDe(argument(a, 1))), a[2] === undefined ? false : versBool(argument(a, 2)))),
  NETWORKDAYS: (a) => {
    arite(a, 2, 3)
    const s = Math.floor(serieDe(argument(a, 0)))
    const e = Math.floor(serieDe(argument(a, 1)))
    const conges = feries(a[2])
    let n = 0
    for (let d = Math.min(s, e); d <= Math.max(s, e); d++) if (ouvre(d, conges)) n++
    return s <= e ? n : -n
  },
  WORKDAY: (a) => {
    arite(a, 2, 3)
    let d = Math.floor(serieDe(argument(a, 0)))
    let reste = entier(a, 1)
    const pas = reste < 0 ? -1 : 1
    const conges = feries(a[2])
    for (reste = Math.abs(reste); reste > 0; ) {
      d += pas
      if (ouvre(d, conges)) reste--
    }
    return d
  },
  DATEVALUE: (a) => {
    arite(a, 1)
    const x = argument(a, 0)
    const d = typeof x === 'string' ? lireDate(x) : null
    return d === null ? echec('#VALUE!') : d
  },
  TIMEVALUE: (a) => {
    arite(a, 1)
    const x = argument(a, 0)
    const h = typeof x === 'string' ? lireHeure(x) : null
    return h === null ? echec('#VALUE!') : h
  },
  YEARFRAC: (a) => {
    arite(a, 2, 3)
    return fini(anneeFraction(serieDe(argument(a, 0)), serieDe(argument(a, 1)), entier(a, 2, 0)))
  },
  PI: (a) => (arite(a, 0), Math.PI),
}

/** Pour AND et OR : les booléens et les nombres d'une plage, les textes et le vide d'une plage sont ignorés. */
function booleens(args: Arg[]): boolean[] {
  const out: boolean[] = []
  for (const a of args) {
    if (Array.isArray(a)) {
      for (const c of a.flat()) {
        if (c.erreur) echec(c.erreur)
        if (typeof c.valeur === 'boolean') out.push(c.valeur)
        else if (typeof c.valeur === 'number') out.push(c.valeur !== 0)
      }
    } else out.push(versBool(a))
  }
  if (!out.length) return echec('#VALUE!')
  return out
}

/** Les noms des fonctions, triés. */
export const FONCTIONS: readonly string[] = [...Object.keys(EAGER), ...Object.keys(PARESSEUX)].sort()

function evaluerNoeud(n: Noeud, ctx: Contexte, argumentDeFonction = false): Arg {
  const ev: Evaluer = (x) => evaluerNoeud(x, ctx, true)
  switch (n.t) {
    case 'num':
    case 'str':
    case 'bool':
      return n.v
    case 'vide':
      return null
    case 'err':
      return echec(n.code)
    case 'nom':
      return echec('#NAME?')
    case 'ref': {
      if (!dansLaGrille(ctx, n.l, n.c)) return echec('#REF!')
      const r = ctx.cellule(n.l, n.c)
      if (argumentDeFonction) return [[r]]
      return r.erreur ? echec(r.erreur) : r.valeur
    }
    case 'plage':
      return lireMatrice(ctx, n)
    case 'appel': {
      const lazy = PARESSEUX[n.nom]
      if (lazy) return lazy(n.args, ev, ctx)
      const f = EAGER[n.nom]
      if (!f) return echec('#NAME?')
      return f(n.args.map(ev), ctx)
    }
    case 'un': {
      const x = versNombre(scalaire(evaluerNoeud(n.e, ctx)))
      return n.op === '-' ? -x : x
    }
    case 'pct':
      return net(versNombre(scalaire(evaluerNoeud(n.e, ctx))) / 100)
    case 'bin': {
      const g = scalaire(evaluerNoeud(n.g, ctx))
      const d = scalaire(evaluerNoeud(n.d, ctx))
      switch (n.op) {
        case '&':
          return versTexte(g) + versTexte(d)
        case '=':
          return comparer(g, d) === 0
        case '<>':
          return comparer(g, d) !== 0
        case '<':
          return comparer(g, d) < 0
        case '>':
          return comparer(g, d) > 0
        case '<=':
          return comparer(g, d) <= 0
        case '>=':
          return comparer(g, d) >= 0
      }
      const x = versNombre(g)
      const y = versNombre(d)
      switch (n.op) {
        case '+':
          return fini(x + y)
        case '-':
          return fini(x - y)
        case '*':
          return fini(x * y)
        case '/':
          return diviser(x, y)
        default:
          return x === 0 && y < 0 ? echec('#DIV/0!') : fini(x ** y)
      }
    }
  }
}

const horlogeSysteme = () => new Date()

/**
 * Évalue toute la table. Une cellule qui n'est pas une formule rend sa valeur lue (nombre, booléen, vide, texte) ;
 * une formule (`=…`) est calculée une seule fois, ses dépendances d'abord ; une erreur se propage à qui l'utilise.
 * `maintenant` donne l'heure à TODAY et NOW.
 */
export function evaluerTable(
  cellules: readonly (readonly string[])[],
  maintenant: () => Date = horlogeSysteme,
): Resultat[][] {
  const colonnes = Math.max(0, ...cellules.map((l) => l.length))
  const memo: (Resultat | undefined)[][] = cellules.map(() => Array<Resultat | undefined>(colonnes).fill(undefined))
  const enCours = new Set<string>()
  const analyses = new Map<string, Noeud | CodeErreur>()

  const ctx: Contexte = { lignes: cellules.length, colonnes, maintenant, cellule: (i, j) => calculer(i, j) }

  function calculer(i: number, j: number): Resultat {
    const connu = memo[i]![j]
    if (connu) return connu
    const cle = `${i}:${j}`
    if (enCours.has(cle)) return { valeur: null, erreur: '#CYCLE!' }
    const texte = cellules[i]?.[j] ?? ''
    let r: Resultat
    if (!texte.startsWith('=')) r = { valeur: lireBrut(texte) }
    else {
      enCours.add(cle)
      const avant = ctx.courante
      ctx.courante = { l: i, c: j }
      r = formule(texte)
      ctx.courante = avant
      enCours.delete(cle)
    }
    memo[i]![j] = r
    return r
  }

  function formule(texte: string): Resultat {
    let arbre = analyses.get(texte)
    if (arbre === undefined) {
      arbre = analyser(texte)
      analyses.set(texte, arbre)
    }
    if (typeof arbre === 'string') return { valeur: null, erreur: arbre }
    try {
      const v = evaluerNoeud(arbre, ctx)
      if (Array.isArray(v)) return { valeur: null, erreur: '#VALUE!' }
      return { valeur: v === null ? 0 : v }
    } catch (e) {
      if (e instanceof ErreurFormule) return { valeur: null, erreur: e.code }
      throw e
    }
  }

  return cellules.map((_, i) => Array.from({ length: colonnes }, (_, j) => calculer(i, j)))
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Suggestions et saisie                                                                                         */
/* ------------------------------------------------------------------------------------------------------------ */

const SUGGESTIONS_VIDES = ['SUM', 'IF', 'MIN', 'MAX', 'COUNT', 'AVERAGE']

/** Les fonctions à proposer : six usuelles sans requête, sinon celles qui commencent par elle (courtes d'abord). */
export function suggererFonctions(requete: string): string[] {
  if (requete === '') return [...SUGGESTIONS_VIDES]
  const q = requete.toUpperCase()
  return FONCTIONS.filter((f) => f.startsWith(q)).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))
}

/** Le nombre de guillemets avant `fin` est impair : on est dans une chaîne. */
const dansUneChaine = (texte: string, fin: number): boolean => (texte.slice(0, fin).match(/"/g)?.length ?? 0) % 2 === 1

const DECLENCHEURS = '=(,;+-*/^&<> '

/**
 * Faut-il ouvrir l'autocomplétion ? `debut` : où commence la requête dans le texte. Oui quand le texte est
 * exactement `=` ou que le curseur suit un déclencheur (requête vide), ou quand un mot de lettres, `_` et `.`
 * (jamais de chiffre) suit un déclencheur juste avant le curseur.
 */
export function requeteAutocompletion(texte: string, curseur: number): { debut: number; requete: string } | null {
  if (texte === '=') return { debut: 1, requete: '' }
  if (!texte.startsWith('=')) return null
  const avant = texte.slice(0, curseur)
  const m = /([A-Za-z_.]+)$/.exec(avant)
  const debut = m ? m.index : avant.length
  const declencheur = avant[debut - 1]
  if (declencheur === undefined || !DECLENCHEURS.includes(declencheur)) return null
  if (dansUneChaine(texte, debut)) return null
  return { debut, requete: m ? m[1]! : '' }
}

/** Un clic sur une cellule doit-il citer sa référence ? Oui juste après un opérateur, `(`, `,`, `;` ou `=`. */
export function modeCitation(texte: string, curseur: number): boolean {
  if (!texte.startsWith('=') || curseur < 1) return false
  if (dansUneChaine(texte, curseur)) return false
  const avant = texte.slice(0, curseur).trimEnd()
  const dernier = avant[avant.length - 1]
  return dernier !== undefined && '+-*/^&<>=(,;'.includes(dernier)
}

/** Les références et plages du texte, avec leur place, pour les colorer. */
export function citerReferences(texte: string): Citation[] {
  if (!texte.startsWith('=')) return []
  const jetons = lire(texte, 1)
  const out: Citation[] = []
  for (let i = 0; i < jetons.length; i++) {
    const j = jetons[i]!
    if (j.k !== 'ref') continue
    const deuxPoints = jetons[i + 1]
    const f = jetons[i + 2]
    if (deuxPoints?.k === 'op' && deuxPoints.v === ':' && f?.k === 'ref') {
      out.push({
        debut: j.debut,
        fin: f.fin,
        plage: {
          l1: Math.min(j.ref.ligne, f.ref.ligne),
          c1: Math.min(j.ref.colonne, f.ref.colonne),
          l2: Math.max(j.ref.ligne, f.ref.ligne),
          c2: Math.max(j.ref.colonne, f.ref.colonne),
        },
      })
      i += 2
    } else out.push({ debut: j.debut, fin: j.fin, plage: { l1: j.ref.ligne, c1: j.ref.colonne, l2: j.ref.ligne, c2: j.ref.colonne } })
  }
  return out
}

/** Ajoute les `)` qui manquent (et le guillemet d'une chaîne restée ouverte). */
export function fermerParentheses(texte: string): string {
  if (!texte.startsWith('=')) return texte
  let profondeur = 0
  let chaine = false
  for (const c of texte) {
    if (c === '"') chaine = !chaine
    else if (!chaine) {
      if (c === '(') profondeur++
      else if (c === ')' && profondeur > 0) profondeur--
    }
  }
  return texte + (chaine ? '"' : '') + ')'.repeat(profondeur)
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Réécriture des références                                                                                     */
/* ------------------------------------------------------------------------------------------------------------ */

/**
 * Un changement de structure de la grille. `a` : l'indice d'insertion (les lignes neuves occupent `a` à
 * `a + n - 1`) ou de la première ligne retirée. `deplacer` : le bloc `de` à `de + n - 1` est repris et remis
 * de façon que sa première ligne soit à l'indice `vers` dans la grille obtenue.
 */
export type OperationStructure =
  | { genre: 'insererLignes'; a: number; n: number }
  | { genre: 'retirerLignes'; a: number; n: number }
  | { genre: 'insererColonnes'; a: number; n: number }
  | { genre: 'retirerColonnes'; a: number; n: number }
  | { genre: 'deplacerLignes'; de: number; n: number; vers: number }
  | { genre: 'deplacerColonnes'; de: number; n: number; vers: number }

/** Le nouvel indice, ou null si l'indice disparaît. */
function nouvelIndice(i: number, op: OperationStructure): number | null {
  if (op.genre === 'insererLignes' || op.genre === 'insererColonnes') return i >= op.a ? i + op.n : i
  if (op.genre === 'retirerLignes' || op.genre === 'retirerColonnes') {
    if (i < op.a) return i
    return i >= op.a + op.n ? i - op.n : null
  }
  if (i >= op.de && i < op.de + op.n) return i - op.de + op.vers
  const reste = i > op.de ? i - op.n : i
  return reste >= op.vers ? reste + op.n : reste
}

const surLignes = (op: OperationStructure) => op.genre.endsWith('Lignes')

/** Les bornes d'une plage après une opération ; null si elle disparaît. */
function nouvellesBornes(lo: number, hi: number, op: OperationStructure): [number, number] | null {
  if (op.genre === 'retirerLignes' || op.genre === 'retirerColonnes') {
    const fin = op.a + op.n
    const a = lo < op.a ? lo : lo >= fin ? lo - op.n : op.a
    const b = hi < op.a ? hi : hi >= fin ? hi - op.n : op.a - 1
    return a > b ? null : [a, b]
  }
  const a = nouvelIndice(lo, op)
  const b = nouvelIndice(hi, op)
  if (a === null || b === null) return null
  return a <= b ? [a, b] : [b, a]
}

/** Un coin de plage avec ses `$`, par axe : les bornes triées emportent leur marque. */
function trier(a: [number, boolean], b: [number, boolean]): [[number, boolean], [number, boolean]] {
  return a[0] <= b[0] ? [a, b] : [b, a]
}

type Remplacement = { debut: number; fin: number; texte: string }

/** Réécrit chaque référence du texte ; `nouvelle` rend le texte neuf, ou null pour `#REF!`. */
function reecrire(
  texte: string,
  unique: (r: Reference) => Reference | null,
  plage: (a: Reference, b: Reference) => [Reference, Reference] | null,
): string {
  if (!texte.startsWith('=')) return texte
  const jetons = lire(texte, 1)
  const remplacements: Remplacement[] = []
  for (let i = 0; i < jetons.length; i++) {
    const j = jetons[i]!
    if (j.k !== 'ref') continue
    const deuxPoints = jetons[i + 1]
    const f = jetons[i + 2]
    if (deuxPoints?.k === 'op' && deuxPoints.v === ':' && f?.k === 'ref') {
      const r = plage(j.ref, f.ref)
      remplacements.push({ debut: j.debut, fin: f.fin, texte: r ? `${ecrireReference(r[0])}:${ecrireReference(r[1])}` : '#REF!' })
      i += 2
    } else {
      const r = unique(j.ref)
      remplacements.push({ debut: j.debut, fin: j.fin, texte: r ? ecrireReference(r) : '#REF!' })
    }
  }
  let out = texte
  for (const r of remplacements.reverse()) out = out.slice(0, r.debut) + r.texte + out.slice(r.fin)
  return out
}

/** La formule après un changement de structure : références décalées, supprimées (`#REF!`) ou plages rétrécies. */
export function decalerFormule(texte: string, op: OperationStructure): string {
  const lignes = surLignes(op)
  return reecrire(
    texte,
    (r) => {
      const k = nouvelIndice(lignes ? r.ligne : r.colonne, op)
      if (k === null) return null
      return lignes ? { ...r, ligne: k } : { ...r, colonne: k }
    },
    (a, b) => {
      const [p, q] = lignes ? trier([a.ligne, a.absLigne], [b.ligne, b.absLigne]) : trier([a.colonne, a.absColonne], [b.colonne, b.absColonne])
      const bornes = nouvellesBornes(p[0], q[0], op)
      if (!bornes) return null
      return lignes
        ? [
            { ...a, ligne: bornes[0], absLigne: p[1] },
            { ...b, ligne: bornes[1], absLigne: q[1] },
          ]
        : [
            { ...a, colonne: bornes[0], absColonne: p[1] },
            { ...b, colonne: bornes[1], absColonne: q[1] },
          ]
    },
  )
}

/**
 * La formule recopiée ou collée `dLignes` lignes et `dColonnes` colonnes plus loin : les parties sans `$`
 * suivent, les parties `$` restent. Hors de la grille (négatif, ou au-delà de `dimensions`) : `#REF!`.
 */
export function translaterFormule(
  texte: string,
  dLignes: number,
  dColonnes: number,
  dimensions?: { lignes: number; colonnes: number },
): string {
  const deplacer = (r: Reference): Reference | null => {
    const ligne = r.absLigne ? r.ligne : r.ligne + dLignes
    const colonne = r.absColonne ? r.colonne : r.colonne + dColonnes
    if (ligne < 0 || colonne < 0) return null
    if (dimensions && (ligne >= dimensions.lignes || colonne >= dimensions.colonnes)) return null
    return { ...r, ligne, colonne }
  }
  return reecrire(texte, deplacer, (a, b) => {
    const p = deplacer(a)
    const q = deplacer(b)
    return p && q ? [p, q] : null
  })
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Type du résultat                                                                                              */
/* ------------------------------------------------------------------------------------------------------------ */

const FONCTIONS_DU_TYPE_CITE = ['SUM', 'SUMIF', 'SUMIFS', 'MIN', 'MAX', 'MAXIFS', 'MINIFS', 'AVERAGE', 'AVERAGEIF', 'AVERAGEIFS', 'PRODUCT', 'MEDIAN']
const FONCTIONS_DE_DATE = ['TODAY', 'NOW', 'DATE', 'DATEVALUE', 'EDATE', 'EOMONTH', 'WORKDAY']

/**
 * Le type que prend une formule : `date` pour TODAY, NOW, DATE, EDATE… ; pour SUM, MIN, MAX, AVERAGE… le type de la
 * première cellule citée (celle-ci peut être une formule qui en a un). Sinon `undefined`.
 */
export function typeDuResultat(
  texte: string,
  cellules: readonly (readonly string[])[],
  formats?: readonly (readonly (FormatCellule | null | undefined)[])[],
  profondeur = 0,
): TypeCellule | undefined {
  const m = /^=\s*([A-Za-z]+)\s*\(/.exec(texte)
  if (!m || profondeur > 8) return undefined
  const nom = m[1]!.toUpperCase()
  if (FONCTIONS_DE_DATE.includes(nom)) return 'date'
  if (!FONCTIONS_DU_TYPE_CITE.includes(nom)) return undefined
  const premiere = citerReferences(texte)[0]
  if (!premiere) return undefined
  const { l1, c1 } = premiere.plage
  const type = formats?.[l1]?.[c1]?.type
  if (type) return type
  const source = cellules[l1]?.[c1]
  return source?.startsWith('=') ? typeDuResultat(source, cellules, formats, profondeur + 1) : undefined
}
