import type { TypeBloc } from './modele'

/**
 * Le glisser et la poignée, côté géométrie (docs/NOTION.md § 6 à § 8) : les décisions que prennent la poignée, le
 * glisser-déposer et le rectangle, écrites en fonctions pures sur des rectangles. Le DOM n'entre que dans
 * `glisserMesure.ts`, qui fournit les lignes ; ici, des nombres entrent et des nombres sortent.
 *
 * Tous les rectangles sont dans le repère de la zone qui défile (le contenu, pas la fenêtre) : un défilement ne
 * déplace donc rien de ce qu'on a mesuré.
 */

/** Le départ d'un glisser : 6 px à la souris (le doigt part tout de suite). */
export const SEUIL_GLISSER = 6

/** De combien la poignée déborde du bloc à gauche : sa zone de survol va de là au bord droit du bloc. */
export const PORTEE_POIGNEE = 150

/** La poignée ⋮⋮ (18 × 24), le bouton + (24 × 24) qui la touche à gauche, et l'espace entre elle et le bloc. */
export const POIGNEE = { tenir: 18, plus: 24, hauteur: 24, ecart: 10 } as const

/** Le retrait par niveau, quand la page ne le dit pas (`--notak-pas-retrait`). */
export const PAS_RETRAIT = 32

/** Ce que chaque niveau d'imbrication retire à droite d'un repère de dépôt (la marge du bloc parent, mesurée). */
export const RETRAIT_DROIT = 6

/** Le trait de dépôt : 4 px d'épaisseur ; sur un flanc, il se tient à 8 px du bord gauche et à 4 px du bord droit. */
export const EPAISSEUR_REPERE = 4

/** Un point tenu sans bouger est un clic ; au-delà, un glisser. */
export const estGlisse = (dx: number, dy: number, seuil = SEUIL_GLISSER) => Math.hypot(dx, dy) >= seuil

export interface Rect {
  gauche: number
  haut: number
  droite: number
  bas: number
}

/** Une ligne du texte, mesurée : un bloc visible (un bloc caché par un dépliant fermé n'en a pas). */
export interface Ligne extends Rect {
  id: string
  type: TypeBloc
  /** La position du bloc dans le document, et la fin de son sous-arbre. */
  pos: number
  fin: number
  /** Le rang d'imbrication dans son conteneur, 0 au premier niveau. */
  niveau: number
  parent: string | null
  /** L'id de la colonne qui le contient ; `null` sur la page. */
  conteneur: string | null
  /** Le cadre du premier niveau de son conteneur : là que se comptent les retraits. */
  cadre: { gauche: number; droite: number }
  /** Un dépliant, un titre dépliant, fermé. */
  ferme: boolean
  aEnfants: boolean
}

/** Les blocs qui n'ont pas de poignée : la rangée de colonnes elle-même. */
export const SANS_POIGNEE: ReadonlySet<TypeBloc> = new Set<TypeBloc>(['colonnes', 'colonne'])

/** Le bord gauche d'un bloc à son niveau : celui que la poignée suit, et que le retrait décale d'un pas par niveau. */
export const bordGauche = (l: { cadre: { gauche: number }; niveau: number }, pas = PAS_RETRAIT) => l.cadre.gauche + l.niveau * pas

/**
 * Le bloc que la souris survole (§ 6) : celui dont la tranche verticale contient le pointeur, de 150 px à gauche de son
 * bord à son bord droit (exclu). Plusieurs : le plus en retrait, puis le plus intérieur (la plus petite surface).
 */
export function survolDe(lignes: readonly Ligne[], x: number, y: number, pas = PAS_RETRAIT): Ligne | null {
  let meilleure: Ligne | null = null
  for (const l of lignes) {
    if (SANS_POIGNEE.has(l.type) || y < l.haut || y >= l.bas) continue
    const gauche = bordGauche(l, pas)
    if (x < gauche - PORTEE_POIGNEE || x >= l.droite) continue
    if (!meilleure) {
      meilleure = l
      continue
    }
    const g = bordGauche(meilleure, pas)
    if (gauche > g || (gauche === g && (l.droite - l.gauche) * (l.bas - l.haut) < (meilleure.droite - meilleure.gauche) * (meilleure.bas - meilleure.haut))) meilleure = l
  }
  return meilleure
}

/** Le haut de la poignée, centrée sur le milieu de la première ligne du bloc. */
export const hautPoignee = (centreDeLaLigne: number) => centreDeLaLigne - POIGNEE.hauteur / 2

/** La vitesse du défilement à une distance `distance` du bord, dans une bande de `bande` px, pour `hauteur` px visibles. */
export function vitesseDefilement(distance: number, bande: number, hauteur: number): number {
  const o = (bande - distance) / bande
  return hauteur / 600 + ((3 * hauteur) / 60 - hauteur / 600) * Math.min(o * o, 1)
}

/** Le rythme du défilement automatique : 60 images par seconde. */
export const PERIODE_DEFILEMENT = 1000 / 60

/**
 * De combien défiler, à chaque image, quand le pointeur est à `y` d'une zone qui va de `haut` à `bas` (§ 3) : une bande de
 * 10 % de la hauteur (20 px au moins) en haut et en bas ; plus le pointeur s'approche du bord, ou le dépasse, plus vite
 * on défile. Négatif vers le haut, 0 hors des bandes.
 */
export function defilementAuto(y: number, haut: number, bas: number): number {
  const hauteur = bas - haut
  const bande = Math.max(20, hauteur * 0.1)
  if (y < haut + bande) return -vitesseDefilement(y - haut, bande, hauteur)
  if (y > bas - bande) return vitesseDefilement(bas - y, bande, hauteur)
  return 0
}

/** Les listes dont les éléments voisins se touchent (1 px entre eux au lieu de 2). */
const LISTES: ReadonlySet<TypeBloc> = new Set<TypeBloc>(['puce', 'numero', 'tache', 'deroulant'])

/** Le retrait du halo de sélection sur les quatre côtés (§ 2.1) : 2 px, et 1 px en haut ou en bas entre deux éléments de liste. */
export function retraitsHalo(type: TypeBloc, avant: TypeBloc | null, apres: TypeBloc | null): { haut: number; bas: number; cote: number } {
  const liste = LISTES.has(type)
  return { haut: liste && avant && LISTES.has(avant) ? 1 : 2, bas: liste && apres && LISTES.has(apres) ? 1 : 2, cote: 2 }
}

/** Le rayon du halo : 4 px ; 16 px pour un encadré et un bloc de code ; aucun pour un tableau. */
export const rayonHalo = (type: TypeBloc) => (type === 'encadre' || type === 'code' ? 16 : type === 'tableau' ? 0 : 4)

/** La ligne du bloc qui contient `y`, ou la plus proche (au-dessus de la première, au-dessous de la dernière). */
export function ligneSelonY(lignes: readonly Ligne[], y: number): Ligne | null {
  let proche: Ligne | null = null
  let ecart = Number.POSITIVE_INFINITY
  for (const l of lignes) {
    if (l.type === 'colonnes') continue
    const e = y < l.haut ? l.haut - y : y > l.bas ? y - l.bas : 0
    if (e < ecart) {
      ecart = e
      proche = l
    }
  }
  return proche
}

/** Le pointeur est-il sorti du texte d'un bloc, agrandi de 20 px, où une sélection de texte devient une sélection de blocs (§ 2.2) ? */
export function sortiDuTexte(l: Rect, x: number, y: number, marge = 20): boolean {
  return x < l.gauche - marge || x > l.droite + marge || y < l.haut - marge || y > l.bas + marge
}
