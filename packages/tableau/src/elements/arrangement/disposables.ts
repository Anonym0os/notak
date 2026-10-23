import type { Disposable } from '../../coeur/arrangement'
import { depuisCoins, point } from '../../coeur/geometrie'
import type { Element } from '../../coeur/tableau'
import { definition } from '../registre'
import type { ContexteToile } from '../types'

/**
 * Les éléments posés librement sur la toile (ni rangés en colonne), avec leur rectangle. Une ligne libre (aucun bout
 * accroché) compte par la boîte de son trait ; une ligne accrochée est ignorée.
 */
export function disposables(elements: Iterable<Element>, contexte: ContexteToile): Disposable[] {
  const res: Disposable[] = []
  for (const e of elements) {
    if (e.parent) continue
    if (e.contenu.type === 'ligne') {
      const { depart, arrivee } = e.contenu
      if ('x' in depart && 'x' in arrivee) {
        const rect = depuisCoins(point(depart.x, depart.y), point(arrivee.x, arrivee.y))
        res.push({ id: e.id, x: rect.min.x, y: rect.min.y, rect })
      }
      continue
    }
    if (definition(e.contenu.type)?.calque === 'lignes') continue
    const rect = contexte.rect(e.id)
    if (rect) res.push({ id: e.id, x: e.x, y: e.y, rect })
  }
  return res
}

export function selectionDisposable(contexte: ContexteToile): Disposable[] {
  const { elements } = contexte.magasin.lire()
  return disposables(elements.filter((e) => contexte.selection.has(e.id)), contexte)
}
