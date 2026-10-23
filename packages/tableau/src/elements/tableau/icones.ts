import type { Element, Id, RenvoiTableau } from '../../coeur/tableau'
import { nouvelId } from '../../coeur/tableau'

/** La bibliothèque d'icônes d'un tableau : un nom stable (c'est lui qu'on garde) et le signe qu'il dessine. */
export const ICONES_TABLEAU: Readonly<Record<string, { signe: string; libelle: string }>> = {
  maison: { signe: '🏠', libelle: 'Maison' },
  voyage: { signe: '✈️', libelle: 'Voyage' },
  idee: { signe: '💡', libelle: 'Idée' },
  livre: { signe: '📚', libelle: 'Livre' },
  musique: { signe: '🎵', libelle: 'Musique' },
  film: { signe: '🎬', libelle: 'Film' },
  photo: { signe: '📷', libelle: 'Photo' },
  carte: { signe: '🗺️', libelle: 'Carte' },
  cible: { signe: '🎯', libelle: 'Objectif' },
  calendrier: { signe: '📅', libelle: 'Calendrier' },
  argent: { signe: '💶', libelle: 'Budget' },
  coeur: { signe: '❤️', libelle: 'Cœur' },
  etoile: { signe: '⭐', libelle: 'Étoile' },
  drapeau: { signe: '🚩', libelle: 'Drapeau' },
  fusee: { signe: '🚀', libelle: 'Lancement' },
  outil: { signe: '🛠️', libelle: 'Outils' },
  palette: { signe: '🎨', libelle: 'Création' },
  repas: { signe: '🍽️', libelle: 'Repas' },
  sport: { signe: '🏃', libelle: 'Sport' },
  personne: { signe: '👤', libelle: 'Personne' },
  equipe: { signe: '👥', libelle: 'Équipe' },
  dossier: { signe: '📁', libelle: 'Dossier' },
  note: { signe: '📝', libelle: 'Notes' },
  arbre: { signe: '🌳', libelle: 'Nature' },
}

/** Ce qu'une carte de tableau dessine dans son carré : l'image, sinon l'icône, sinon l'initiale. */
export type Pastille = { genre: 'image'; fichier: Id } | { genre: 'icone'; signe: string; libelle: string } | { genre: 'initiale' }

export function pastilleDe(c: Pick<RenvoiTableau, 'icone' | 'image'>): Pastille {
  if (c.image) return { genre: 'image', fichier: c.image }
  const icone = c.icone ? ICONES_TABLEAU[c.icone] : undefined
  return icone ? { genre: 'icone', ...icone } : { genre: 'initiale' }
}

/** Le contenu avec cette icône (ou celle-ci en moins : `undefined`) ; une image et une icône ne vont pas ensemble. */
export function avecIcone(c: RenvoiTableau, icone: string | undefined): RenvoiTableau {
  const { icone: _i, image: _m, ...reste } = c
  return icone && ICONES_TABLEAU[icone] ? { ...reste, icone } : reste
}

/** Le contenu avec cette image à la place de l'initiale. */
export function avecImage(c: RenvoiTableau, image: Id): RenvoiTableau {
  const { icone: _i, image: _m, ...reste } = c
  return { ...reste, image }
}

/** Un raccourci vers le même tableau, posé à `ou`, avec l'icône de la carte d'où il vient. */
export function nouveauRaccourci(source: Element<RenvoiTableau>, ou: { x: number; y: number }): Element<RenvoiTableau> {
  const { titre: _, raccourci: __, ...reste } = source.contenu
  return { id: nouvelId(), x: Math.round(ou.x), y: Math.round(ou.y), largeur: source.largeur, contenu: { ...reste, raccourci: true } }
}
