/**
 * Les erreurs récentes de la page, pour le contexte d'un signalement : `console.error`, les erreurs non rattrapées et
 * les promesses rejetées sans suite. Posé au plus tôt, une seule fois ; on garde les 30 dernières.
 */

export interface ErreurNotee {
  quand: number
  texte: string
}

const GARDEES = 30
const LONGUEUR_MAX = 600
const erreurs: ErreurNotee[] = []
let pose = false

function enTexte(v: unknown): string {
  if (v instanceof Error) return `${v.name}: ${v.message}${v.stack ? `\n${v.stack.split('\n').slice(1, 4).join('\n')}` : ''}`
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

export function noterErreur(...morceaux: unknown[]): void {
  const texte = morceaux.map(enTexte).join(' ').slice(0, LONGUEUR_MAX)
  erreurs.push({ quand: Date.now(), texte })
  if (erreurs.length > GARDEES) erreurs.splice(0, erreurs.length - GARDEES)
}

export function erreursRecentes(depuis = 15 * 60_000, maintenant = Date.now()): ErreurNotee[] {
  return erreurs.filter((e) => maintenant - e.quand <= depuis)
}

export function poserJournal(fenetre: Window = window, sortie: Console = console): void {
  if (pose) return
  pose = true
  const origine = sortie.error.bind(sortie)
  sortie.error = (...args: unknown[]) => {
    noterErreur(...args)
    origine(...args)
  }
  fenetre.addEventListener('error', (e) => noterErreur(e.error ?? e.message))
  fenetre.addEventListener('unhandledrejection', (e) => noterErreur('Promesse rejetée :', e.reason))
}
