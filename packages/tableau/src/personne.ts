import type { Auteur, Id } from './coeur/tableau'
import type { Services } from './elements/types'

/**
 * Une personne telle qu'elle est aujourd'hui. Un auteur garde le nom et la couleur qu'il avait au moment du geste
 * (la trace d'un élément, un message, une tâche confiée), et son profil a pu changer depuis : soi, puis ceux qui sont
 * là, puis les membres de l'espace donnent le nom, la couleur et la photo du moment. Inconnu d'eux, l'auteur reste
 * tel qu'il a été noté.
 */
export function personneAJour(auteur: Auteur, services: Pick<Services, 'presence' | 'membres'>): Auteur & { photo?: Id } {
  const moi = services.presence?.moi?.()
  const actuel =
    (moi?.id === auteur.id ? moi : undefined) ??
    services.presence?.autres().find((p) => p.utilisateur.id === auteur.id)?.utilisateur ??
    services.membres?.().find((m) => m.id === auteur.id)
  if (!actuel) return auteur
  const couleur = actuel.couleur ?? auteur.couleur
  return { id: auteur.id, nom: actuel.nom || auteur.nom, ...(couleur ? { couleur } : {}), ...(actuel.photo ? { photo: actuel.photo } : {}) }
}
