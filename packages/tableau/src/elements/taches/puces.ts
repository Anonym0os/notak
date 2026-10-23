import { langue, t } from '../../langue'
/**
 * Ce qui se pose sur une tâche en plus de son texte : une échéance, une personne. Des règles pures sur les
 * attributs de la tâche (`echeance` : `AAAA-MM-JJ`, `assigne` : un nom, libre ou celui d'une personne présente) ; le rendu les lit, hors édition en React, en édition
 * dans la vue du nœud.
 */

export type GenrePuce = 'echeance' | 'assigne'

/** Ce que la tâche dessine à droite de son texte, pour un genre. */
export interface Puce {
  genre: GenrePuce
  /** Rien n'est posé : la puce n'apparaît qu'au survol, pour inviter à la poser. */
  vide: boolean
  texte: string
  titre: string
  /** L'échéance est passée et la tâche n'est pas faite. */
  retard: boolean
  /** La couleur de la pastille d'une personne. */
  teinte?: string
}

/** Quelqu'un à qui confier une tâche. */
export interface Personne {
  nom: string
  couleur?: string
}

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const MOIS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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
  if (jour === aujourdhui) return t('taches.aujourdhui')
  if (jour === decaler(aujourdhui, 1)) return t('taches.demain')
  if (jour === decaler(aujourdhui, -1)) return t('taches.hier')
  const [a, m, j] = jour.split('-').map(Number) as [number, number, number]
  const en = langue() === 'en'
  const court = en ? `${MOIS_EN[m - 1]} ${j}` : `${j} ${MOIS[m - 1]}`
  return String(a) === aujourdhui.slice(0, 4) ? court : en ? `${court}, ${a}` : `${court} ${a}`
}

/** L'échéance d'une tâche, si elle en a une valable. */
export const echeanceDe = (attrs: Record<string, unknown> | undefined): string | null =>
  jourValide(attrs?.echeance) ? attrs.echeance : null

/** Les puces d'une tâche, dans l'ordre où elles se dessinent. `aujourdhui` : `AAAA-MM-JJ`. */
export function puces(attrs: Record<string, unknown> | undefined, aujourdhui: string): Puce[] {
  const jour = echeanceDe(attrs)
  const faite = attrs?.checked === true
  const nom = assigneDe(attrs)
  return [
    {
      genre: 'echeance',
      vide: jour === null,
      texte: jour ? libelleEcheance(jour, aujourdhui) : t('taches.echeance'),
      titre: jour ? t('taches.changerEcheance') : t('taches.ajouterEcheance'),
      retard: jour !== null && !faite && jour < aujourdhui,
    },
    {
      genre: 'assigne',
      vide: nom === null,
      texte: nom ? initiales(nom) : t('taches.assigner'),
      titre: nom ? t('taches.assigneeA', { nom }) : t('taches.assignerQuelquun'),
      retard: false,
      ...(nom ? { teinte: teinteDe(nom) } : {}),
    },
  ]
}

/** Le nom de la personne assignée, s'il y en a une. */
export const assigneDe = (attrs: Record<string, unknown> | undefined): string | null => {
  const nom = typeof attrs?.assigne === 'string' ? attrs.assigne.trim() : ''
  return nom === '' ? null : nom
}

/** Les initiales d'un nom (deux au plus), en majuscules. */
export function initiales(nom: string): string {
  const mots = nom.trim().split(/[\s-]+/).filter(Boolean)
  const lettres = mots.length > 1 ? [mots[0]!, mots.at(-1)!] : mots
  return lettres.map((m) => [...m][0]!.toUpperCase()).join('').slice(0, 2)
}

/** Une couleur de pastille tirée du nom : la même partout, sans rien à stocker. */
export function teinteDe(nom: string): string {
  let h = 0
  for (const c of nom.toLowerCase()) h = (h * 31 + c.codePointAt(0)!) % 360
  return `hsl(${h} 45% 40%)`
}

/** Soi d'abord, puis les autres présents ; un nom ne paraît qu'une fois. */
export function personnes(moi: Personne | undefined, autres: readonly Personne[]): Personne[] {
  const vues = new Set<string>()
  return [...(moi ? [moi] : []), ...autres].filter((p) => {
    const cle = p.nom.trim().toLowerCase()
    if (cle === '' || vues.has(cle)) return false
    vues.add(cle)
    return true
  })
}
