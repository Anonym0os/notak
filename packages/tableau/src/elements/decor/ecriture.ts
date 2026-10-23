import type { Etiquette, Operation } from '../../coeur/tableau'
import type { ContexteToile } from '../types'

/**
 * Change la liste des étiquettes du tableau (un seul pas d'historique), et répercute dans les autres tableaux de
 * l'espace le nom ou la couleur de celles qui ont changé : une étiquette est la même dans tous les tableaux.
 * `avec` : d'autres pas qui vont dans le même geste.
 */
export function changerEtiquettes(contexte: ContexteToile, vers: Etiquette[], avec: Operation[] = []) {
  const liste = contexte.magasin.lire().etiquettes ?? []
  contexte.magasin.faire([{ type: 'etiquettes', de: liste, vers }, ...avec])
  for (const e of vers) {
    const avant = liste.find((x) => x.id === e.id)
    if (avant && (avant.nom !== e.nom || avant.couleur !== e.couleur)) contexte.services.propagerEtiquette?.(e)
  }
}
