import type { FormatCellule, FormatDate, FormatHeure, TypeCellule } from '../../coeur/tableau'
import { type Langue, langue as langueCourante } from '../../langue'

/* ───────────── Les couleurs du relevé (docs/ecarts/table.md) ───────────── */

export interface CouleurNommee {
  nom: string
  valeur: string
}

/**
 * Couleur du texte et surlignage : des noms, qui suivent le thème (`var(--notak-texte-bleu)`) ; les deux s'excluent.
 * Un hex (couleur d'une table plus ancienne) s'affiche tel quel. Les valeurs claires servent à l'export.
 */
export const COULEURS_TEXTE: readonly CouleurNommee[] = [
  { nom: 'bleu', valeur: '#4ebafd' },
  { nom: 'vert', valeur: '#4eb85a' },
  { nom: 'orange', valeur: '#ff8d22' },
  { nom: 'rouge', valeur: '#f52929' },
  { nom: 'gris', valeur: '#5f6672' },
]

export const SURLIGNAGES: readonly CouleurNommee[] = [
  { nom: 'grisFonce', valeur: '#000000' },
  { nom: 'bleu', valeur: '#8ae0ff' },
  { nom: 'vert', valeur: '#c9f201' },
  { nom: 'orange', valeur: '#ffce26' },
  { nom: 'rose', valeur: '#ffa4de' },
  { nom: 'gris', valeur: '#e8e9eb' },
]

const enCss = (nom: string) => nom.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)

/** La couleur CSS d'une couleur de texte rangée dans une cellule. */
export const couleurTexte = (v: string): string => (v.startsWith('#') ? v : `var(--notak-texte-${enCss(v)})`)
export const couleurSurlignage = (v: string): string => (v.startsWith('#') ? v : `var(--notak-surligne-${enCss(v)})`)
/** La même, en hex du thème clair, pour ce qui sort de Notak (presse-papiers). */
export const hexTexte = (v: string): string => (v.startsWith('#') ? v : (COULEURS_TEXTE.find((c) => c.nom === v)?.valeur ?? v))
export const hexSurlignage = (v: string): string => (v.startsWith('#') ? v : (SURLIGNAGES.find((c) => c.nom === v)?.valeur ?? v))

/** Fond de cellule : aucune, le gris d'en-tête (qui change avec le thème, voir `FOND_ENTETE`), puis les dix couleurs. */
export const FONDS_CELLULE: readonly CouleurNommee[] = [
  { nom: 'entete', valeur: 'entete' },
  { nom: 'cyan', valeur: '#62dbc8' },
  { nom: 'vert', valeur: '#7cd651' },
  { nom: 'brun', valeur: '#d58558' },
  { nom: 'jaune', valeur: '#ffd14d' },
  { nom: 'orange', valeur: '#ff8d48' },
  { nom: 'rouge', valeur: '#ff5757' },
  { nom: 'rose', valeur: '#ff6ed4' },
  { nom: 'violet', valeur: '#ad6fff' },
  { nom: 'bleu', valeur: '#4ebafd' },
  { nom: 'bleuProfond', valeur: '#5882f8' },
]

/** Un fond clair garde un texte sombre, un fond foncé prend un texte blanc. */
export function texteSurFond(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#1f2328'
  const n = parseInt(m[1]!, 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => {
    const c = x / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const l = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
  return l > 0.36 ? '#1f2328' : '#ffffff'
}

export const FOND_ENTETE = { clair: '#d1d3d6', sombre: '#414141' }
export const FOND_CORPS = { clair: '#ffffff', sombre: '#282828' }

/** Les six couleurs des références d'une formule, tour à tour. */
export const COULEURS_REFERENCES = ['#16a0e5', '#ff8d22', '#4eb85a', '#af72ff', '#ff6dd4', '#62dbc8'] as const

/* ───────────── Langues ───────────── */

/**
 * Les nombres et les dates suivent les réglages régionaux du système, comme dans un tableur : une locale BCP 47
 * (`fr-FR`, `en-GB`), ou à défaut la langue de l'interface (`fr`, `en`).
 */
export type Regional = Langue | (string & {})

export const localeDe = (r: Regional): string => (r === 'fr' ? 'fr-FR' : r === 'en' ? 'en-US' : r)

const memo = <T,>(f: (l: string) => T) => {
  const deja = new Map<string, T>()
  return (r: Regional): T => {
    const l = localeDe(r)
    if (!deja.has(l)) deja.set(l, f(l))
    return deja.get(l)!
  }
}

/** La virgule est le séparateur décimal (fr, de, es…). */
const virguleDecimale = memo((l) => new Intl.NumberFormat(l).formatToParts(1.5).find((p) => p.type === 'decimal')?.value === ',')

/** Une date en chiffres s'écrit le jour d'abord (fr, en-GB…), pas le mois (en-US). */
const jourDAbord = memo((l) => {
  const parts = new Intl.DateTimeFormat(l).formatToParts(new Date(2006, 1, 3)).map((p) => p.type)
  return parts.indexOf('day') < parts.indexOf('month')
})

const francais = (r: Regional) => localeDe(r).toLowerCase().startsWith('fr')

/** Les réglages régionaux du système, ou ceux de la langue de l'interface hors navigateur. */
export const regionalDuSysteme = (langue: Regional): Regional =>
  (typeof navigator !== 'undefined' && navigator.language) || langue

/** Les réglages régionaux en vigueur, hors React. */
export const regional = (): Regional => regionalDuSysteme(langueCourante())

/* ───────────── Nombres : lecture, écriture ───────────── */

interface NombreLu {
  /** Forme canonique : signe, chiffres, point décimal, rien d'autre. */
  valeur: string
  /** Décimales telles que tapées. */
  decimales: number
}

const CANON = /^-?\d+(\.\d+)?$/

const nettoyerZeros = (s: string) => s.replace(/^(-?)0+(?=\d)/, '$1')
const decimalesDe = (canon: string) => canon.split('.')[1]?.length ?? 0

/** Lit un nombre écrit à la façon de la langue ; `null` si ce n'en est pas un (ou s'il perdrait des chiffres). */
function lireNombre(brut: string, langue: Regional): NombreLu | null {
  let s = brut.trim().replace(/−/g, '-')
  if (!s) return null
  let signe = ''
  if (s[0] === '-' || s[0] === '+') {
    signe = s[0] === '-' ? '-' : ''
    s = s.slice(1).trimStart()
  }
  let canon: string | null = null
  if (virguleDecimale(langue)) {
    if (/^(\d{1,3}([   ]\d{3})+|\d+)(,\d+)?$/.test(s)) canon = s.replace(/[   ]/g, '').replace(',', '.')
    else if (/^,\d+$/.test(s)) canon = `0${s.replace(',', '.')}`
    else if (/^\d+\.\d+$/.test(s)) canon = s
  } else {
    if (/^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(s)) canon = s.replace(/,/g, '')
    else if (/^\.\d+$/.test(s)) canon = `0${s}`
  }
  if (canon === null) return null
  canon = nettoyerZeros(canon)
  if ((canon.split('.')[0] ?? '').length > 15) return null
  return { valeur: signe + canon, decimales: decimalesDe(canon) }
}

/** Décale la virgule de `k` rangs vers la gauche (k > 0) ou la droite, sur une forme canonique. */
function decaler(canon: string, k: number): string {
  const neg = canon.startsWith('-')
  const [ent = '', dec = ''] = canon.replace('-', '').split('.')
  let chiffres = ent + dec
  let pos = ent.length - k
  if (pos <= 0) {
    chiffres = '0'.repeat(1 - pos) + chiffres
    pos = 1
  } else if (pos > chiffres.length) {
    chiffres += '0'.repeat(pos - chiffres.length)
  }
  const fraction = chiffres.slice(pos).replace(/0+$/, '')
  const sortie = nettoyerZeros(chiffres.slice(0, pos) + (fraction ? `.${fraction}` : ''))
  return (neg && Number(sortie) !== 0 ? '-' : '') + sortie
}

/* ───────────── Dates, façon tableur ───────────── */

const JOUR_MS = 86_400_000
/** Décalage entre le jour compté depuis 1970 et le numéro de série (1899-12-30 vaut 0). */
const DECALAGE_SERIE = 25_569

/** Le numéro de série d'un jour (1 = 1900-01-01, le faux 29/02/1900 vaut 60), `null` hors de 1900-9999. */
function serieDeJour(a: number, m: number, j: number): number | null {
  if (a < 1900 || a > 9999 || m < 1 || m > 12 || j < 1) return null
  if (a === 1900 && m === 2 && j === 29) return 60
  const d = new Date(Date.UTC(a, m - 1, j))
  d.setUTCFullYear(a)
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== j) return null
  const base = Math.round(d.getTime() / JOUR_MS) + DECALAGE_SERIE
  return base < 61 ? base - 1 : base
}

/** Le jour d'un numéro de série entier ; le 60 est le faux 29 février 1900, rendu comme un 28 dont on corrige le jour. */
function jourDeSerie(s: number): { date: Date; faux29: boolean } | null {
  if (!Number.isFinite(s) || s < 1 || s > 2_958_465) return null
  if (s === 60) return { date: new Date(Date.UTC(1900, 1, 28)), faux29: true }
  const base = s < 60 ? s + 1 : s
  return { date: new Date((base - DECALAGE_SERIE) * JOUR_MS), faux29: false }
}

/** Le texte stocké d'une date ISO (`2026-02-01`, avec heure facultative) en numéro de série, `null` sinon. */
function serieDeIso(texte: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?(?:Z)?$/.exec(texte.trim())
  if (!m) return null
  const jour = serieDeJour(Number(m[1]), Number(m[2]), Number(m[3]))
  if (jour === null) return null
  const secondes = Number(m[4] ?? 0) * 3600 + Number(m[5] ?? 0) * 60 + Number(m[6] ?? 0)
  return jour + secondes / 86400
}

/** Un numéro de série lisible d'une valeur stockée : un nombre, ou une date ISO. */
function serieDe(texte: string): number | null {
  const t = texte.trim()
  if (CANON.test(t)) return Number(t)
  return serieDeIso(t)
}

// Les rendus de la langue : les chiffres sont ceux qu'elle donne d'elle-même (01/02/2006 en français, 2/1/2006 aux États-Unis).
const OPTIONS_DATE: Record<Exclude<FormatDate, 'aucun'>, Intl.DateTimeFormatOptions> = {
  long: { dateStyle: 'long' },
  court: { dateStyle: 'medium' },
  chiffres: {},
  chiffresCourts: { year: '2-digit', month: 'numeric', day: 'numeric' },
  tirets: {},
  jour: { dateStyle: 'full' },
}

const OPTIONS_HEURE: Record<Exclude<FormatHeure, 'aucune'>, Intl.DateTimeFormatOptions> = {
  '12h': { hourCycle: 'h12', hour: 'numeric', minute: 'numeric' },
  '12hs': { hourCycle: 'h12', hour: 'numeric', minute: 'numeric', second: 'numeric' },
  '24h': { hourCycle: 'h23', timeStyle: 'short' },
  '24hs': { hourCycle: 'h23', hour: 'numeric', minute: 'numeric', second: 'numeric' },
}

function afficherDate(serie: number, f: FormatCellule, langue: Regional): string | null {
  const total = Math.round(serie * 86400)
  const entier = Math.floor(total / 86400)
  const secondes = total - entier * 86400
  const jour = jourDeSerie(entier)
  if (!jour) return null
  const date = new Date(jour.date.getTime() + secondes * 1000)
  let format: FormatDate = f.date ?? 'chiffres'
  const heure: FormatHeure = f.heure ?? 'aucune'
  if (format === 'aucun' && heure === 'aucune') format = 'chiffres'
  const locale = localeDe(langue)
  let texteDate = ''
  if (format !== 'aucun') {
    const parties = new Intl.DateTimeFormat(locale, { ...OPTIONS_DATE[format], timeZone: 'UTC' }).formatToParts(date)
    texteDate = parties
      .map((p) => {
        if (p.type === 'day' && jour.faux29) return '29'
        if (p.type === 'literal' && format === 'tirets') return p.value.replace(/\//g, '-')
        if (p.type === 'literal' && (format === 'chiffres' || format === 'chiffresCourts')) return p.value.replace(/-/g, '/')
        return p.value
      })
      .join('')
  }
  if (heure === 'aucune') return texteDate
  const texteHeure = new Intl.DateTimeFormat(locale, { ...OPTIONS_HEURE[heure], timeZone: 'UTC' }).format(date)
  if (!texteDate) return texteHeure
  return f.heureEntreParentheses ? `${texteDate} (${texteHeure})` : `${texteDate} ${texteHeure}`
}

/* ───────────── Affichage ───────────── */

const groupement = (f: FormatCellule) => (f.sansMilliers ? false : ('always' as unknown as boolean))

const DECIMALES_MAX = 20
const borneDec = (n: number) => Math.min(Math.max(Math.trunc(n), 0), DECIMALES_MAX)

/** Décimales « autant que tapé » : celles de la valeur stockée, sauf bruit de calcul (0,1 + 0,2). */
function decimalesAuto(valeur: string, n: number): number {
  if (CANON.test(valeur) && decimalesDe(valeur) <= 12) return decimalesDe(valeur)
  return decimalesDe(String(Number(n.toPrecision(15))))
}

/**
 * Le texte affiché d'une cellule selon son type. Une valeur qui ne va pas avec son type s'affiche telle quelle ;
 * une case à cocher n'affiche rien (le rendu dessine la case).
 */
export function afficher(texte: string, format: FormatCellule | null | undefined, langue: Regional): string {
  const type = format?.type
  if (type === 'case') return ''
  if (!format || !type || type === 'texte' || texte === '') return texte
  const locale = localeDe(langue)
  if (type === 'date') {
    const serie = serieDe(texte)
    return (serie === null ? null : afficherDate(serie, format, langue)) ?? texte
  }
  const t = texte.trim()
  if (!CANON.test(t)) return texte
  const n = Number(t)
  if (type === 'nombre') {
    const d = format.decimales === undefined || format.decimales === 'auto' ? decimalesAuto(t, n) : borneDec(format.decimales)
    return new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: groupement(format) }).format(n)
  }
  // Vide : deux décimales ; « auto » : autant que la valeur en porte.
  const d = format.decimales === 'auto' ? decimalesAuto(t, n) : borneDec(format.decimales ?? 2)
  if (type === 'pourcent') {
    return new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: groupement(format) }).format(n)
  }
  const affichage = { symboleEtroit: 'narrowSymbol', symbole: 'symbol', code: 'code', nom: 'name' } as const
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: format.devise ?? 'EUR',
      currencyDisplay: affichage[format.affichageDevise ?? 'symboleEtroit'],
      currencySign: format.comptable ? 'accounting' : 'standard',
      minimumFractionDigits: d,
      maximumFractionDigits: d,
      useGrouping: groupement(format),
    }).format(n)
  } catch {
    return texte
  }
}

/* ───────────── Déduction du type à la saisie ───────────── */

export interface Deduction {
  type: 'nombre' | 'pourcent' | 'monnaie' | 'date'
  /** Ce qui se range dans la cellule : nombre canonique (point décimal), fraction pour un pourcentage, numéro de série pour une date. */
  valeur: string
  options: Pick<FormatCellule, 'devise' | 'decimales' | 'date' | 'heure'>
}

const DEVISES: Record<string, string> = {
  '€': 'EUR', eur: 'EUR', '$': 'USD', usd: 'USD', '£': 'GBP', gbp: 'GBP', '¥': 'JPY', jpy: 'JPY',
  kr: 'SEK', sek: 'SEK', chf: 'CHF', '₩': 'KRW', krw: 'KRW',
}

const SIGNE = '[+\\-\\u2212]'
const SYMBOLE = '[^\\d\\s+\\-\\u2212.,()%:/]'

function deduirePourcent(texte: string, langue: Regional): Deduction | null {
  const m = /^(.*\d)\s*%$/.exec(texte.replace(/[  ]/g, ' ').trim())
  if (!m) return null
  const n = lireNombre(m[1]!, langue)
  if (!n) return null
  return { type: 'pourcent', valeur: decaler(n.valeur, 2), options: n.decimales > 2 ? { decimales: n.decimales } : {} }
}

function deduireMonnaie(texte: string, langue: Regional): Deduction | null {
  const s = texte.trim()
  let signe = ''
  let symbole = ''
  let reste = ''
  const devant = new RegExp(`^(${SIGNE})?\\s*(${SYMBOLE}{1,3})\\s*(${SIGNE}?\\s*\\d.*)$`).exec(s)
  const derriere = new RegExp(`^(${SIGNE}?\\s*\\d.*?)\\s*(${SYMBOLE}{1,3})$`).exec(s)
  if (devant) {
    signe = devant[1] ?? ''
    symbole = devant[2]!
    reste = devant[3]!
  } else if (derriere) {
    symbole = derriere[2]!
    reste = derriere[1]!
  } else return null
  const devise = DEVISES[symbole.toLowerCase()]
  if (!devise) return null
  const n = lireNombre(reste, langue)
  if (!n) return null
  const negatif = /^[-−]/.test(signe) !== n.valeur.startsWith('-')
  const valeur = (negatif ? '-' : '') + n.valeur.replace('-', '')
  return { type: 'monnaie', valeur, options: { devise, ...(n.decimales > 2 ? { decimales: n.decimales } : {}) } }
}

const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.$/, '')

const MOIS = {
  fr: ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'],
  fr_court: ['janv', 'fevr', 'mars', 'avr', 'mai', 'juin', 'juil', 'aout', 'sept', 'oct', 'nov', 'dec'],
  en: ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'],
  en_court: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
}
const JOURS_SEMAINE = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

/** Le mois (1 à 12) d'un nom, et s'il est écrit en entier ; la langue de l'utilisateur d'abord. */
function lireMois(nom: string, langue: Regional): { mois: number; entier: boolean } | null {
  const n = sansAccent(nom)
  const ordre: Langue[] = francais(langue) ? ['fr', 'en'] : ['en', 'fr']
  for (const l of ordre) {
    const entier = MOIS[l].indexOf(n)
    if (entier >= 0) return { mois: entier + 1, entier: true }
    const court = MOIS[`${l}_court`].indexOf(n)
    if (court >= 0) return { mois: court + 1, entier: false }
    if (l === 'en' && n === 'sept') return { mois: 9, entier: false }
  }
  return null
}

const annee2 = (aa: number) => (aa < 30 ? 2000 + aa : 1900 + aa)

function deduireDate(texte: string, langue: Regional): Deduction | null {
  let s = texte.trim().replace(/[  ]/g, ' ')
  let heure: FormatHeure = 'aucune'
  let secondes = 0
  const t = /^(.*\S)(?:\s+|T)(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s)
  if (t) {
    const [h, mi, se] = [Number(t[2]), Number(t[3]), Number(t[4] ?? 0)]
    if (h > 23 || mi > 59 || se > 59) return null
    secondes = h * 3600 + mi * 60 + se
    heure = t[4] === undefined ? '24h' : '24hs'
    s = t[1]!
  }
  let jour: number | null = null
  let date = 'chiffres' as FormatDate
  let m: RegExpExecArray | null
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) {
    jour = serieDeJour(Number(m[1]), Number(m[2]), Number(m[3]))
  } else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/.exec(s))) {
    const [a, b] = jourDAbord(langue) ? [Number(m[1]), Number(m[2])] : [Number(m[2]), Number(m[1])]
    const court = m[3]!.length === 2
    jour = serieDeJour(court ? annee2(Number(m[3])) : Number(m[3]), b, a)
    if (court) date = 'chiffresCourts'
  } else if ((m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(s))) {
    const [a, b] = jourDAbord(langue) ? [Number(m[1]), Number(m[2])] : [Number(m[2]), Number(m[1])]
    jour = serieDeJour(Number(m[3]), b, a)
    date = 'tirets'
  } else {
    const sansSemaine = s.replace(/^([A-Za-zÀ-ÿ]+)\.?,?\s+(?=\d|[A-Za-zÀ-ÿ])/, (tout, mot: string) => {
      if (JOURS_SEMAINE.includes(sansAccent(mot))) {
        date = 'jour'
        return ''
      }
      return tout
    })
    if ((m = /^(\d{1,2})(?:er)?\s+([A-Za-zÀ-ÿ]+\.?)\s+(\d{4})$/.exec(sansSemaine))) {
      const mois = lireMois(m[2]!, langue)
      if (mois) {
        jour = serieDeJour(Number(m[3]), mois.mois, Number(m[1]))
        if (date !== 'jour') date = mois.entier ? 'long' : 'court'
      }
    } else if ((m = /^([A-Za-zÀ-ÿ]+\.?)\s+(\d{1,2}),?\s+(\d{4})$/.exec(sansSemaine))) {
      const mois = lireMois(m[1]!, langue)
      if (mois) {
        jour = serieDeJour(Number(m[3]), mois.mois, Number(m[2]))
        if (date !== 'jour') date = mois.entier ? 'long' : 'court'
      }
    }
  }
  if (jour === null) return null
  const valeur = Number((jour + secondes / 86400).toFixed(9))
  return { type: 'date', valeur: String(valeur), options: { date, heure } }
}

/**
 * Ce que le texte tapé révèle de son type, dans l'ordre : nombre, pourcentage, monnaie, date. `null` si rien :
 * c'est alors du texte. Les séparateurs suivent la langue.
 */
export function deduireType(texte: string, langue: Regional): Deduction | null {
  const t = texte.trim()
  if (!t || t.startsWith('=')) return null
  const n = lireNombre(t, langue)
  if (n) return { type: 'nombre', valeur: n.valeur, options: {} }
  return deduirePourcent(t, langue) ?? deduireMonnaie(t, langue) ?? deduireDate(t, langue)
}

/** Les options qui n'ont de sens que pour un type : elles s'en vont avec lui. */
const CLES_DE_TYPE = ['type', 'decimales', 'sansMilliers', 'devise', 'affichageDevise', 'comptable', 'date', 'heure', 'heureEntreParentheses'] as const

function sansType(f: FormatCellule | null): FormatCellule | null {
  if (!f) return null
  const sortie: FormatCellule = { ...f }
  for (const k of CLES_DE_TYPE) delete sortie[k]
  return Object.keys(sortie).length ? sortie : null
}

/**
 * Ce qui se range quand on tape `texte` dans une cellule de format `ancien` : Texte et Case ne bougent jamais ;
 * une cellule sans type prend celui qu'on déduit ; sinon pourcentage, monnaie et date remplacent le type, une date
 * retombe en nombre, et rien de reconnu ramène à Auto.
 */
export function saisir(ancien: FormatCellule | null | undefined, texte: string, langue: Regional): { texte: string; format: FormatCellule | null } {
  const format = ancien ?? null
  const type = format?.type
  if (type === 'texte' || type === 'case' || texte.trim() === '' || texte.startsWith('=')) return { texte, format }
  const d = deduireType(texte, langue)
  if (!type) {
    if (!d) return { texte, format }
    return { texte: d.valeur, format: { ...format, type: d.type, ...d.options } }
  }
  if (!d) return { texte, format: sansType(format) }
  if (d.type === 'nombre' && type !== 'date') return { texte: d.valeur, format }
  return { texte: d.valeur, format: { ...sansType(format), type: d.type, ...d.options } }
}

/* ───────────── Choix d'un type à la main, alignement ───────────── */

/**
 * Peut-on donner ce type à une cellule qui contient `texte` ? Texte et Auto toujours, une cellule vide tout ; Case
 * seulement `true` ou `false` ; nombre, monnaie, pourcentage une valeur numérique (ou une formule) ; date un numéro
 * de série, une date ISO ou une date qu'on sait lire.
 */
export function peutPrendreType(texte: string, type: TypeCellule | undefined, langue: Regional = 'fr'): boolean {
  if (!type || type === 'texte' || texte === '') return true
  if (type === 'case') return texte === 'true' || texte === 'false'
  if (texte.startsWith('=')) return type !== 'date'
  if (type === 'date') return serieDe(texte) !== null || deduireType(texte, langue)?.type === 'date'
  return CANON.test(texte.trim())
}

/** L'alignement d'une cellule : celui qu'on a choisi, sinon celui de son type (une formule s'aligne à gauche). */
export function alignementDe(format: FormatCellule | null | undefined, estFormule = false): 'gauche' | 'centre' | 'droite' {
  if (format?.alignement) return format.alignement
  if (estFormule) return 'gauche'
  switch (format?.type) {
    case 'nombre':
    case 'monnaie':
    case 'pourcent':
    case 'date':
      return 'droite'
    case 'case':
      return 'centre'
    default:
      return 'gauche'
  }
}
