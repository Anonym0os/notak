import { nouvelId } from '../../coeur/tableau'
import type { Id } from '../../coeur/tableau'
import { type ModeleTableau, elementsDuModele } from '../../modeles/construire'
import type { Services } from '../types'

/** Un tableau qu'on peut remplir d'un modèle : le sien, vide, et qu'on peut modifier. */
export function peutPoserModele(cible: Id, services: Services): boolean {
  if (services.lectureSeule || !services.deposerDans) return false
  return services.tableau?.(cible)?.elements.length === 0
}

/**
 * Remplit le tableau vide `cible` du modèle : ses éléments, son titre et sa couleur (sauf `identite: false`, qui
 * laisse au tableau son titre et sa couleur : un tableau que la personne a déjà nommé). Rend faux s'il n'y avait rien à faire.
 */
export function poserModele(modele: ModeleTableau, cible: Id, services: Services, { identite = true }: { identite?: boolean } = {}): boolean {
  if (!peutPoserModele(cible, services)) return false
  services.deposerDans?.(cible, elementsDuModele(modele, nouvelId))
  if (identite) {
    services.renommerTableau?.(cible, modele.titre)
    services.colorerTableau?.(cible, modele.couleur)
  }
  return true
}
