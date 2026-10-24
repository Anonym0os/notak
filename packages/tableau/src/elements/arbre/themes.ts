import type { Arbre, FormeBranche, FormeSujet } from '../../coeur/tableau'
import { pileDe } from './carte/polices'

/**
 * Les thèmes d'une carte : un habillage cohérent par rang, le fond et les couleurs des branches (docs/XMIND.md § 5).
 * → Notak : nos propres thèmes, dans nos couleurs. Le classique suit le thème clair ou sombre de Notak (ses couleurs
 * sont des variables CSS) ; les autres ont leur fond à eux.
 */
export interface Theme {
  id: string
  /** Le fond de la carte ; absent : celui du thème de Notak. */
  fond?: string
  /** L'encre des branches sans couleur et des sous-sujets. */
  encre?: string
  texte?: string
  central: { forme: FormeSujet; remplissage?: string; texte?: string }
  /** Un principal plein (de la couleur de sa branche) ou en contour. */
  principal: { forme: FormeSujet; plein: boolean }
  sous: { forme: FormeSujet }
  flottant: { forme: FormeSujet }
  palette: readonly string[]
  branche: FormeBranche
  /** La police de la carte ; absente : celle de Notak. */
  police?: string
  /** Dans quelle liste du sélecteur de thèmes il se range : les colorés, ou les classiques (sobres). */
  categorie?: 'colore' | 'classique'
  /** Ce que les réglages de la carte ajoutent au thème (`themeDeArbre`), jamais écrit dans un thème. */
  cjk?: string
  flottantsColores?: boolean
}

export const THEMES: readonly Theme[] = [
  {
    id: 'classique',
    central: { forme: 'arrondi' },
    principal: { forme: 'arrondi', plein: true },
    sous: { forme: 'souligne' },
    flottant: { forme: 'arrondi' },
    palette: ['#e5534b', '#e69138', '#c9a227', '#3fa66b', '#3a86d4', '#8b5cd6'],
    branche: 'courbe',
    categorie: 'classique',
  },
  {
    id: 'pastel',
    fond: '#fbfaf7',
    encre: '#6b7280',
    texte: '#2f3540',
    central: { forme: 'capsule', remplissage: '#ffe9d6', texte: '#7a3e12' },
    principal: { forme: 'capsule', plein: false },
    sous: { forme: 'souligne' },
    flottant: { forme: 'capsule' },
    palette: ['#f2a7a0', '#f6c48f', '#e9d68a', '#9fd3b0', '#9cc3ec', '#c4b0ec'],
    branche: 'courbe',
    categorie: 'colore',
  },
  {
    id: 'nuit',
    fond: '#161b26',
    encre: '#9aa4b5',
    texte: '#e9edf3',
    central: { forme: 'ellipse', remplissage: '#e9edf3', texte: '#161b26' },
    principal: { forme: 'arrondi', plein: true },
    sous: { forme: 'souligne' },
    flottant: { forme: 'arrondi' },
    palette: ['#ff6b8b', '#ffb454', '#f5e05a', '#52e0a0', '#4cc2ff', '#b78cff'],
    branche: 'courbe',
    categorie: 'colore',
  },
  {
    id: 'sobre',
    fond: '#ffffff',
    encre: '#4b5563',
    texte: '#1f2937',
    central: { forme: 'rectangle', remplissage: '#1f2937', texte: '#ffffff' },
    principal: { forme: 'rectangle', plein: false },
    sous: { forme: 'aucune' },
    flottant: { forme: 'rectangle' },
    palette: ['#374151', '#4b5563', '#6b7280', '#374151', '#4b5563', '#6b7280'],
    branche: 'coudee-arrondie',
    categorie: 'classique',
  },
  {
    id: 'papier',
    fond: '#f6f0e4',
    encre: '#7a6a55',
    texte: '#3b3125',
    central: { forme: 'double-souligne', texte: '#3b3125' },
    principal: { forme: 'souligne', plein: false },
    sous: { forme: 'souligne' },
    flottant: { forme: 'arrondi' },
    palette: ['#9c4a3c', '#b07a2f', '#6f7d3c', '#3f6f6a', '#4d5d8a', '#7a4f7d'],
    branche: 'courbe',
    police: 'Georgia, "Iowan Old Style", serif',
    categorie: 'classique',
  },
  {
    id: 'vif',
    fond: '#ffffff',
    encre: '#111827',
    texte: '#111827',
    central: { forme: 'hexagone', remplissage: '#111827', texte: '#ffffff' },
    principal: { forme: 'capsule', plein: true },
    sous: { forme: 'arrondi' },
    flottant: { forme: 'losange' },
    palette: ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de'],
    branche: 'droite',
    categorie: 'colore',
  },
  // Les thèmes de l'onglet Carte : des palettes à nous, sur les formes du classique (ou du sobre).
  {
    id: 'aurore',
    fond: '#fffdfb',
    encre: '#5b5560',
    texte: '#2b2530',
    central: { forme: 'arrondi', remplissage: '#3a2f45', texte: '#ffffff' },
    principal: { forme: 'arrondi', plein: true },
    sous: { forme: 'souligne' },
    flottant: { forme: 'arrondi' },
    palette: ['#e76f8a', '#f2a65a', '#e9c46a', '#59b9a0', '#5b9bd5', '#9a7fd1'],
    branche: 'courbe',
    categorie: 'colore',
  },
  {
    id: 'ocean',
    fond: '#f5fbfd',
    encre: '#4a6572',
    texte: '#12303d',
    central: { forme: 'capsule', remplissage: '#0b3d52', texte: '#ffffff' },
    principal: { forme: 'capsule', plein: true },
    sous: { forme: 'souligne' },
    flottant: { forme: 'capsule' },
    palette: ['#0b6e99', '#1a8fb8', '#3fb0c9', '#79cfd6', '#2f6fb5', '#264f8f'],
    branche: 'courbe',
    categorie: 'colore',
  },
  {
    id: 'foret',
    fond: '#f7faf4',
    encre: '#56604c',
    texte: '#1f2a1b',
    central: { forme: 'arrondi', remplissage: '#25402d', texte: '#ffffff' },
    principal: { forme: 'arrondi', plein: false },
    sous: { forme: 'souligne' },
    flottant: { forme: 'arrondi' },
    palette: ['#2f7d4f', '#5a9e54', '#8fb94b', '#c2b04a', '#8a6a45', '#4f6d58'],
    branche: 'courbe',
    categorie: 'colore',
  },
  {
    id: 'braise',
    fond: '#fffaf5',
    encre: '#6b4a3f',
    texte: '#33211b',
    central: { forme: 'hexagone', remplissage: '#3b1d18', texte: '#ffffff' },
    principal: { forme: 'arrondi', plein: true },
    sous: { forme: 'souligne' },
    flottant: { forme: 'arrondi' },
    palette: ['#c1272d', '#e3562b', '#f08a24', '#d8a31a', '#8c3b2e', '#5e2a2a'],
    branche: 'droite',
    categorie: 'colore',
  },
  {
    id: 'lavande',
    fond: '#fbf9ff',
    encre: '#5d5670',
    texte: '#2a2438',
    central: { forme: 'ellipse', remplissage: '#3f2f66', texte: '#ffffff' },
    principal: { forme: 'capsule', plein: false },
    sous: { forme: 'souligne' },
    flottant: { forme: 'capsule' },
    palette: ['#7c5cbf', '#9b7fd4', '#b79be0', '#d4a0d9', '#6b8fd6', '#8aa0c8'],
    branche: 'courbe',
    categorie: 'colore',
  },
  {
    id: 'ardoise',
    fond: '#f1f3f5',
    encre: '#495057',
    texte: '#212529',
    central: { forme: 'rectangle', remplissage: '#343a40', texte: '#ffffff' },
    principal: { forme: 'rectangle', plein: true },
    sous: { forme: 'aucune' },
    flottant: { forme: 'rectangle' },
    palette: ['#495057', '#5c7080', '#6c7a89', '#8395a7', '#52606d', '#3d4852'],
    branche: 'coudee-arrondie',
    categorie: 'classique',
  },
]

export const themeDe = (id: string | undefined): Theme => THEMES.find((x) => x.id === id) ?? THEMES[0]!

/** Le préfixe de l'identifiant d'un thème de couleur à soi, gardé dans la carte (`Arbre.themePerso`). */
export const PREFIXE_PERSO = 'perso:'

/** Le nom d'un thème, dans la langue de l'interface (la clé de nom change selon qu'il est venu avec la première liste ou l'onglet Carte). */
export const cleNomTheme = (id: string) => (['classique', 'pastel', 'nuit', 'sobre', 'papier', 'vif'].includes(id) ? `arbre.t.${id}` : `arbre.carte.t.${id}`)

/** Les six couleurs d'un jeu : un jeu plus court se répète jusqu'à six. */
export function jeuDeSix(couleurs: readonly string[]): string[] {
  if (couleurs.length === 0) return []
  return Array.from({ length: 6 }, (_, i) => couleurs[i % couleurs.length]!)
}

/** Un thème de couleur à soi : l'habillage du classique, dans six couleurs. */
export function themePerso(id: string, palette: readonly string[]): Theme {
  return { ...THEMES[0]!, id, palette: jeuDeSix(palette), categorie: 'colore' }
}

type Reglages = Pick<Arbre, 'theme' | 'themePerso' | 'police' | 'policeCjk' | 'jeuCouleurs' | 'options'>

/** Le thème que la carte désigne (un des nôtres, ou le sien), sans ce que ses réglages y changent. */
export const themeBase = (a: Pick<Arbre, 'theme' | 'themePerso'>): Theme =>
  a.theme?.startsWith(PREFIXE_PERSO) && a.themePerso ? themePerso(a.theme, a.themePerso.palette) : themeDe(a.theme)

/**
 * Le thème de cette carte : celui qu'elle désigne, puis ce que les réglages de l'onglet Carte lui changent : la police
 * de toute la carte, la police CJK, le jeu de couleurs des branches, les flottants colorés.
 */
export function themeDeArbre(a: Reglages): Theme {
  const base = themeBase(a)
  const jeu = a.jeuCouleurs?.length ? jeuDeSix(a.jeuCouleurs) : null
  if (!a.police && !a.policeCjk && !jeu && !a.options?.flottantsColores) return base
  return {
    ...base,
    ...(a.police ? { police: pileDe(a.police) } : {}),
    ...(a.policeCjk ? { cjk: a.policeCjk } : {}),
    ...(jeu ? { palette: jeu } : {}),
    ...(a.options?.flottantsColores ? { flottantsColores: true } : {}),
  }
}

/** Le fond de la carte : le sien, sinon celui de son thème ; `undefined` : celui de Notak. */
export const fondDe = (a: Reglages & { fond?: string | undefined }): string | undefined => a.fond ?? themeDeArbre(a).fond

/**
 * Les couleurs d'accent d'un thème, sans doublon : de quoi faire ses variantes à une seule couleur. Le jeu
 * de branches de la carte ne compte pas, c'est celui du thème qu'on décline.
 */
export const accentsDe = (theme: Theme): string[] => [...new Set(theme.palette)]

/** Combien de variantes un thème montre : la sienne à branches de couleur, puis une par accent. */
export const VARIANTES_MAX = 6

/** Les variantes d'un thème : `undefined` pour celle à branches de couleur, puis chaque accent. */
export const variantesDe = (theme: Theme): (string | undefined)[] => [undefined, ...accentsDe(theme).slice(0, VARIANTES_MAX - 1)]

/** Les jeux de couleurs de branches qu'on propose après celui du thème (docs/XMIND.md § 9). */
export const JEUX_COULEURS: readonly { id: string; couleurs: readonly string[] }[] = [
  { id: 'vifs', couleurs: ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de'] },
  { id: 'doux', couleurs: ['#e48a84', '#e9b27a', '#e2cd7f', '#8fc9a0', '#8fb6e0', '#b9a3e0'] },
  { id: 'pastel', couleurs: ['#f4b6b2', '#f8d3a8', '#f6e6a2', '#bfe3c8', '#bcd7f2', '#d9c9f1'] },
  { id: 'bleus', couleurs: ['#0b3d91', '#1558b0', '#2a76cf', '#4b94e0', '#78b1ec', '#a8cdf5'] },
  { id: 'terre', couleurs: ['#8c5a3c', '#b07a43', '#a39a52', '#6f8a5b', '#587a7a', '#7a5c6e'] },
  { id: 'verts', couleurs: ['#1b5e3b', '#2e7d4f', '#4c9a63', '#74b77c', '#a1cf95', '#cfe7bf'] },
  { id: 'feu', couleurs: ['#7f1d1d', '#b3261e', '#d9481c', '#ee7a1a', '#f4a62a', '#f8cf58'] },
  { id: 'violets', couleurs: ['#3b1d6e', '#5b2f9e', '#7c4dc4', '#9b73d8', '#b99be6', '#d6c4f2'] },
  { id: 'sourds', couleurs: ['#4b5563', '#6b7280', '#7d8a99', '#8e9aa8', '#a3acb8', '#b8bec9'] },
]
