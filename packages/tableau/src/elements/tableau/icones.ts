import type { Element, Id, RenvoiTableau } from '../../coeur/tableau'
import { nouvelId } from '../../coeur/tableau'
import { t } from '../../langue'

/** La bibliothèque d'icônes d'un tableau : un nom stable (c'est lui qu'on garde) et le signe qu'il dessine. */
export const ICONES_TABLEAU: Readonly<Record<string, { signe: string; libelle: string }>> = {
  maison: { signe: '🏠', get libelle() { return t('icone.maison') } },
  voyage: { signe: '✈️', get libelle() { return t('icone.voyage') } },
  idee: { signe: '💡', get libelle() { return t('icone.idee') } },
  livre: { signe: '📚', get libelle() { return t('icone.livre') } },
  musique: { signe: '🎵', get libelle() { return t('icone.musique') } },
  film: { signe: '🎬', get libelle() { return t('icone.film') } },
  photo: { signe: '📷', get libelle() { return t('icone.photo') } },
  carte: { signe: '🗺️', get libelle() { return t('icone.carte') } },
  cible: { signe: '🎯', get libelle() { return t('icone.cible') } },
  calendrier: { signe: '📅', get libelle() { return t('icone.calendrier') } },
  argent: { signe: '💶', get libelle() { return t('icone.argent') } },
  coeur: { signe: '❤️', get libelle() { return t('icone.coeur') } },
  etoile: { signe: '⭐', get libelle() { return t('icone.etoile') } },
  drapeau: { signe: '🚩', get libelle() { return t('icone.drapeau') } },
  fusee: { signe: '🚀', get libelle() { return t('icone.fusee') } },
  outil: { signe: '🛠️', get libelle() { return t('icone.outil') } },
  palette: { signe: '🎨', get libelle() { return t('icone.palette') } },
  repas: { signe: '🍽️', get libelle() { return t('icone.repas') } },
  sport: { signe: '🏃', get libelle() { return t('icone.sport') } },
  personne: { signe: '👤', get libelle() { return t('icone.personne') } },
  equipe: { signe: '👥', get libelle() { return t('icone.equipe') } },
  dossier: { signe: '📁', get libelle() { return t('icone.dossier') } },
  note: { signe: '📝', get libelle() { return t('icone.note') } },
  arbre: { signe: '🌳', get libelle() { return t('icone.arbre') } },
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
