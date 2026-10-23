import type { Id } from '../../coeur/tableau'

/**
 * Quelle ligne a son libellé ouvert en édition. Le bouton « Libellé » (barre de sélection) et le rendu
 * (calque SVG) ne partagent aucun parent : ils se parlent par ici. L'édition de la toile, elle, est réservée
 * à l'écriture des cartes.
 */
let ouverte: Id | null = null
/** Le caractère tapé pour ouvrir l'édition : il remplace le texte et reste à la première place du champ. */
let premiere: string | null = null
const ecouteurs = new Set<() => void>()
const notifier = () => ecouteurs.forEach((f) => f())

export const editionLibelle = {
  courante: () => ouverte,
  ouvrir(id: Id, caractere?: string) {
    ouverte = id
    premiere = caractere ?? null
    notifier()
  },
  /** Le caractère qui a ouvert l'édition, rendu une seule fois. */
  prendrePremiere(): string | null {
    const c = premiere
    premiere = null
    return c
  },
  fermer() {
    if (ouverte === null) return
    ouverte = null
    premiere = null
    notifier()
  },
  ecouter(f: () => void) {
    ecouteurs.add(f)
    return () => ecouteurs.delete(f)
  },
}
