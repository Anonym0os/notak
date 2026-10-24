import type { ReglagesPitch } from '../../coeur/tableau'

/**
 * Les thèmes des diapositives du mode Pitch (docs/XMIND.md § 9). Sept, dans l'ordre du sélecteur ; les identifiants
 * sont ceux qu'on écrit dans la feuille (`slide-appearance`), les dessins sont les nôtres.
 */
export interface ThemePitch {
  id: string
  /** La clé de langue du nom. */
  nom: string
  fond: string
  texte: string
  /** Le second ton : puces, filets, texte discret. */
  accent: string
  police: string
  /** Le dessin du fond (dégradés) posé par-dessus la couleur ; `none` : aucun. */
  motif: string
  /** Les angles des cadres : un thème dessiné à la main les veut inégaux. */
  rayon: string
}

export const THEME_PITCH_DEFAUT = 'default'

export const THEMES_PITCH: readonly ThemePitch[] = [
  { id: 'light', nom: 'arbre.pitch.theme.clair', fond: '#fafbfc', texte: '#1f2326', accent: '#3a86d4', police: 'Inter, ui-sans-serif, system-ui, sans-serif', motif: 'none', rayon: '10px' },
  { id: 'default', nom: 'arbre.pitch.theme.sombre', fond: '#14171a', texte: '#e4e7eb', accent: '#6aa8ea', police: 'Inter, ui-sans-serif, system-ui, sans-serif', motif: 'none', rayon: '10px' },
  {
    id: 'innocence',
    nom: 'arbre.pitch.theme.innocence',
    fond: '#fdf1ec',
    texte: '#5b3b3b',
    accent: '#ef8a79',
    police: 'Georgia, "Times New Roman", serif',
    motif: 'radial-gradient(circle at 12% 18%, #ffd9cf 0 9%, transparent 9.5%), radial-gradient(circle at 90% 85%, #ffe8c9 0 13%, transparent 13.5%)',
    rayon: '999px',
  },
  {
    id: 'shape-for-you',
    nom: 'arbre.pitch.theme.formes',
    fond: '#fffbe8',
    texte: '#1b1b3a',
    accent: '#ff6b3d',
    police: '"Avenir Next", "Trebuchet MS", ui-sans-serif, sans-serif',
    motif: 'radial-gradient(circle at 92% 12%, #ffcf4a 0 10%, transparent 10.5%), linear-gradient(135deg, transparent 0 82%, #6c5ce7 82% 90%, transparent 90%)',
    rayon: '4px',
  },
  {
    id: 'midnight-rose',
    nom: 'arbre.pitch.theme.rose',
    fond: '#1a0f26',
    texte: '#fbe8f0',
    accent: '#ff7aa8',
    police: 'Georgia, "Times New Roman", serif',
    motif: 'radial-gradient(ellipse at 80% 0%, #4a1f55 0, transparent 60%), radial-gradient(ellipse at 0% 100%, #2a1240 0, transparent 55%)',
    rayon: '14px',
  },
  {
    id: 'hubble-bubble',
    nom: 'arbre.pitch.theme.bulles',
    fond: '#0b1d3a',
    texte: '#eaf4ff',
    accent: '#5ad1ff',
    police: '"Avenir Next", ui-rounded, ui-sans-serif, sans-serif',
    motif: 'radial-gradient(circle at 15% 25%, rgb(90 209 255 / 0.22) 0 7%, transparent 7.5%), radial-gradient(circle at 85% 70%, rgb(150 120 255 / 0.2) 0 12%, transparent 12.5%), radial-gradient(circle at 60% 12%, rgb(255 255 255 / 0.1) 0 4%, transparent 4.5%)',
    rayon: '999px',
  },
  {
    id: 'hand-drawn',
    nom: 'arbre.pitch.theme.carnet',
    fond: '#fffdf7',
    texte: '#2b2b2b',
    accent: '#e0533d',
    police: '"Bradley Hand", "Segoe Print", "Marker Felt", "Comic Sans MS", cursive',
    motif: 'repeating-linear-gradient(0deg, transparent 0 31px, rgb(60 90 150 / 0.12) 31px 32px)',
    rayon: '255px 15px 225px 15px / 15px 225px 15px 255px',
  },
]

/** Le thème d'un identifiant ; un identifiant inconnu (venu d'un autre logiciel) retombe sur le sombre. */
export const themePitchDe = (id: string | undefined): ThemePitch => THEMES_PITCH.find((x) => x.id === id) ?? THEMES_PITCH[1]!

export type RatioPitch = NonNullable<ReglagesPitch['ratio']>
export const RATIOS_PITCH: readonly RatioPitch[] = ['16:9', '4:3', '9:16', '3:4']

/** Largeur et hauteur d'un rapport. */
export const dimensionsDuRatio = (r: RatioPitch): { l: number; h: number } => {
  const [l, h] = r.split(':').map(Number) as [number, number]
  return { l, h }
}

/**
 * Le rapport d'une feuille : celui qu'elle dit, ou, en automatique, celui des quatre qui se rapproche le plus de la
 * fenêtre (16:9 sans fenêtre connue).
 */
export function ratioEffectif(p: ReglagesPitch | undefined, largeur?: number, hauteur?: number): RatioPitch {
  if (p?.ratio) return p.ratio
  if (!largeur || !hauteur) return '16:9'
  const cible = Math.log(largeur / hauteur)
  let meilleur: RatioPitch = '16:9'
  let ecart = Infinity
  for (const r of RATIOS_PITCH) {
    const { l, h } = dimensionsDuRatio(r)
    const e = Math.abs(Math.log(l / h) - cible)
    if (e < ecart) {
      ecart = e
      meilleur = r
    }
  }
  return meilleur
}
