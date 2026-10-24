import type { CSSProperties } from 'react'
import type { ReglagesPitch } from '../../coeur/tableau'
import type { FormesDiapo } from './diapo/formes'
import { FORMES_BULLES, FORMES_CARNET, FORMES_INNOCENCE, FORMES_MINUIT, FORMES_SHAPE } from './diapo/formesDesThemes'

/**
 * Les thèmes des diapositives du mode Pitch (docs/XMIND.md § 11, relevé 12). Sept, dans l'ordre du sélecteur ; les
 * identifiants sont ceux qu'on écrit dans la feuille (`slide-appearance`), les dessins sont les nôtres.
 *
 * Comme chez Xmind, un thème n'a pas d'accent : une seule couleur de premier plan sert au texte et à toutes les formes
 * (accolades, puces, arêtes, chronologie, filets). Les exceptions (puces de midnight-rose et de hubble-bubble) vivent
 * dans les formes du thème. Le décor de fond est dessiné par `diapo/decor.tsx`.
 */
export interface ThemePitch {
  id: string
  /** La clé de langue du nom. */
  nom: string
  fond: string
  /** Le fond de la vignette du sélecteur, quand il diffère (le clair y est blanc pur). */
  fondVignette?: string
  /** La couleur de premier plan : texte, accolades, puces, arêtes, chronologie, filets. */
  texte: string
  /** La couleur d'un groupe survolé en mode présentateur. */
  surbrillance: string
  police: string
  /** La police des titres : Modak pour hubble-bubble, la même ailleurs. */
  policeTitre: string
  graisse: number
  graisseTitre: number
  graisseNote: number
  /** L'opacité des sous-sujets pas encore montrés, en mode présentateur. */
  enAttente: number
  /** L'opacité de l'ombre des zones cliquables : 25 % sur fond sombre, 15 % sur fond clair. */
  ombreZone: number
  /** L'opacité du titre flouté derrière les images (imageable-list). */
  titreFloute: number
  /** Le contour blanc des images, px de base (midnight-rose, hubble-bubble). */
  contourImage: number
  /** Le contenu est rogné à tant de px du bord (le cadre manuscrit de hand-drawn). */
  rognage: number
  /** Les formes propres au thème, par-dessus celles par défaut. */
  formes?: Partial<FormesDiapo>
}

export const THEME_PITCH_DEFAUT = 'default'

/** La pile système de Xmind ; Inter (déjà servie par l'application) avant Arial hors Apple. */
const SYSTEME = '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, "Inter Variable", Arial, "PingFang SC", "Microsoft YaHei", sans-serif'

const sombre: ThemePitch = {
  id: 'default',
  nom: 'arbre.pitch.theme.sombre',
  fond: '#000',
  texte: '#fff',
  surbrillance: '#0A84FF',
  police: SYSTEME,
  policeTitre: SYSTEME,
  graisse: 400,
  graisseTitre: 700,
  graisseNote: 400,
  enAttente: 0.3,
  ombreZone: 0.25,
  titreFloute: 0.7,
  contourImage: 0,
  rognage: 0,
}

export const THEMES_PITCH: readonly ThemePitch[] = [
  // Le clair est une copie du sombre (relevé 12 § 2) ; sa vignette est d'un blanc pur.
  { ...sombre, id: 'light', nom: 'arbre.pitch.theme.clair', fond: '#f9f9f9', fondVignette: '#fff', texte: '#000', surbrillance: '#007AFF', enAttente: 0.2, ombreZone: 0.15, titreFloute: 0.5 },
  sombre,
  {
    ...sombre,
    id: 'innocence',
    nom: 'arbre.pitch.theme.innocence',
    fond: '#F7FFF4',
    texte: '#000',
    police: '"Signika Variable", "PingFang SC", "Microsoft YaHei", sans-serif',
    policeTitre: '"Signika Variable", "PingFang SC", "Microsoft YaHei", sans-serif',
    graisse: 700,
    graisseNote: 700,
    enAttente: 0.2,
    ombreZone: 0.15,
    titreFloute: 0.5,
    formes: FORMES_INNOCENCE,
  },
  {
    ...sombre,
    id: 'shape-for-you',
    nom: 'arbre.pitch.theme.formes',
    fond: '#FAE4E8',
    texte: '#000',
    police: '"Tenor Sans", "Songti SC", sans-serif',
    policeTitre: '"Tenor Sans", "Songti SC", sans-serif',
    graisseTitre: 400,
    enAttente: 0.2,
    ombreZone: 0.15,
    titreFloute: 0.5,
    formes: FORMES_SHAPE,
  },
  {
    ...sombre,
    id: 'midnight-rose',
    nom: 'arbre.pitch.theme.rose',
    fond: '#2C47D8',
    texte: '#fff',
    surbrillance: '#45A2FF',
    police: 'Audiowide, "PingFang SC", "Microsoft YaHei", sans-serif',
    policeTitre: 'Audiowide, "PingFang SC", "Microsoft YaHei", sans-serif',
    graisse: 700,
    graisseNote: 700,
    contourImage: 10,
    formes: FORMES_MINUIT,
  },
  {
    ...sombre,
    id: 'hubble-bubble',
    nom: 'arbre.pitch.theme.bulles',
    fond: '#48C279',
    texte: '#FDFF8C',
    police: '"Nunito Variable", "Yuanti SC", sans-serif',
    policeTitre: 'Modak, "Yuanti SC", sans-serif',
    graisse: 700,
    graisseNote: 700,
    enAttente: 0.2,
    contourImage: 10,
    formes: FORMES_BULLES,
  },
  {
    ...sombre,
    id: 'hand-drawn',
    nom: 'arbre.pitch.theme.carnet',
    fond: '#EDF4E5',
    texte: '#2F4DB5',
    surbrillance: '#007AFF',
    police: 'Kalam, "Xiaolai SC", cursive, sans-serif',
    policeTitre: 'Kalam, "Xiaolai SC", cursive, sans-serif',
    enAttente: 0.2,
    ombreZone: 0.15,
    titreFloute: 0.5,
    rognage: 30,
    formes: FORMES_CARNET,
  },
]

/** Le thème d'un identifiant ; un identifiant inconnu (venu d'un autre logiciel) retombe sur le sombre. */
export const themePitchDe = (id: string | undefined): ThemePitch => THEMES_PITCH.find((x) => x.id === id) ?? THEMES_PITCH[1]!

/**
 * Les variables CSS d'un thème, posées sur le cadre de la diapositive. Le dessin des gabarits lit les cinq premières ;
 * les suivantes servent au décor, au mode présentateur et aux images.
 */
export const variablesDeTheme = (th: ThemePitch): CSSProperties =>
  ({
    '--d-fond': th.fond,
    '--d-texte': th.texte,
    '--d-police': th.police,
    '--d-police-titre': th.policeTitre,
    '--d-graisse-titre': String(th.graisseTitre),
    '--d-graisse': String(th.graisse),
    '--d-graisse-note': String(th.graisseNote),
    '--d-surbrillance': th.surbrillance,
    '--d-en-attente': String(th.enAttente),
    '--d-ombre-zone': `rgb(0 0 0 / ${th.ombreZone})`,
    '--d-titre-floute': String(th.titreFloute),
    '--d-contour-image': `${th.contourImage}px`,
    '--d-rognage': `${th.rognage}px`,
  }) as CSSProperties

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
