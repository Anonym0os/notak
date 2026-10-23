import { type Deplacement, MIN_ALIGNER, MIN_REPARTIR, type SensAlignement, aligner, repartir } from '../../coeur/arrangement'
import type { Element } from '../../coeur/tableau'
import type { Operation } from '../../coeur/tableau'
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

/**
 * Les déplacements en opérations. Une ligne libre n'a pas de position : ses deux bouts se décalent du même écart
 * (`elements` dit lesquels sont des lignes).
 */
export const enOperations = (ds: Deplacement[], elements: readonly Element[] = []): Operation[] =>
  ds.map((d): Operation => {
    const el = elements.find((x) => x.id === d.id)
    if (el?.contenu.type !== 'ligne') return { type: 'deplacer', ...d }
    const [dx, dy] = [d.vers[0] - d.de[0], d.vers[1] - d.de[1]]
    const c = el.contenu
    const bout = (x: typeof c.depart) => ('element' in x ? x : { x: x.x + dx, y: x.y + dy })
    return { type: 'contenu', id: d.id, avant: c, apres: { ...c, depart: bout(c.depart), arrivee: bout(c.arrivee) } }
  })

/** Alt+lettre aligne ; Cmd+Alt+Maj+H ou V répartit. On lit `code`, car Alt change `key` sur Mac. */
export const raccourciArrangement: Raccourci = (e, contexte) => {
  if (!e.altKey) return false
  const cmd = e.metaKey || e.ctrlKey
  const aligne = !cmd && !e.shiftKey ? ALIGNER[e.code] : undefined
  const repartit = cmd && e.shiftKey && (e.code === 'KeyH' || e.code === 'KeyV')
  if (!aligne && !repartit) return false

  const items = selectionDisposable(contexte)
  if (items.length < (aligne ? MIN_ALIGNER : MIN_REPARTIR)) return false
  const pas = enOperations(aligne ? aligner(items, aligne) : repartir(items, e.code === 'KeyH' ? 'horizontal' : 'vertical'), contexte.magasin.lire().elements)
  if (pas.length === 0) return false
  contexte.magasin.faire(pas)
  return true
}
