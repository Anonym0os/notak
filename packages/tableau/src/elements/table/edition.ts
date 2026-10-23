import type { Id, Table } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { isoDeSerie } from './dates'
import { lireEtat, poserEtat } from './etat'
import { formatsDe } from './grille'
import { passagesDe, peutEtreRiche } from './riche'
import { plageDe } from './actions'

/** Où le texte a été cliqué : le décalage dans le texte de la cellule, si le texte affiché est le texte écrit. */
function positionAuPoint(td: HTMLElement | null, x: number, y: number, brut: string): number | null {
  if (!td) return null
  const doc = document as Document & {
    caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?(x: number, y: number): Range | null
  }
  let noeud: Node | null = null
  let decalage = 0
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y)
    noeud = p?.offsetNode ?? null
    decalage = p?.offset ?? 0
  } else if (doc.caretRangeFromPoint) {
    const r = doc.caretRangeFromPoint(x, y)
    noeud = r?.startContainer ?? null
    decalage = r?.startOffset ?? 0
  }
  if (!noeud || noeud.nodeType !== 3 || !td.contains(noeud) || noeud.textContent !== brut) return null
  return decalage
}

export interface OptionsEdition {
  /** Le texte de départ (un caractère tapé, `=`) ; absent : le contenu de la cellule. */
  texte?: string
  curseur?: number
  /** Le point de l'écran où l'on a cliqué : le curseur y va. */
  point?: { x: number; y: number }
  /** La cellule dans le DOM, pour retrouver le point cliqué dans son texte. */
  noeud?: HTMLElement | null
}

/** Ouvre l'éditeur sur une cellule. Une case à cocher ne s'écrit pas. */
export function ouvrirEdition(contexte: ContexteToile, id: Id, l: number, col: number, options: OptionsEdition = {}): void {
  if (contexte.services.lectureSeule) return
  const el = contexte.magasin.lire().elements.find((x) => x.id === id)
  if (!el || el.contenu.type !== 'table') return
  const tab = el.contenu as Table
  const f = formatsDe(tab)[l]?.[col] ?? null
  const brut = tab.cellules[l]?.[col] ?? ''
  if (f?.type === 'case') return
  const initial = options.texte ?? (f?.type === 'date' && !brut.startsWith('=') ? (isoDeSerie(brut) ?? brut) : brut)
  const auPoint = options.point && options.texte === undefined ? positionAuPoint(options.noeud ?? null, options.point.x, options.point.y, brut) : null
  const plages = lireEtat(id).plages
  // Un texte simple s'écrit dans l'éditeur riche, avec les passages qu'il porte ; un texte tapé d'emblée repart de zéro.
  const passages = peutEtreRiche(f, initial) ? (options.texte === undefined ? passagesDe(f, brut) : []) : undefined
  poserEtat(id, {
    plages: plages.length ? plages : [plageDe({ l, c: col })],
    edition: {
      l,
      c: col,
      texte: initial,
      depart: brut,
      curseur: options.curseur ?? auPoint ?? initial.length,
      maj: 1,
      suggestion: 0,
      citation: null,
      depuisCalendrier: false,
      ...(passages ? { passages } : {}),
    },
  })
}
