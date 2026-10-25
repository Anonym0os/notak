import { type ReglagesDiapo, type ReglagesPitch, nouvelId } from '../../coeur/tableau'
import { RATIOS_PITCH, THEME_PITCH_DEFAUT, THEME_PITCH_PERSO } from './themesPitch'

/**
 * Les réglages du mode Pitch dans un `.xmind` (docs/XMIND.md § 12). Xmind les écrit comme des propriétés de style
 * (`style.properties`) : ceux d'un sujet sur le sujet, le thème et le rapport de la feuille sur le sujet central.
 * Notak les range dans ses propres champs (`Sujet.diapo`, `Arbre.pitch`) et les remet à l'export ; une propriété dont
 * la valeur lui est inconnue reste dans le style, intacte.
 */

type Json = Record<string, unknown>
const estObjet = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

const VISIBILITE: [string, string][] = [['visible', 'show'], ['masque', 'skip']]
const LIVRAISON: [string, string][] = [['percer', 'one-by-one-drill-in'], ['un-par-un', 'one-by-one'], ['tout', 'all-at-once']]
const MISE_EN_PAGE: [string, string][] = [['accolade', 'brace-list'], ['puces', 'bullet-list'], ['paroles', 'lyric-list'], ['arete', 'fishbone'], ['chronologie', 'timeline']]
const IMAGE: [string, string][] = [['gauche', 'left'], ['droite', 'right'], ['dessus', 'aboveTitle'], ['dessous', 'belowTitle'], ['fond', 'full']]

/** Chaque réglage d'un sujet : son champ, sa propriété Xmind, ses valeurs. */
const CHAMPS: [keyof ReglagesDiapo, string, [string, string][]][] = [
  ['sujet', 'topic-slide-visibility', VISIBILITE],
  ['resume', 'summary-slide-visibility', VISIBILITE],
  ['liste', 'list-slide-visibility', VISIBILITE],
  ['livraison', 'list-slide-delivery', LIVRAISON],
  ['miseEnPage', 'list-slide-layout', MISE_EN_PAGE],
  ['image', 'topic-slide-image-placement', IMAGE],
]

const THEME = 'slide-appearance'
const RATIO = 'slide-aspect-ratio'

/**
 * Sort les réglages de diapositives du style d'un sujet. Rend ce qu'on en lit, et le style qui reste (sans les
 * propriétés lues ; `undefined` s'il ne reste rien).
 */
export function extraireDiapo(style: unknown, central: boolean): { diapo?: ReglagesDiapo; pitch?: ReglagesPitch; style: unknown } {
  if (!estObjet(style) || !estObjet(style.properties)) return { style }
  const proprietes: Json = { ...style.properties }
  const diapo: Record<string, string> = {}
  for (const [champ, cle, valeurs] of CHAMPS) {
    const valeur = valeurs.find(([, x]) => x === proprietes[cle])?.[0]
    if (valeur) {
      diapo[champ] = valeur
      delete proprietes[cle]
    }
  }
  const pitch: ReglagesPitch = {}
  if (central) {
    if (typeof proprietes[THEME] === 'string' && proprietes[THEME]) {
      if (proprietes[THEME] !== THEME_PITCH_DEFAUT) pitch.theme = proprietes[THEME]
      delete proprietes[THEME]
    }
    const ratio = proprietes[RATIO]
    if (ratio === 'Auto') delete proprietes[RATIO]
    else if (typeof ratio === 'string' && (RATIOS_PITCH as readonly string[]).includes(ratio)) {
      pitch.ratio = ratio as NonNullable<ReglagesPitch['ratio']>
      delete proprietes[RATIO]
    }
  }
  const { properties: _p, ...reste } = style
  const neuf = Object.keys(proprietes).length > 0 ? { ...reste, properties: proprietes } : reste
  // Un style qu'il ne reste plus qu'à identifier n'a plus rien à dire : l'export en refait un au besoin.
  const vide = Object.keys(style.properties).length > Object.keys(proprietes).length && Object.keys(neuf).every((k) => k === 'id')
  return {
    ...(Object.keys(diapo).length ? { diapo: diapo as ReglagesDiapo } : {}),
    ...(Object.keys(pitch).length ? { pitch } : {}),
    style: vide ? undefined : neuf,
  }
}

/** Remet ces réglages dans le style d'un sujet (celui qu'il avait déjà, gardé tel quel, y gagne ses propriétés). */
export function ajouterDiapo(style: unknown, diapo: ReglagesDiapo | undefined, pitch: ReglagesPitch | undefined): unknown {
  const proprietes: Json = {}
  for (const [champ, cle, valeurs] of CHAMPS) {
    const valeur = valeurs.find(([x]) => x === diapo?.[champ])?.[1]
    if (valeur) proprietes[cle] = valeur
  }
  // Xmind ne connaît pas le thème d'un habillage : la feuille garde alors le thème par défaut.
  if (pitch?.theme && pitch.theme !== THEME_PITCH_PERSO) proprietes[THEME] = pitch.theme
  if (pitch?.ratio) proprietes[RATIO] = pitch.ratio
  if (Object.keys(proprietes).length === 0) return style
  const base: Json = estObjet(style) ? style : {}
  return { ...(typeof base.id === 'string' ? {} : { id: nouvelId() }), ...base, properties: { ...(estObjet(base.properties) ? base.properties : {}), ...proprietes } }
}
