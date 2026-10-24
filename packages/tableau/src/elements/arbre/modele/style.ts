import type { Arbre, CasseTexte, FormeBranche, FormeSujet, Id, MotifRemplissage, MotifTrait, PointeTrait, StructureArbre, StyleSujet } from '../../../coeur/tableau'
import { type Rang, brancheDe, couleurDe, couleursDe, habitDe, mesureDeSujet, rangDe } from '../apparence'
import { themeDe } from '../themes'
import { resumeDe } from './elements'
import { type Lecture, enfantsDe, profondeur, structureDe } from './sujets'

/**
 * La logique de l'onglet Style (docs/XMIND.md § 5 bis), sans écran : ce que la sélection désigne, les valeurs
 * « effectives » que le panneau montre (celles du rendu, thème compris), et les règles qui lient plusieurs réglages
 * (choisir « aucune bordure » met aussi l'épaisseur à 0, etc.). Des fonctions pures, testées seules.
 */

/** Plusieurs objets aux valeurs différentes : le panneau montre « Multiple » ou trois points. */
export const MULTIPLE: unique symbol = Symbol('multiple')
export type Mixte<T> = T | typeof MULTIPLE

/** La valeur que tous partagent, sinon `MULTIPLE`. */
export function commun<T>(valeurs: readonly T[]): Mixte<T> {
  const [premier] = valeurs
  return valeurs.every((v) => v === premier) ? (premier as T) : MULTIPLE
}

// — Ce que la sélection désigne —

export type GenreSujet = 'central' | 'principal' | 'sous' | 'flottant' | 'resume'

/** Le genre d'un sujet : le central, un principal, un sous-sujet, un flottant ou le sujet d'un résumé. */
export function genreDe(l: Lecture, id: Id): GenreSujet {
  return l.sujets.get(id)?.genre === 'resume' ? 'resume' : rangDe(l, id)
}

export type Cible =
  | { genre: 'vide' }
  | { genre: 'sujets'; ids: Id[]; genres: GenreSujet[] }
  /** Le sujet d'un résumé : la vue Résumé règle son accolade (par `resumes`) et son sujet (par `ids`). */
  | { genre: 'resume'; ids: Id[]; resumes: Id[] }
  | { genre: 'relations'; ids: Id[] }
  | { genre: 'limites'; ids: Id[] }

/**
 * Ce que le panneau règle : la sélection d'un seul type d'objet. Rien, ou un mélange (un sujet et une relation) :
 * l'état vide. Un sujet de résumé en tête de sélection donne la vue Résumé.
 */
export function cibler(a: Arbre, l: Lecture, choisis: readonly Id[]): Cible {
  const sujets = choisis.filter((x) => l.sujets.has(x))
  const relations = choisis.filter((x) => a.relations?.[x])
  const limites = choisis.filter((x) => a.limites?.[x])
  const types = [sujets, relations, limites].filter((x) => x.length > 0).length
  if (types !== 1) return { genre: 'vide' }
  if (relations.length) return { genre: 'relations', ids: relations }
  if (limites.length) return { genre: 'limites', ids: limites }
  if (genreDe(l, sujets[0]!) === 'resume') {
    const resumes = sujets.flatMap((x) => resumeDe(a, x) ?? [])
    return { genre: 'resume', ids: sujets.filter((x) => genreDe(l, x) === 'resume'), resumes }
  }
  return { genre: 'sujets', ids: sujets, genres: sujets.map((x) => genreDe(l, x)) }
}

// — Les listes de choix —

/** Les épaisseurs du panneau : très fin, mince, moyen, gras, très gras (en pt). */
export const EPAISSEURS = [1, 2, 3, 5, 8] as const
export const EPAISSEURS_CLES = ['tresFin', 'mince', 'moyen', 'gras', 'tresGras'] as const

/** L'épaisseur du panneau la plus proche d'une valeur, pour la nommer (1,5 se lit « Mince »). */
export function epaisseurProche(v: number): number {
  return EPAISSEURS.reduce((meilleure, e) => (Math.abs(e - v) <= Math.abs(meilleure - v) ? e : meilleure), EPAISSEURS[0] as number)
}

export const TAILLES_POLICE = [8, 10, 12, 14, 18, 24, 36, 48, 60] as const
export const TAILLE_MIN = 1
export const TAILLE_MAX = 200

/** Les graisses d'une police, nommées comme dans le panneau de Xmind (en anglais, sans traduction). */
export const GRAISSES = [
  [100, 'Thin'],
  [200, 'ExtraLight'],
  [300, 'Light'],
  [400, 'Regular'],
  [500, 'Medium'],
  [600, 'Demibold'],
  [700, 'Bold'],
  [800, 'ExtraBold'],
  [900, 'Black'],
] as const

export const nomGraisse = (g: number): string => GRAISSES.find(([v]) => v === g)?.[1] ?? GRAISSES.reduce((m, x) => (Math.abs(x[0] - g) < Math.abs(m[0] - g) ? x : m))[1]

/** Les polices qu'on propose : la police de Notak, puis des polices que tous les systèmes ont. `valeur` : la pile CSS. */
export const POLICES: readonly { nom: string; valeur: string }[] = [
  { nom: 'Inter', valeur: 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif' },
  { nom: 'Arial', valeur: 'Arial, Helvetica, sans-serif' },
  { nom: 'Helvetica', valeur: 'Helvetica, Arial, sans-serif' },
  { nom: 'Verdana', valeur: 'Verdana, Geneva, sans-serif' },
  { nom: 'Trebuchet MS', valeur: '"Trebuchet MS", Helvetica, sans-serif' },
  { nom: 'Georgia', valeur: 'Georgia, serif' },
  { nom: 'Times New Roman', valeur: '"Times New Roman", Times, serif' },
  { nom: 'Palatino', valeur: 'Palatino, "Palatino Linotype", serif' },
  { nom: 'Courier New', valeur: '"Courier New", Courier, monospace' },
  { nom: 'Menlo', valeur: 'Menlo, ui-monospace, monospace' },
  { nom: 'Comic Sans MS', valeur: '"Comic Sans MS", "Chalkboard SE", cursive' },
]

/** Le nom d'une pile de polices : celui de sa liste, sinon sa première famille. */
export function nomPolice(pile: string): string {
  const connue = POLICES.find((p) => p.valeur === pile)
  if (connue) return connue.nom
  const premiere = pile.split(',')[0]!.trim().replace(/^["']|["']$/g, '')
  return POLICES.find((p) => p.nom.toLowerCase() === premiere.toLowerCase())?.nom ?? premiere
}

// — Les familles de structure —

export interface FamilleStructure {
  id: 'carte' | 'logique' | 'accolade' | 'organigramme' | 'arbre' | 'chronologie' | 'arete' | 'matrice'
  /** La première est celle qu'on prend en changeant de famille. */
  variantes: readonly StructureArbre[]
  /** Une carte ne rayonne qu'autour du central. */
  centralSeul?: boolean
}

export const FAMILLES_STRUCTURE: readonly FamilleStructure[] = [
  { id: 'carte', variantes: ['carte-horaire', 'carte-libre', 'carte', 'carte-antihoraire'], centralSeul: true },
  { id: 'logique', variantes: ['logique-droite', 'logique-gauche'] },
  { id: 'accolade', variantes: ['accolade-droite', 'accolade-gauche'] },
  { id: 'organigramme', variantes: ['organigramme-bas', 'organigramme-haut'] },
  { id: 'arbre', variantes: ['arbre-droite', 'arbre-gauche'] },
  { id: 'chronologie', variantes: ['chronologie-horizontale', 'chronologie-verticale'] },
  { id: 'arete', variantes: ['arete-droite', 'arete-gauche'] },
  { id: 'matrice', variantes: ['matrice-lignes', 'matrice-colonnes'] },
]

export const familleDe = (s: StructureArbre): FamilleStructure => FAMILLES_STRUCTURE.find((f) => f.variantes.includes(s))!

/** Les familles qu'un sujet peut prendre. */
export const famillesPour = (central: boolean): readonly FamilleStructure[] => FAMILLES_STRUCTURE.filter((f) => central || !f.centralSeul)

/** Les formes de branche, dans l'ordre du panneau. */
export const FORMES_BRANCHE: readonly FormeBranche[] = ['coudee-arrondie', 'coudee', 'droite', 'courbe', 'anse', 'pli', 'pli-arrondi']

/** L'effilage n'existe que pour ces formes (le trait y est une surface). */
export const peutEffiler = (f: FormeBranche | null): boolean => f === 'courbe' || f === 'droite'

export const MOTIFS_REMPLISSAGE: readonly MotifRemplissage[] = ['plein', 'plein-main', 'diagonales', 'diagonales-fines', 'horizontales', 'horizontales-fines']
export const MOTIFS_BORDURE_SUJET: readonly MotifTrait[] = ['plein', 'tirets', 'main', 'tirets-main']
export const MOTIFS_TRAIT: readonly MotifTrait[] = ['plein', 'tirets', 'points', 'tiret-point', 'tiret-point-point', 'main', 'tirets-main']
export const MOTIFS_BRANCHE: readonly MotifTrait[] = ['plein', 'tirets', 'main', 'tirets-main']
export const CASSES: readonly (CasseTexte | undefined)[] = [undefined, 'majuscules', 'minuscules', 'capitales']

// — Les règles qui lient des réglages —

/** Choisir un motif de remplissage ; « aucun » ne touche pas à la couleur, qui se grise. */
export const patchMotifRemplissage = (motif: MotifRemplissage): Partial<StyleSujet> => ({ motifRemplissage: motif })

/** Choisir une couleur de remplissage alors qu'il n'y a pas de remplissage : il redevient plein. */
export function patchCouleurRemplissage(motif: MotifRemplissage, couleur: string | undefined): Partial<StyleSujet> {
  return couleur !== undefined && motif === 'aucun' ? { remplissage: couleur, motifRemplissage: 'plein' } : { remplissage: couleur }
}

/** « Aucune bordure » met l'épaisseur à 0 ; un motif choisi alors que l'épaisseur est 0 la remet à 2. */
export function patchMotifBordure(motif: MotifTrait, epaisseur: number): Partial<StyleSujet> {
  if (motif === 'aucun') return { motifBordure: 'aucun', epaisseurBordure: 0 }
  return epaisseur === 0 ? { motifBordure: motif, epaisseurBordure: 2 } : { motifBordure: motif }
}

/** Même règle pour la ligne d'une branche. */
export function patchMotifBranche(motif: MotifTrait, epaisseur: number): Partial<StyleSujet> {
  if (motif === 'aucun') return { motif: 'aucun', epaisseurBranche: 0 }
  return epaisseur === 0 ? { motif, epaisseurBranche: 2 } : { motif }
}

/** Une couleur de bordure choisie alors qu'il n'y a pas de bordure : elle réapparaît. */
export function patchCouleurBordure(motif: MotifTrait, epaisseur: number, couleur: string | undefined): Partial<StyleSujet> {
  return couleur !== undefined && (motif === 'aucun' || epaisseur === 0) ? { bordure: couleur, motifBordure: 'plein', epaisseurBordure: 2 } : { bordure: couleur }
}

/** L'épaisseur d'une branche, avec ou sans effilage (le choix « Mince – Effilé » change les deux). */
export const patchEpaisseurBranche = (epaisseur: number, effilee: boolean): Partial<StyleSujet> => ({ epaisseurBranche: epaisseur, effilee: effilee || undefined })

/** Le gras du texte : de 700 à 400, ou l'inverse (la graisse choisie dans la liste prime sur l'ancien booléen). */
export const patchGras = (graisse: number): Partial<StyleSujet> => ({ graisse: graisse >= 600 ? 400 : 700, gras: undefined })

// — Ce que le panneau montre d'un sujet —

/** Les valeurs « effectives » d'un sujet : celles du rendu, thème et rang compris. Des couleurs CSS (variables permises). */
export interface ValeursSujet {
  genre: GenreSujet
  rang: Rang
  forme: FormeSujet
  motifRemplissage: MotifRemplissage
  /** `null` : pas de remplissage. */
  remplissage: string | null
  motifBordure: MotifTrait
  bordure: string | null
  epaisseurBordure: number
  largeur: number | undefined
  largeurMesuree: number
  famille: string
  taille: number
  graisse: number
  italique: boolean
  barre: boolean
  souligne: boolean
  casse: CasseTexte | undefined
  alignement: 'gauche' | 'centre' | 'droite'
  couleurTexte: string
  /** La sienne ; absente : il suit celle de son parent. */
  structure: StructureArbre | undefined
  structureEffective: StructureArbre
  brancheForme: FormeBranche
  brancheMotif: MotifTrait
  brancheEpaisseur: number
  brancheEffilee: boolean
  branchePointe: PointeTrait
  brancheCouleur: string
  /** Le niveau (le central : 0). */
  niveau: number
  /** Ce qui, dans son style, déroge au thème. */
  surcharge: boolean
}

export function valeursDe(a: Arbre, l: Lecture, id: Id): ValeursSujet {
  const theme = themeDe(a.theme)
  const sujet = l.sujets.get(id)!
  const rang = rangDe(l, id)
  const h = habitDe(l, id, theme)
  const cb = couleurDe(l, id, theme, !!a.options?.uneCouleur)
  const c = couleursDe(h, rang, theme, sujet.classe, cb)
  const b = brancheDe(l, id)
  const encre = theme.encre ?? 'var(--notak-arbre-encre)'
  const forme = b.forme ?? theme.branche
  const sansBordure = c.bordure === 'none'
  return {
    genre: genreDe(l, id),
    rang,
    forme: h.forme,
    motifRemplissage: c.fond === 'none' ? 'aucun' : (h.motifRemplissage ?? 'plein'),
    remplissage: c.fond === 'none' ? null : c.fond,
    motifBordure: sansBordure ? 'aucun' : (h.motifBordure ?? 'plein'),
    bordure: sansBordure ? null : c.bordure,
    epaisseurBordure: sansBordure ? 0 : (h.epaisseurBordure ?? 1.5),
    largeur: sujet.largeur,
    largeurMesuree: mesureDeSujet(l, id, theme).l,
    famille: h.famille,
    taille: h.police,
    graisse: h.graisse,
    italique: h.italique,
    barre: h.barre || sujet.classe === 'barre',
    souligne: h.souligne,
    casse: h.casse,
    alignement: h.alignement,
    couleurTexte: c.encre,
    structure: sujet.structure,
    structureEffective: structureDe(l, id),
    brancheForme: forme,
    brancheMotif: b.motif,
    brancheEpaisseur: b.epaisseur ?? (id === l.central ? 2.5 : 1.75),
    brancheEffilee: b.effilee,
    branchePointe: b.pointe,
    brancheCouleur: cb ?? (id === l.central ? (sujet.style?.couleurBranche ?? encre) : encre),
    niveau: profondeur(l, id),
    surcharge: !!sujet.style && Object.keys(sujet.style).length > 0,
  }
}

// — Mettre à jour —

/** Les sujets qu'un « Mettre à jour » atteint : ceux du même niveau que `id`, ou ses descendants. */
export function cibleDeMiseAJour(l: Lecture, id: Id, portee: 'niveau' | 'sous-sujets'): Id[] {
  const s = l.sujets.get(id)
  if (!s) return []
  if (portee === 'niveau') {
    const n = profondeur(l, id)
    return [...l.sujets.keys()].filter((x) => x !== id && !l.sujets.get(x)!.genre && profondeur(l, x) === n)
  }
  const sortie: Id[] = []
  const pile = [...enfantsDe(l, id)]
  while (pile.length) {
    const x = pile.pop()!
    sortie.push(x)
    pile.push(...enfantsDe(l, x))
  }
  return sortie
}
