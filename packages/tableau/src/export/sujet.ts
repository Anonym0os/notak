import type { NomIcone } from '../icones'

/**
 * Ce qu'on exporte, d'où qu'on l'exporte : le tableau (sa toile), une carte mentale ou un document ouverts en grand.
 * Chacun dit ses formats ; un seul dialogue les présente tous (celui de l'application), avec l'aperçu de ce qui
 * sera écrit. L'aperçu porte, quand il le peut, le fichier lui-même : on exporte alors exactement ce qu'on a vu.
 */

/** Les réglages qu'un format peut montrer, et leur valeur. */
export interface ReglagesExport {
  /** Le `.notak` : avec les sous-tableaux, avec les images et fichiers. */
  sousTableaux: boolean
  fichiers: boolean
  /** Une capture du tableau : ce qui est à l'écran, ou le tableau entier. */
  portee: 'ecran' | 'tout'
  /** Le PNG garde la couleur du fond ; sans elle, il est transparent. */
  fond: boolean
  /** Le rapport de pixels d'une capture de l'écran. */
  resolution: 1 | 2 | 3
}
export type OptionExport = keyof ReglagesExport

export const REGLAGES_PAR_DEFAUT: ReglagesExport = { sousTableaux: true, fichiers: true, portee: 'tout', fond: true, resolution: 2 }

/** Ce que montre l'aperçu. */
export type Apercu =
  /** Une ou plusieurs images : une capture, ou les pages d'un document. */
  | { type: 'images'; images: readonly Blob[]; legende?: string }
  /** Le texte qui sera écrit. */
  | { type: 'texte'; texte: string }
  /** Ce que contient une archive : une ligne par chose, et un résumé. */
  | { type: 'contenu'; resume: string; lignes: readonly { icone: NomIcone; texte: string; detail?: string }[] }

export interface Prepare {
  apercu: Apercu
  /** Le fichier, déjà fait : l'export l'écrit tel quel. Absent, `fabriquer` le fait au moment d'exporter. */
  fichier?: Blob
}

export interface FormatExport {
  id: string
  icone: NomIcone
  libelle: string
  aide: string
  /** Sans point. */
  extension: string
  /** Le type du fichier, pour la fenêtre « Enregistrer sous ». */
  type: string
  recommande?: boolean
  /** Un filet le sépare du format d'avant. */
  filet?: boolean
  /** Les réglages qu'il montre, dans l'ordre ; l'aperçu se refait quand l'un d'eux change. */
  options?: readonly OptionExport[]
  preparer(r: ReglagesExport): Promise<Prepare>
  fabriquer?(r: ReglagesExport): Promise<Blob>
}

export interface SujetExport {
  /** Le genre de chose exportée : chaque genre retient son dernier format et ses réglages. */
  genre: 'tableau' | 'carte' | 'document'
  titre: string
  formats: readonly FormatExport[]
  /** Une ligne sous les formats, pour dire ce qui se fait ailleurs. */
  note?: string
  /** Le format choisi d'emblée, plutôt que le dernier retenu. */
  format?: string
}

/** Une erreur dont on connaît la cause : son code devient le message du dialogue. */
export class ErreurExport extends Error {}

let ouvreur: ((s: SujetExport) => void) | null = null

/** L'application branche son dialogue d'export ; rend de quoi le débrancher. */
export function brancherExport(f: (s: SujetExport) => void): () => void {
  ouvreur = f
  return () => {
    if (ouvreur === f) ouvreur = null
  }
}

/** Un dialogue d'export est branché : la carte mentale et le document l'ouvrent plutôt que leur menu à eux. */
export const exportBranche = () => ouvreur !== null

/** Ouvre le dialogue d'export sur ce sujet ; rend faux si aucun n'est branché. */
export function ouvrirExport(s: SujetExport): boolean {
  if (!ouvreur) return false
  ouvreur(s)
  return true
}

/** Un nom de fichier sûr à partir d'un titre. */
export const nomDeFichier = (titre: string, extension: string, parDefaut: string) =>
  `${
    titre
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100) || parDefaut
  }.${extension}`
