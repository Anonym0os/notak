import { centre } from '../../coeur/geometrie'
import { accroches, relier } from '../../coeur/lignes'
import type { Element, Id, Ligne } from '../../coeur/tableau'
import { definition } from '../registre'
import type { Raccourci } from '../types'
import { nouvelleLigne } from './creation'

const libre = (e: Element) => !e.parent && definition(e.contenu.type)?.calque !== 'lignes'

/** Cmd+K : relie les éléments libres choisis, sans pointes. Les lignes créées ne sont pas choisies. */
export const raccourciRelier: Raccourci = (e, contexte) => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'k') return false
  const tableau = contexte.magasin.lire()
  const items = tableau.elements
    .filter((x) => contexte.selection.has(x.id) && libre(x))
    .flatMap((x) => {
      const r = contexte.rect(x.id)
      return r ? [{ id: x.id, centre: centre(r) }] : []
    })
  if (items.length < 2) return false
  const dedans = new Set<Id>(items.map((x) => x.id))
  const existantes = tableau.elements.flatMap((x): [Id, Id][] => {
    if (x.contenu.type !== 'ligne') return []
    const ids = accroches(x.contenu as Ligne)
    return ids.length === 2 && dedans.has(ids[0]!) && dedans.has(ids[1]!) ? [[ids[0]!, ids[1]!]] : []
  })
  const nouvelles = relier(items, existantes)
  contexte.magasin.faire(
    nouvelles.map(([a, b]) => ({
      type: 'creer',
      element: nouvelleLigne({ element: a }, { element: b }, { pointeArrivee: 'rien' }),
    })),
  )
  return true
}
