import type { Id } from '../../coeur/tableau'
import type { MarqueBooleenne } from './riche'

/**
 * L'éditeur riche d'une cellule, vu de la barre d'outils : elle lui demande de poser un gras, un lien, une couleur
 * sur la sélection, sans connaître son DOM. Il se déclare en s'ouvrant et se retire en se fermant.
 */
export interface PiloteRiche {
  basculer(nom: MarqueBooleenne): void
  /** Un lien sur la sélection ; `null` l'ôte. */
  lien(adresse: string | null): void
  couleur(couleur: string | null): void
  surlignage(couleur: string | null): void
  /** Rend le clavier au texte, la sélection comme elle était. */
  focaliser(): void
  /** Range ce qui est écrit et ferme l'éditeur. */
  finir(): void
}

const pilotes = new Map<Id, PiloteRiche>()

export function declarerPilote(id: Id, pilote: PiloteRiche): () => void {
  pilotes.set(id, pilote)
  return () => {
    if (pilotes.get(id) === pilote) pilotes.delete(id)
  }
}

export const piloteDe = (id: Id): PiloteRiche | undefined => pilotes.get(id)
