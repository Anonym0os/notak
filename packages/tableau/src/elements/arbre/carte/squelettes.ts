import type { FormeBranche, FormeSujet, MotifRemplissage, MotifTrait, PointeTrait, StructureArbre } from '../../../coeur/tableau'
import { pileDe } from './polices'
import { TABLE } from './squelettes-table'

/**
 * Les squelettes (docs/XMIND.md § 9 bis, relevé `9-squelettes.md`) : un jeu complet de structure et de style. Par rang
 * (central, principal, sous-sujet, flottant) : la forme du sujet, la forme et l'épaisseur des branches qui en partent,
 * la police, la taille, la graisse, le remplissage, la bordure. Les couleurs n'en font pas partie : elles restent au
 * thème. Un style posé à la main sur un sujet passe avant le squelette, qui passe avant le thème.
 *
 * → Notak : les 51 squelettes des huit groupes que Notak sait mettre en page (le tableau arbre et la grille de Xmind
 * n'ont pas de structure chez nous), sous nos noms ; l'identifiant de Xmind n'est gardé que pour le fichier `.xmind`.
 */

/** Ce qu'un squelette prescrit à un rang. */
export interface ClasseSquelette {
  forme: FormeSujet
  /** La forme des branches qui partent de ce rang. */
  branche: FormeBranche
  /** Leur épaisseur et leur motif, hérités du rang du dessus quand le squelette n'en dit rien (déjà résolu dans la table). */
  epaisseur?: number
  motif?: MotifTrait
  /** Le bout de ces branches, côté enfant. */
  pointe?: PointeTrait
  /** Le nom de la famille (celui de Xmind) ; absent : la police de la carte. */
  police?: string
  taille: number
  graisse: number
  alignement: 'gauche' | 'centre'
  /** `aucun` : pas de fond ; `plein` ou une hachure : il se remplit de la couleur du thème. */
  remplissage: MotifRemplissage
  /** L'épaisseur et le motif de la bordure ; absents : celle de la branche qui arrive (pour un souligné), sinon aucune. */
  bordure?: number
  motifBordure?: MotifTrait
}

export type RangSquelette = 'central' | 'principal' | 'sous' | 'flottant'

export interface SqueletteDef {
  id: string
  /** L'identifiant du squelette dans un `.xmind` (`theme.skeletonThemeId`). */
  xmind: string
  /** Le groupe de la fenêtre de choix (`arbre.carte.g.<groupe>`). */
  groupe: string
  /** La structure du central. */
  structure: StructureArbre
  /** Celle des sujets principaux, quand elle n'est pas celle que leur donne le central. */
  principaux?: StructureArbre
  /** Le squelette libre de Xmind (les autres sont payants chez lui, tous libres chez nous) : il ouvre chaque groupe. */
  libre: boolean
  /** Dessiné à la main : traits qui tremblent, hachures, police manuscrite. */
  main: boolean
  /** Les branches du central s'amincissent jusqu'en pointe (`lineTapered`). */
  effile?: boolean
  /** Les sous-sujets du premier niveau ont un fond (la teinte de leur branche, pâle), pas les suivants. */
  fondNiveau2?: boolean
  central: ClasseSquelette
  principal: ClasseSquelette
  sous: ClasseSquelette
  flottant: ClasseSquelette
}

export const SQUELETTES: readonly SqueletteDef[] = TABLE

/** Celui d'une carte neuve : le premier de Xmind (central en courbe organique, coudes arrondis ensuite). */
export const SQUELETTE_DEFAUT = 'carte-1'

/** Les groupes de la fenêtre des squelettes, dans l'ordre de Xmind. */
export const GROUPES_DE_SQUELETTES: readonly string[] = ['carte', 'logique', 'accolade', 'organigramme', 'arbre', 'chronologie', 'arete', 'matrice']

const PAR_ID = new Map(SQUELETTES.map((s) => [s.id, s]))
const PAR_XMIND = new Map(SQUELETTES.map((s) => [s.xmind, s]))

export const squeletteDe = (id: string | undefined): SqueletteDef | undefined => (id === undefined ? undefined : PAR_ID.get(id))
export const squeletteDeXmind = (id: string | undefined): SqueletteDef | undefined => (id === undefined ? undefined : PAR_XMIND.get(id))
export const squelettesDuGroupe = (groupe: string): SqueletteDef[] => SQUELETTES.filter((s) => s.groupe === groupe)

/** Ce que le squelette prescrit à un rang. */
export const classeDe = (s: SqueletteDef, rang: RangSquelette): ClasseSquelette => s[rang]

/** L'épaisseur de la branche qui arrive sur un sujet de ce rang : celle que prescrit le rang dont il part. */
export function epaisseurEntrante(s: SqueletteDef, rang: RangSquelette): number | undefined {
  switch (rang) {
    case 'principal':
    case 'flottant':
      return s.central.epaisseur
    case 'sous':
      return s.principal.epaisseur ?? s.central.epaisseur
    default:
      return undefined
  }
}

/**
 * Les polices de Xmind que Notak ne livre pas, avec une pile du système qui s'en approche : l'écriture à la main, la
 * condensée, l'arrondie, et les empattements. Une famille inconnue passe par la liste des polices de l'onglet Carte.
 */
const PILES: Record<string, string> = {
  'NeverMind Hand': '"Marker Felt", "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive',
  'NeverMind Handwriting': '"Bradley Hand", "Marker Felt", "Segoe Print", "Comic Sans MS", cursive',
  'NeverMind Condense': '"Avenir Next Condensed", "Arial Narrow", "Helvetica Neue", sans-serif',
  'NeverMind Rounded': '"Avenir Next Rounded", "Arial Rounded MT Bold", "Nunito", sans-serif',
  NeverMindRounded: '"Avenir Next Rounded", "Arial Rounded MT Bold", "Nunito", sans-serif',
  Times: '"Times New Roman", Times, serif',
  'Droid Serif': '"Droid Serif", Georgia, serif',
  'Roboto Slab': '"Roboto Slab", Rockwell, Georgia, serif',
  Arvo: '"Arvo", Rockwell, Georgia, serif',
  Audiowide: '"Audiowide", Futura, "Avenir Next", sans-serif',
}

/** La pile CSS de la police d'un squelette ; `undefined` : celle de la carte (NeverMind, chez Xmind). */
export const pileSquelette = (nom: string | undefined): string | undefined => (nom === undefined ? undefined : (PILES[nom] ?? pileDe(nom)))
