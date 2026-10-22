import type { Element } from '../../coeur/tableau'
import type { OutilCommun } from '../types'
import { pasDeGroupement } from './grouper'
import { accepteDansColonne } from './regles'

/** « Colonne » : range les éléments libres choisis dans une colonne neuve. */
export const OutilGrouper: OutilCommun = ({ elements, contexte }) => {
  const items = elements.flatMap((element: Element) => {
    const rect = !element.parent && accepteDansColonne(element) ? contexte.rect(element.id) : null
    return rect ? [{ element, rect }] : []
  })
  if (items.length < 2) return null
  return (
    <button
      type="button"
      title="Mettre en colonne"
      onClick={() => {
        const { colonne, pas } = pasDeGroupement(items)
        contexte.magasin.faire(pas)
        contexte.commencerEdition(colonne)
      }}
    >
      Colonne
    </button>
  )
}
