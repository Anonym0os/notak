import { borner } from './geometrieMenus'

/**
 * Le repli de la barre d'outils quand la place manque (docs/XMIND.md § 8, d'après le relevé de Xmind) : une fonction
 * pure, la barre ne fait que mesurer. Un seul seuil par niveau, dans les deux sens (pas d'hystérésis) ; on replie le
 * minimum, dans un ordre fixe, et ce qui est replié passe en tête du menu « + » (`menuPlus`, menus.ts).
 */

/** Les boutons de la pilule centrale, de gauche à droite. */
export const BOUTONS_BARRE = ['relation', 'resume', 'limite', 'zone', 'etiquette', 'tache'] as const
export type BoutonBarre = (typeof BOUTONS_BARRE)[number]

/**
 * L'ordre de repli : le titre d'abord, puis la pilule de droite à gauche. Le « + » ne se replie jamais (c'est lui qui
 * reçoit le reste) ; Accueil, les panneaux et Partager sont hors de la pilule et gardent leur place.
 */
export const ORDRE_REPLI = ['titre', 'tache', 'etiquette', 'zone', 'limite', 'resume', 'relation'] as const
export type Repliable = (typeof ORDRE_REPLI)[number]

/** Les mesures de Xmind (relevé 7 § 3.1), en px. */
export const MESURES = {
  /** Un bouton de la pilule. */
  bouton: 34,
  /** Le bouton « + » : plus (24) et chevron (12) avec leurs rembourrages. */
  plus: 48,
  /** Le rembourrage de la pilule, à chaque extrémité. */
  bord: 4,
  /** Le vide minimal entre la pilule et ce qui l'entoure. */
  elastique: 16,
  /** L'écart entre deux éléments de l'en-tête. */
  groupe: 12,
}

/** Ce que la barre mesure, en px de la zone de la carte (le panneau de côté, ouvert, l'a déjà rétrécie). */
export interface MesuresBarre {
  /** La largeur de la zone. */
  largeur: number
  /** Où commence le titre (après Accueil et le bouton du panneau de gauche, écart compris). */
  debutTitre: number
  /** La largeur du titre (100 à 260). */
  titre: number
  /** La largeur du bloc de droite (export et pilule des panneaux), sa marge au bord comprise. */
  droite: number
}

export interface Repli {
  /** Le nombre d'éléments repliés (0 : tout tient). */
  niveau: number
  titreReplie: boolean
  /** Les boutons qui restent sur la barre, dans l'ordre de la barre. */
  visibles: BoutonBarre[]
  /** Les boutons passés dans le menu « + », dans l'ordre de la barre. */
  replies: BoutonBarre[]
  /** Même le « + » seul ne tient pas : la barre se retire. */
  masquee: boolean
}

/** La largeur de la pilule avec ce nombre de boutons, le « + » compris. */
export const largeurPilule = (boutons: number): number => 2 * MESURES.bord + boutons * MESURES.bouton + MESURES.plus

/** La largeur dont la barre a besoin pour ne replier que les `niveau` premiers éléments de l'ordre. */
export function largeurRequise(m: MesuresBarre, niveau: number): number {
  const replies = new Set<Repliable>(ORDRE_REPLI.slice(0, niveau))
  const boutons = BOUTONS_BARRE.filter((b) => !replies.has(b)).length
  const finGauche = replies.has('titre') ? m.debutTitre - MESURES.groupe : m.debutTitre + m.titre
  return finGauche + MESURES.elastique + largeurPilule(boutons) + MESURES.elastique + m.droite
}

const sansReplis = (): Repli => ({ niveau: 0, titreReplie: false, visibles: [...BOUTONS_BARRE], replies: [], masquee: false })

/** Le premier niveau de repli où tout tient. Sans mesure (`null`, ou zone sans largeur : pas encore posée), rien ne se replie. */
export function calculerRepli(m: MesuresBarre | null): Repli {
  if (!m || m.largeur <= 0) return sansReplis()
  let niveau = 0
  while (niveau < ORDRE_REPLI.length && largeurRequise(m, niveau) > m.largeur) niveau++
  const replis = new Set<Repliable>(ORDRE_REPLI.slice(0, niveau))
  return {
    niveau,
    titreReplie: replis.has('titre'),
    visibles: BOUTONS_BARRE.filter((b) => !replis.has(b)),
    replies: BOUTONS_BARRE.filter((b) => replis.has(b)),
    masquee: largeurRequise(m, niveau) > m.largeur,
  }
}

/**
 * Le bord gauche de la pilule : centrée sur la zone quand il y a la place, sinon poussée vers le côté libre, sans
 * jamais toucher le titre ni les pastilles de droite (16 px de vide au moins).
 */
export function placerBarre(m: MesuresBarre, repli: Repli): number {
  const pilule = largeurPilule(repli.visibles.length)
  const finGauche = repli.titreReplie ? m.debutTitre - MESURES.groupe : m.debutTitre + m.titre
  const min = finGauche + MESURES.elastique
  const max = m.largeur - m.droite - MESURES.elastique - pilule
  return borner((m.largeur - pilule) / 2, min, max)
}
