import { type Deplacement, MIN_ALIGNER, MIN_REPARTIR, type SensAlignement, aligner, repartir } from '../../coeur/arrangement'
import type { Raccourci } from '../types'
import { selectionDisposable } from './disposables'

const ALIGNER: Record<string, SensAlignement> = {
  KeyA: 'gauche',
  KeyH: 'centre-horizontal',
  KeyD: 'droite',
  KeyW: 'haut',
  KeyV: 'centre-vertical',
  KeyS: 'bas',
}

export const enOperations = (ds: Deplacement[]) => ds.map((d) => ({ type: 'deplacer' as const, ...d }))

/** Alt+lettre aligne ; Cmd+Alt+Maj+H ou V répartit. On lit `code`, car Alt change `key` sur Mac. */
export const raccourciArrangement: Raccourci = (e, contexte) => {
  if (!e.altKey) return false
  const cmd = e.metaKey || e.ctrlKey
  const aligne = !cmd && !e.shiftKey ? ALIGNER[e.code] : undefined
  const repartit = cmd && e.shiftKey && (e.code === 'KeyH' || e.code === 'KeyV')
  if (!aligne && !repartit) return false

  const items = selectionDisposable(contexte)
  if (items.length < (aligne ? MIN_ALIGNER : MIN_REPARTIR)) return false
  const pas = enOperations(aligne ? aligner(items, aligne) : repartir(items, e.code === 'KeyH' ? 'horizontal' : 'vertical'))
  if (pas.length === 0) return false
  contexte.magasin.faire(pas)
  return true
}
