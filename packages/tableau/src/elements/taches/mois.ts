/**
 * Le calendrier mensuel du choix d'échéance, en fonctions pures : six semaines de sept jours, les jours des mois
 * voisins masqués. Un jour s'écrit `AAAA-MM-JJ`, un mois se compte de 0 (janvier) à 11.
 */
import { langue } from '../../langue'

const nb = (n: number, largeur = 2) => String(n).padStart(largeur, '0')

/** Le jour `AAAA-MM-JJ` de ce rang dans ce mois. */
export const jourDuMois = (annee: number, mois: number, jour: number) => `${nb(annee, 4)}-${nb(mois + 1)}-${nb(jour)}`

/** Le mois qui suit (ou précède, avec un nombre négatif) ce mois. */
export function decalerMois(annee: number, mois: number, n: number): { annee: number; mois: number } {
  const total = annee * 12 + mois + n
  return { annee: Math.floor(total / 12), mois: ((total % 12) + 12) % 12 }
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
