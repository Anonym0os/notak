import type { Element } from '../../coeur/tableau'
import type { ContexteToile, EntreeMenu } from '../types'
import { pasDeGroupement } from './grouper'
import { accepteDansColonne } from './regles'
import { tousLesTypes } from '../registre'
import { t } from '../../langue'

const groupables = (elements: Element[], contexte: ContexteToile) =>
  elements.flatMap((element) => {
    const rect = !element.parent && accepteDansColonne(element) ? contexte.rect(element.id) : null
    return rect ? [{ element, rect }] : []
  })

/** Range les éléments libres choisis (deux au moins) dans une colonne neuve, dont on édite le titre. */
export function grouper(elements: Element[], contexte: ContexteToile) {
  const items = groupables(elements, contexte)
  if (items.length < 2) return
  // Les lignes attachées aux éléments rangés ne tiendraient plus : elles partent à la corbeille.
  const rangees = new Set(items.map((i) => i.element.id))
  const partants = items.map((i) => i.element)
  const tableau = contexte.magasin.lire()
  const lignes = tousLesTypes()
    .flatMap((d) => d.emporterAvec?.(partants, tableau) ?? [])
    .filter((l, i, tous) => !rangees.has(l.id) && tous.findIndex((x) => x.id === l.id) === i)
  const { colonne, pas } = pasDeGroupement(items, lignes)
  contexte.magasin.faire(pas)
  contexte.commencerEdition(colonne)
}

export const entreeGrouper: EntreeMenu = {
  icone: 'colonne',
  get libelle() {
    return t('colonne.grouper')
  },
  visible: (elements, contexte) => groupables(elements, contexte).length > 1,
  faire: grouper,
}
