import type { FormeBranche, FormeSujet } from '../../coeur/tableau'

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
  },
]

export const themeDe = (id: string | undefined): Theme => THEMES.find((x) => x.id === id) ?? THEMES[0]!
