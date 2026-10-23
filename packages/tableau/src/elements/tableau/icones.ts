import type { Element, Id, RenvoiTableau } from '../../coeur/tableau'
import { nouvelId } from '../../coeur/tableau'
import { t } from '../../langue'
import type { NomIcone } from '../../icones'

/** La bibliothèque d'icônes d'un tableau : un nom stable (c'est lui qu'on garde) et le signe qu'il dessine. */
export const ICONES_TABLEAU: Readonly<Record<string, { icone: NomIcone; libelle: string }>> = {
  maison: { icone: 'maison', get libelle() { return t('icone.maison') } },
  voyage: { icone: 'voyage', get libelle() { return t('icone.voyage') } },
  idee: { icone: 'idee', get libelle() { return t('icone.idee') } },
  livre: { icone: 'livre', get libelle() { return t('icone.livre') } },
  musique: { icone: 'musique', get libelle() { return t('icone.musique') } },
  film: { icone: 'film', get libelle() { return t('icone.film') } },
  photo: { icone: 'photo', get libelle() { return t('icone.photo') } },
  carte: { icone: 'carte', get libelle() { return t('icone.carte') } },
  cible: { icone: 'cible', get libelle() { return t('icone.cible') } },
  calendrier: { icone: 'calendrier', get libelle() { return t('icone.calendrier') } },
  argent: { icone: 'argent', get libelle() { return t('icone.argent') } },
  coeur: { icone: 'coeur', get libelle() { return t('icone.coeur') } },
  etoile: { icone: 'etoile', get libelle() { return t('icone.etoile') } },
  drapeau: { icone: 'drapeau', get libelle() { return t('icone.drapeau') } },
  fusee: { icone: 'fusee', get libelle() { return t('icone.fusee') } },
  outil: { icone: 'outil', get libelle() { return t('icone.outil') } },
  palette: { icone: 'palette', get libelle() { return t('icone.palette') } },
  repas: { icone: 'repas', get libelle() { return t('icone.repas') } },
  sport: { icone: 'sport', get libelle() { return t('icone.sport') } },
  personne: { icone: 'personne', get libelle() { return t('icone.personne') } },
  equipe: { icone: 'equipe', get libelle() { return t('icone.equipe') } },
  dossier: { icone: 'dossier', get libelle() { return t('icone.dossier') } },
  note: { icone: 'notes', get libelle() { return t('icone.note') } },
  arbre: { icone: 'arbre', get libelle() { return t('icone.arbre') } },
  travail: { icone: 'travail', get libelle() { return t('icone.travail') } },
  courses: { icone: 'courses', get libelle() { return t('icone.courses') } },
  cadeau: { icone: 'cadeau', get libelle() { return t('icone.cadeau') } },
  cafe: { icone: 'cafe', get libelle() { return t('icone.cafe') } },
  voiture: { icone: 'voiture', get libelle() { return t('icone.voiture') } },
  ecole: { icone: 'ecole', get libelle() { return t('icone.ecole') } },
  sante: { icone: 'sante', get libelle() { return t('icone.sante') } },
  plante: { icone: 'plante', get libelle() { return t('icone.plante') } },
  animal: { icone: 'animal', get libelle() { return t('icone.animal') } },
  monde: { icone: 'monde', get libelle() { return t('icone.monde') } },
  horloge: { icone: 'horloge', get libelle() { return t('icone.horloge') } },
  cle: { icone: 'cle', get libelle() { return t('icone.cle') } },
  graphique: { icone: 'graphique', get libelle() { return t('icone.graphique') } },
  ordinateur: { icone: 'ordinateur', get libelle() { return t('icone.ordinateur') } },
  micro: { icone: 'micro', get libelle() { return t('icone.micro') } },
  jeu: { icone: 'jeu', get libelle() { return t('icone.jeu') } },
  science: { icone: 'science', get libelle() { return t('icone.science') } },
  soleil: { icone: 'soleil', get libelle() { return t('icone.soleil') } },
}

/** Ce qu'une carte de tableau dessine dans son carré : l'image, sinon l'icône, sinon l'initiale. */
export type Pastille = { genre: 'image'; fichier: Id } | { genre: 'icone'; icone: NomIcone; libelle: string } | { genre: 'initiale' }

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

/** Un raccourci vers le même tableau, posé à `ou`, avec l'icône de la carte d'où il vient ; titre et couleur sont ceux du tableau tant qu'on ne lui en donne pas. */
export function nouveauRaccourci(source: Element<RenvoiTableau>, ou: { x: number; y: number }): Element<RenvoiTableau> {
  const { titre: _, raccourci: __, couleur: ___, ...reste } = source.contenu
  return { id: nouvelId(), x: Math.round(ou.x), y: Math.round(ou.y), largeur: source.largeur, contenu: { ...reste, raccourci: true } }
}
