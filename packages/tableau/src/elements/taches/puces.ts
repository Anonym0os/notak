/**
 * Ce qui se pose sur une tâche en plus de son texte : une échéance, une personne. Des règles pures sur les
 * attributs de la tâche (`echeance` : `AAAA-MM-JJ`) ; le rendu les lit, hors édition en React, en édition
 * dans la vue du nœud.
 */

export type GenrePuce = 'echeance'

/** Ce que la tâche dessine à droite de son texte, pour un genre. */
export interface Puce {
  genre: GenrePuce
  /** Rien n'est posé : la puce n'apparaît qu'au survol, pour inviter à la poser. */
  vide: boolean
  texte: string
  titre: string
  /** L'échéance est passée et la tâche n'est pas faite. */
  retard: boolean
}

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

const nb = (n: number, largeur = 2) => String(n).padStart(largeur, '0')

/** Le jour d'une date, à l'heure de la machine : `AAAA-MM-JJ`. */
export const jourDe = (d: Date) => `${nb(d.getFullYear(), 4)}-${nb(d.getMonth() + 1)}-${nb(d.getDate())}`

/** Le jour `n` jours après `jour` (avant si `n` est négatif). */
export function decaler(jour: string, n: number): string {
  const d = new Date(`${jour}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Est-ce un vrai jour du calendrier, écrit `AAAA-MM-JJ` ? */
export function jourValide(valeur: unknown): valeur is string {
  if (typeof valeur !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return false
  const d = new Date(`${valeur}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valeur
}

/** « Aujourd'hui », « Demain », « Hier », sinon « 12 oct. » (avec l'année si ce n'est pas la même). */
export function libelleEcheance(jour: string, aujourdhui: string): string {
  if (jour === aujourdhui) return "Aujourd'hui"
  if (jour === decaler(aujourdhui, 1)) return 'Demain'
  if (jour === decaler(aujourdhui, -1)) return 'Hier'
  const [a, m, j] = jour.split('-').map(Number) as [number, number, number]
  const court = `${j} ${MOIS[m - 1]}`
  return String(a) === aujourdhui.slice(0, 4) ? court : `${court} ${a}`
}

/** L'échéance d'une tâche, si elle en a une valable. */
export const echeanceDe = (attrs: Record<string, unknown> | undefined): string | null =>
  jourValide(attrs?.echeance) ? attrs.echeance : null

/** Les puces d'une tâche, dans l'ordre où elles se dessinent. `aujourdhui` : `AAAA-MM-JJ`. */
export function puces(attrs: Record<string, unknown> | undefined, aujourdhui: string): Puce[] {
  const jour = echeanceDe(attrs)
  const faite = attrs?.checked === true
  return [
    {
      genre: 'echeance',
      vide: jour === null,
      texte: jour ? libelleEcheance(jour, aujourdhui) : 'Échéance',
      titre: jour ? 'Changer l’échéance' : 'Ajouter une échéance',
      retard: jour !== null && !faite && jour < aujourdhui,
    },
  ]
}
