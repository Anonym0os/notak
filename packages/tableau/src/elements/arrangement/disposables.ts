import type { Disposable } from '../../coeur/arrangement'
import type { Element } from '../../coeur/tableau'
import { definition } from '../registre'
import type { ContexteToile } from '../types'

/** Les éléments posés librement sur la toile (ni rangés en colonne, ni lignes), avec leur rectangle. */
export function disposables(elements: Iterable<Element>, contexte: ContexteToile): Disposable[] {
  const res: Disposable[] = []
  for (const e of elements) {
    if (e.parent || definition(e.contenu.type)?.calque === 'lignes') continue
    const rect = contexte.rect(e.id)
    if (rect) res.push({ id: e.id, x: e.x, y: e.y, rect })
  }
  return res
}

export function selectionDisposable(contexte: ContexteToile): Disposable[] {
  const { elements } = contexte.magasin.lire()
  return disposables(elements.filter((e) => contexte.selection.has(e.id)), contexte)
}
