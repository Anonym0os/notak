import { type Element, type Operation, annoter } from '../../coeur/tableau'
import { definition } from '../registre'
import type { ContexteToile } from '../types'
import { pasPour, peutEtreIcone } from './annotations'

/**
 * Le mode d'affichage, pour tout ce qui peut se réduire :
 * - une carte (note, lien, image…) se replie en pastille : c'est le champ commun `affichage` ;
 * - une colonne se réduit en se repliant (son titre et le compte de ce qu'elle range), ce que sa flèche fait déjà :
 *   le mode passe par `repliee`, pour qu'il n'y ait qu'un seul état de repli ;
 * - un tableau imbriqué est déjà une icône, et une ligne n'a pas de corps à replier : ni l'un ni l'autre n'ont de mode.
 */

/** Cet élément peut-il être réduit en icône ? */
export const peutSeReduire = (e: Element): boolean => e.contenu.type === 'colonne' || peutEtreIcone(definition(e.contenu.type))

/** Cet élément est-il réduit ? */
export const estReduit = (e: Element): boolean => (e.contenu.type === 'colonne' ? !!e.contenu.repliee : e.affichage === 'icone')

/** Les pas qui réduisent (`icone`) ou déploient ces éléments ; ceux qui sont déjà dans le bon mode sont écartés. */
export function pasAffichage(elements: readonly Element[], icone: boolean): Operation[] {
  return pasPour(elements, (e) => {
    if (estReduit(e) === icone) return null
    if (e.contenu.type === 'colonne') {
      const { repliee: _, ...reste } = e.contenu
      return { type: 'contenu', id: e.id, avant: e.contenu, apres: icone ? { ...reste, repliee: true } : reste }
    }
    return annoter(e, { affichage: icone ? 'icone' : null })
  })
}

/** Applique le mode d'un seul pas ; ce qu'une colonne réduite cache ne reste pas choisi. */
export function appliquerAffichage(elements: readonly Element[], icone: boolean, contexte: ContexteToile): void {
  const pas = pasAffichage(elements, icone)
  if (pas.length === 0) return
  contexte.magasin.faire(pas)
  if (!icone) return
  const caches = new Set(
    contexte.magasin.lire().elements.filter((x) => elements.some((e) => e.contenu.type === 'colonne' && x.parent === e.id)).map((x) => x.id),
  )
  if (caches.size === 0) return
  const restants = [...contexte.selection].filter((id) => !caches.has(id))
  contexte.choisir(restants.length > 0 ? restants : elements.map((e) => e.id))
}
