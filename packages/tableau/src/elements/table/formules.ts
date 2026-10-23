import type { FormatCellule, TypeCellule } from '../../coeur/tableau'

/**
 * Le moteur de formules de la table : une cellule qui commence par `=` est une formule (références A1, plages
 * A1:B3, `$` absolu, opérateurs, une quarantaine de fonctions). Tout est pur : l'horloge se passe en paramètre.
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

function motifJoker(s: string): RegExp {
  const corps = s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${corps}$`, 'i')
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

/** Un numéro de série lu dans un nombre ou dans un texte `aaaa-mm-jj`. */
function serieDe(v: Valeur): number {
  if (typeof v === 'string') {
    const m = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v)
    if (m) return serieDepuisJours(joursCivils(Number(m[1]), Number(m[2]), Number(m[3])))
  }
  return versNombre(v)
}

/* ------------------------------------------------------------------------------------------------------------ */
/* Évaluation                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------ */

interface Contexte {
  lignes: number
  colonnes: number
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
  VLOOKUP: (a) => {
    arite(a, 3, 4)
    const cherche = argument(a, 0)
    const table = matriceArg(a[1])
    const indice = Math.trunc(nombreArg(a, 2))
    const approche = a[3] === undefined ? true : versBool(argument(a, 3))
    if (indice < 1) return echec('#VALUE!')
    if (indice > (table[0]?.length ?? 0)) return echec('#REF!')
    let trouvee: Resultat[] | undefined
    if (approche) {
      for (const ligne of table) {
        const v = ligne[0]!.valeur
        if (v === null || ligne[0]!.erreur || typeof v !== typeof cherche) continue
        if (comparer(v, cherche) <= 0) trouvee = ligne
      }
    } else {
      trouvee = table.find((ligne) => {
        const v = ligne[0]!.valeur
        return !ligne[0]!.erreur && v !== null && typeof v === typeof cherche && comparer(v, cherche) === 0
      })
    }
    if (!trouvee) return echec('#N/A')
    const cel = trouvee[indice - 1]!
    return cel.erreur ? echec(cel.erreur) : cel.valeur
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
      r = formule(texte)
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
 * exactement `=` (requête vide), ou quand des lettres seules suivent un déclencheur juste avant le curseur.
 */
export function requeteAutocompletion(texte: string, curseur: number): { debut: number; requete: string } | null {
  if (texte === '=') return { debut: 1, requete: '' }
  if (!texte.startsWith('=')) return null
  const avant = texte.slice(0, curseur)
  const m = /([A-Za-z]+)$/.exec(avant)
  if (!m) return null
  const debut = m.index
  const declencheur = avant[debut - 1]
  if (declencheur === undefined || !DECLENCHEURS.includes(declencheur)) return null
  if (dansUneChaine(texte, debut)) return null
  return { debut, requete: m[1]! }
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

const FONCTIONS_DU_TYPE_CITE = ['SUM', 'SUMIF', 'MIN', 'MAX', 'AVERAGE', 'AVERAGEIF', 'PRODUCT', 'MEDIAN']
const FONCTIONS_DE_DATE = ['TODAY', 'NOW', 'DATE']

/**
 * Le type que prend une formule : `date` pour TODAY, NOW, DATE ; pour SUM, MIN, MAX, AVERAGE… le type de la
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
