import { langue, t } from '../../langue'
import { decaler, jourDe } from '../../communs/dates'
/**
 * Ce qui se pose sur une tâche en plus de son texte : une échéance, une personne. Des règles pures sur les
 * attributs de la tâche (`echeance` : `AAAA-MM-JJ`, `assigne` : un nom, libre ou celui d'une personne présente) ; le rendu les lit, hors édition en React, en édition
 * dans la vue du nœud.
 */

export type GenrePuce = 'echeance' | 'assigne'

/** L'état d'une puce d'échéance, qui en décide la couleur. */
export type StatutPuce = 'futur' | 'aujourdhui' | 'retard' | 'fait' | 'aucun'

/** Ce que la tâche dessine sous son texte, pour un genre. */
export interface Puce {
  genre: GenrePuce
  /** Rien n'est posé : la puce est là parce qu'on l'a demandée (outil ou raccourci), pour inviter à la poser. */
  vide: boolean
  statut: StatutPuce
  texte: string
  titre: string
  /** L'échéance est passée et la tâche n'est pas faite. */
  retard: boolean
  /** Un rappel est posé : la puce porte une cloche. */
  rappel: boolean
}

/** L'attribut de tâche qui dit qu'une puce vide est demandée, par genre. */
export const DRAPEAU: Record<GenrePuce, 'montreEcheance' | 'montreAssigne'> = { echeance: 'montreEcheance', assigne: 'montreAssigne' }

/** Les attributs à écrire pour effacer ce que porte la puce `genre` en la laissant vide (« Fixer l'échéance », « Assigner à »). */
export const attrsVides = (genre: GenrePuce): Record<string, unknown> =>
  genre === 'echeance' ? { echeance: null, heure: null, rappel: null } : { assigne: null }

/** Les attributs à écrire pour éteindre la puce `genre` : plus de valeur, plus de puce vide non plus. */
export const attrsEteints = (genre: GenrePuce): Record<string, unknown> => ({ ...attrsVides(genre), [DRAPEAU[genre]]: null })

/** Les attributs à écrire pour allumer la puce `genre` (vide si rien n'y est posé). */
export const attrsAllumes = (genre: GenrePuce): Record<string, unknown> => ({ [DRAPEAU[genre]]: true })

/** Les attributs à écrire quand on assigne `nom` (ou plus personne). */
export const attrsPersonne = (nom: string | null): Record<string, unknown> => (nom === null ? { assigne: null } : { assigne: nom, montreAssigne: true })

// ———— Heure et rappel ————

/** Les rappels, dans l'ordre où le choix les propose. */
export type Rappel = 'aucun' | 'echeance' | '10min' | '1h' | 'jour9' | 'veille9'

const RAPPELS: readonly Rappel[] = ['aucun', 'echeance', '10min', '1h', 'jour9', 'veille9']

/** L'heure d'une tâche, `HH:MM`, si elle en a une valable. */
export const heureDe = (attrs: Record<string, unknown> | undefined): string | null =>
  typeof attrs?.heure === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(attrs.heure) ? attrs.heure : null

/** Le rappel posé sur une tâche, s'il est connu. */
export const rappelDe = (attrs: Record<string, unknown> | undefined): Rappel | null =>
  RAPPELS.find((r) => r === attrs?.rappel) ?? null

/** L'instant d'un jour, à une heure `HH:MM`, à l'heure de la machine. */
function instant(jour: string, heure: string): Date {
  const [a, m, j] = jour.split('-').map(Number) as [number, number, number]
  const [h, min] = heure.split(':').map(Number) as [number, number]
  return new Date(a, m - 1, j, h, min)
}

/** L'instant où un rappel sonne pour cette échéance. */
function instantRappel(r: Exclude<Rappel, 'aucun'>, jour: string, heure: string | null): Date {
  if (r === 'jour9') return instant(jour, '09:00')
  if (r === 'veille9') return instant(decaler(jour, -1), '09:00')
  const echeance = instant(jour, heure ?? '00:00')
  return new Date(echeance.getTime() - (r === '10min' ? 10 * 60_000 : r === '1h' ? 3_600_000 : 0))
}

/**
 * Les rappels qu'on propose pour cette échéance, ceux qui sont encore à venir. Sans heure : le jour même à 9 h, la
 * veille à 9 h. Avec une heure : à l'échéance, 10 minutes et une heure avant, et 9 h le jour même si l'échéance est
 * à 9 h ou après. « Aucun rappel » y est toujours.
 */
export function optionsRappel(jour: string, heure: string | null, maintenant: Date): Rappel[] {
  const possibles: Rappel[] = heure === null ? ['jour9', 'veille9'] : ['echeance', '10min', '1h', ...(heure >= '09:00' ? (['jour9'] as const) : []), 'veille9']
  return ['aucun', ...possibles.filter((r) => r !== 'aucun' && instantRappel(r, jour, heure) > maintenant)]
}

/**
 * Le rappel à écrire quand la date ou l'heure change : « aucun » reste choisi, un rappel encore valable reste,
 * sinon 9 h le jour même, ou à défaut le dernier proposé.
 */
export function rappelApres(jour: string, heure: string | null, actuel: Rappel | null, maintenant: Date): Rappel {
  if (actuel === 'aucun') return 'aucun'
  const options = optionsRappel(jour, heure, maintenant)
  if (actuel && options.includes(actuel)) return actuel
  if (options.includes('jour9')) return 'jour9'
  return options.length > 1 ? options.at(-1)! : 'aucun'
}

/** Les attributs à écrire quand on choisit ce jour (ou qu'on l'efface : l'heure et le rappel partent avec). */
export function attrsJour(attrs: Record<string, unknown> | undefined, jour: string | null, maintenant: Date): Record<string, unknown> {
  if (jour === null) return attrsVides('echeance')
  return { echeance: jour, montreEcheance: true, rappel: rappelApres(jour, heureDe(attrs), rappelDe(attrs), maintenant) }
}

/** Les attributs à écrire quand on fixe l'heure (ou qu'on la retire). Sans jour, rien. */
export function attrsHeure(attrs: Record<string, unknown> | undefined, heure: string | null, maintenant: Date): Record<string, unknown> {
  const jour = echeanceDe(attrs)
  if (jour === null) return {}
  return { heure, rappel: rappelApres(jour, heure, rappelDe(attrs), maintenant) }
}

/** `17:00` ou `5:00 PM`, selon la langue. */
export function libelleHeure(heure: string): string {
  if (langue() !== 'en') return heure
  const [h, m] = heure.split(':').map(Number) as [number, number]
  return `${h % 12 === 0 ? 12 : h % 12}:${nb(m)} ${h < 12 ? 'AM' : 'PM'}`
}

/** Quelqu'un à qui confier une tâche. */
export interface Personne {
  nom: string
  couleur?: string
}

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const MOIS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const nb = (n: number, largeur = 2) => String(n).padStart(largeur, '0')

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

/**
 * « Due today », « Due Oct 12 » : le préfixe, puis le jour (« Pour aujourd'hui », « Pour le 12 oct. »), puis l'heure
 * entre parenthèses. Aujourd'hui à une heure déjà passée, le temps écoulé remplace le jour (« Pour il y a 2 heures »).
 */
export function texteEcheance(jour: string, aujourdhui: string, heure: string | null = null, maintenant: Date = new Date(), faite = false): string {
  if (heure !== null && !faite && jour === aujourdhui && instant(jour, heure) < maintenant) {
    const minutes = Math.max(1, Math.round((maintenant.getTime() - instant(jour, heure).getTime()) / 60_000))
    const rtf = new Intl.RelativeTimeFormat(langue() === 'en' ? 'en' : 'fr', { numeric: 'auto' })
    return `${t('taches.pour')} ${minutes < 60 ? rtf.format(-minutes, 'minute') : rtf.format(-Math.floor(minutes / 60), 'hour')}`
  }
  const relatif = [aujourdhui, decaler(aujourdhui, 1), decaler(aujourdhui, -1)].includes(jour)
  const libelle = libelleEcheance(jour, aujourdhui)
  const base =
    langue() === 'en'
      ? `${t('taches.pour')} ${relatif ? libelle.toLowerCase() : libelle}`
      : relatif
        ? `${t('taches.pour')} ${libelle.toLowerCase()}`
        : `${t('taches.pourLe')} ${libelle}`
  return heure === null ? base : `${base} (${libelleHeure(heure)})`
}

/** L'échéance d'une tâche, si elle en a une valable. */
export const echeanceDe = (attrs: Record<string, unknown> | undefined): string | null =>
  jourValide(attrs?.echeance) ? attrs.echeance : null

/**
 * L'état d'une échéance : à venir, aujourd'hui, en retard ; une tâche faite ou sans date est neutre. Sans heure, le
 * retard commence le lendemain ; avec une heure, dès que l'instant est passé.
 */
export function statutEcheance(jour: string | null, faite: boolean, aujourdhui: string, heure: string | null = null, maintenant: Date = new Date()): StatutPuce {
  if (jour === null) return 'aucun'
  if (faite) return 'fait'
  if (heure !== null && instant(jour, heure) < maintenant) return 'retard'
  if (jour < aujourdhui) return 'retard'
  return jour === aujourdhui ? 'aujourdhui' : 'futur'
}

/**
 * Les puces d'une tâche, dans l'ordre où elles se dessinent. `aujourdhui` : `AAAA-MM-JJ`. Une puce paraît quand
 * elle porte une valeur ou quand on l'a demandée ; sinon, rien.
 */
export function puces(attrs: Record<string, unknown> | undefined, aujourdhui: string, maintenant: Date = new Date()): Puce[] {
  const jour = echeanceDe(attrs)
  const heure = jour === null ? null : heureDe(attrs)
  const faite = attrs?.checked === true
  const nom = assigneDe(attrs)
  const res: Puce[] = []
  if (jour !== null || attrs?.montreEcheance === true) {
    const statut = statutEcheance(jour, faite, aujourdhui, heure, maintenant)
    res.push({
      genre: 'echeance',
      vide: jour === null,
      statut,
      texte: jour ? texteEcheance(jour, aujourdhui, heure, maintenant, faite) : t('taches.fixerEcheance'),
      titre: jour ? t('taches.changerEcheance') : t('taches.ajouterEcheance'),
      retard: statut === 'retard',
      rappel: jour !== null && (rappelDe(attrs) ?? 'aucun') !== 'aucun',
    })
  }
  if (nom !== null || attrs?.montreAssigne === true)
    res.push({
      genre: 'assigne',
      vide: nom === null,
      statut: 'aucun',
      texte: nom ? `@${nom}` : t('taches.assignerA'),
      titre: nom ? t('taches.assigneeA', { nom }) : t('taches.assignerQuelquun'),
      retard: false,
      rappel: false,
    })
  return res
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

export { decaler, jourDe }
