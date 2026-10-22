import type { Id } from '../../coeur/tableau'

/**
 * Quelle ligne a son libellé ouvert en édition. Le bouton « Libellé » (barre de sélection) et le rendu
 * (calque SVG) ne partagent aucun parent : ils se parlent par ici. L'édition de la toile, elle, est réservée
 * à l'écriture des cartes.
 */
let ouverte: Id | null = null
const ecouteurs = new Set<() => void>()
const notifier = () => ecouteurs.forEach((f) => f())

export const editionLibelle = {
  courante: () => ouverte,
  ouvrir(id: Id) {
    ouverte = id
    notifier()
  },
  fermer() {
    if (ouverte === null) return
    ouverte = null
    notifier()
  },
  ecouter(f: () => void) {
    ecouteurs.add(f)
    return () => ecouteurs.delete(f)
  },
}
