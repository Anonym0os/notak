import { centre } from '../../coeur/geometrie'
import { accroches, relier } from '../../coeur/lignes'
import type { Element, Id, Ligne } from '../../coeur/tableau'
import { definition } from '../registre'
import type { ContexteToile, EntreeMenu, Raccourci } from '../types'
import { nouvelleLigne } from './creation'
import { editionLibelle } from './edition'
import { t } from '../../langue'

const libre = (e: Element) => !e.parent && definition(e.contenu.type)?.calque !== 'lignes'

/** Cmd+K : relie les éléments libres choisis, sans pointes. Les lignes créées ne sont pas choisies. */
export const raccourciRelier: Raccourci = (e, contexte) => {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'k') return false
  return relierChoisis(contexte)
}

/**
 * Une touche qui est un caractère (ni Entrée, Espace, Tab, Retour arrière, flèches ou Échap, ni avec Cmd, Ctrl ou
 * Alt), sur une ligne seule choisie : le libellé s'ouvre et la touche s'y écrit à la place du mot d'attente.
 */
export const raccourciLibelle: Raccourci = (e, contexte) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing || e.key.length !== 1 || e.key === ' ') return false
  if (contexte.selection.size !== 1) return false
  const [id] = contexte.selection
  const el = contexte.magasin.lire().elements.find((x) => x.id === id)
  if (!el || el.contenu.type !== 'ligne' || el.verrou) return false
  editionLibelle.ouvrir(el.id, e.key)
  return true
}

export const entreeRelier: EntreeMenu = {
  get libelle() {
    return t('menu.relier')
  },
  raccourci: '⌘K',
  visible: (elements) => elements.filter(libre).length >= 2,
  tuile: true,
  faire: (_e, contexte) => void relierChoisis(contexte),
}

/** Relie deux à deux les éléments libres choisis ; faux s'il y en a moins de deux. */
export function relierChoisis(contexte: ContexteToile): boolean {
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
