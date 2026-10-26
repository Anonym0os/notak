/**
 * Les dates de Notak, en fonctions pures : le calendrier mensuel (six semaines de sept jours, les jours des mois
 * voisins masqués) et la mise en forme des dates à l'écran, au même endroit pour les trois produits. Un jour
 * s'écrit `AAAA-MM-JJ`, un mois se compte de 0 (janvier) à 11, une heure s'écrit `HH:MM`.
 */
import { langue } from '../langue'

const nb = (n: number, largeur = 2) => String(n).padStart(largeur, '0')

/** Le jour `AAAA-MM-JJ` de ce rang dans ce mois. */
export const jourDuMois = (annee: number, mois: number, jour: number) => `${nb(annee, 4)}-${nb(mois + 1)}-${nb(jour)}`

/** Le jour d'une date, à l'heure de la machine : `AAAA-MM-JJ`. */
export const jourDe = (d: Date) => jourDuMois(d.getFullYear(), d.getMonth(), d.getDate())

/** Le jour `n` jours après `jour` (avant si `n` est négatif). */
export function decaler(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Le mois qui suit (ou précède, avec un nombre négatif) ce mois. */
export function decalerMois(annee: number, mois: number, n: number): { annee: number; mois: number } {
  const total = annee * 12 + mois + n
  return { annee: Math.floor(total / 12), mois: ((total % 12) + 12) % 12 }
}

/** Le même quantième `n` mois plus loin, ramené au dernier jour du mois s'il n'existe pas (31 → 30). */
export function decalerJourDeMois(jour: string, n: number): string {
  const [a, m, j] = jour.split('-').map(Number) as [number, number, number]
  const v = decalerMois(a, m - 1, n)
  const dernier = new Date(Date.UTC(v.annee, v.mois + 1, 0)).getUTCDate()
  return jourDuMois(v.annee, v.mois, Math.min(j, dernier))
}

/** Dimanche en anglais, lundi ailleurs. */
export const lundiEnPremier = () => langue() !== 'en'

/**
 * Les six semaines du mois : une case par jour, `null` hors du mois. `lundi` : la semaine commence le lundi
 * (sinon le dimanche).
 */
export function semaines(annee: number, mois: number, lundi: boolean): (string | null)[][] {
  const premier = new Date(Date.UTC(annee, mois, 1)).getUTCDay()
  const decalage = lundi ? (premier + 6) % 7 : premier
  const jours = new Date(Date.UTC(annee, mois + 1, 0)).getUTCDate()
  return Array.from({ length: 6 }, (_, s) =>
    Array.from({ length: 7 }, (_, j) => {
      const n = s * 7 + j - decalage + 1
      return n >= 1 && n <= jours ? jourDuMois(annee, mois, n) : null
    }),
  )
}

/** La langue des dates : l'anglais, ou le français. */
const lieu = () => (langue() === 'en' ? 'en' : 'fr')

/** Le nom du mois et l'année : « octobre 2026 ». */
export const nomDuMois = (annee: number, mois: number) =>
  new Intl.DateTimeFormat(lieu(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(annee, mois, 1, 12)))

/** L'initiale de chaque jour de la semaine, dans l'ordre de l'en-tête. */
export function initialesDesJours(lundi: boolean): string[] {
  const format = new Intl.DateTimeFormat(lieu(), { weekday: 'narrow', timeZone: 'UTC' })
  // Le 7 janvier 2024 est un dimanche.
  return Array.from({ length: 7 }, (_, k) => format.format(new Date(Date.UTC(2024, 0, 7 + ((k + (lundi ? 1 : 0)) % 7), 12))))
}

// ———— La mise en forme à l'écran ————

/** Un instant : un nombre de millisecondes, une date, ou un jour `AAAA-MM-JJ` (lu à midi UTC, sans décalage de fuseau). */
export type Instant = number | Date | string

const dateDe = (quand: Instant): Date => (typeof quand === 'string' ? new Date(`${quand}T12:00:00Z`) : new Date(quand))

/** Un jour tel qu'on l'écrit : `long` « 25 octobre 2026 », `court` « 25 oct. », `mois` « octobre 2026 ». */
export type FormeDate = 'long' | 'court' | 'mois'

const OPTIONS_DATE: Record<FormeDate, Intl.DateTimeFormatOptions> = {
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  court: { day: 'numeric', month: 'short' },
  mois: { month: 'long', year: 'numeric' },
}

/** Le jour d'un instant, dans la langue de l'écran. Un jour `AAAA-MM-JJ` s'écrit sans décalage de fuseau. */
export const formaterDate = (quand: Instant, forme: FormeDate = 'long') =>
  new Intl.DateTimeFormat(lieu(), { ...OPTIONS_DATE[forme], ...(typeof quand === 'string' ? { timeZone: 'UTC' } : {}) }).format(dateDe(quand))

/** La date et l'heure d'un instant : « 25 oct. 2026, 14:30 ». */
export const formaterInstant = (quand: Instant) =>
  dateDe(quand).toLocaleString(lieu() === 'en' ? 'en-US' : 'fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

/** L'heure `HH:MM` : les deux nombres, ramenés dans 0-23 et 0-59. */
export function heureDe(h: number, m: number): string {
  return `${nb(((Math.round(h) % 24) + 24) % 24)}:${nb(((Math.round(m) % 60) + 60) % 60)}`
}

/** Les deux nombres d'une heure `HH:MM` (ou `HH:MM:SS`) ; `null` si ce n'en est pas une. */
export function lireHeure(heure: string): { h: number; m: number } | null {
  const c = /^(\d{1,2}):(\d{2})/.exec(heure)
  if (!c) return null
  const h = Number(c[1])
  const m = Number(c[2])
  return h <= 23 && m <= 59 ? { h, m } : null
}
