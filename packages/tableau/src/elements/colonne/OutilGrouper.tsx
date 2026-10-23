import type { Element } from '../../coeur/tableau'
import type { ContexteToile, EntreeMenu, OutilCommun } from '../types'
import { pasDeGroupement } from './grouper'
import { accepteDansColonne } from './regles'
import { BoutonOutil } from '../../BoutonOutil'
import { t } from '../../langue'

const groupables = (elements: Element[], contexte: ContexteToile) =>
  elements.flatMap((element) => {
    const rect = !element.parent && accepteDansColonne(element) ? contexte.rect(element.id) : null
    return rect ? [{ element, rect }] : []
  })

/** Range les éléments libres choisis dans une colonne neuve, dont on édite le titre. */
export function grouper(elements: Element[], contexte: ContexteToile) {
  const items = groupables(elements, contexte)
  if (items.length === 0) return
  const { colonne, pas } = pasDeGroupement(items)
  contexte.magasin.faire(pas)
  contexte.commencerEdition(colonne)
}

export const entreeGrouper: EntreeMenu = {
  get libelle() {
    return t('colonne.grouper')
  },
  visible: (elements, contexte) => groupables(elements, contexte).length > 0,
  faire: grouper,
}

/** « Colonne » : range les éléments libres choisis dans une colonne neuve. */
export const OutilGrouper: OutilCommun = ({ elements, contexte }) => {
  const items = groupables(elements, contexte)
  if (items.length < 2) return null
  return <BoutonOutil icone="colonne" secondaire titre={t('colonne.mettre')} libelle={t('type.colonne')} onClick={() => grouper(elements, contexte)} />
}
