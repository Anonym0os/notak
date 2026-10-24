import type { PointeTrait } from '../../../coeur/tableau'

/**
 * Le bout d'un trait (docs/XMIND.md § 5 bis, `arrow-end-class`) : onze formes, dessinées à la main dans un repère où le
 * trait arrive par la gauche et finit en (0, 0). Les formes pleines se remplissent, les autres (chevrons, barre,
 * crochet) se tracent.
 */

export interface DessinPointe {
  d: string
  /** Rempli de la couleur du trait ; sinon tracé seulement. */
  plein: boolean
}

type Pt = readonly [number, number]
type Sous = { pts: readonly Pt[]; ferme: boolean }

/** Les sous-chemins d'une pointe de taille `s`, dans le repère local. */
function formes(pointe: PointeTrait, s: number): { sous: Sous[]; plein: boolean } | null {
  const h = s * 0.5
  switch (pointe) {
    case 'aucune':
      return null
    case 'point': {
      const r = s * 0.42
      return { plein: true, sous: [{ ferme: true, pts: Array.from({ length: 14 }, (_, i): Pt => [-r + r * Math.cos((i / 14) * 2 * Math.PI), r * Math.sin((i / 14) * 2 * Math.PI)]) }] }
    }
    case 'triangle':
      return { plein: true, sous: [{ ferme: true, pts: [[0, 0], [-s, -h], [-s, h]] }] }
    case 'fer-de-lance':
      return { plein: true, sous: [{ ferme: true, pts: [[0, 0], [-s, -h], [-s * 0.7, 0], [-s, h]] }] }
    case 'carre':
      return { plein: true, sous: [{ ferme: true, pts: [[0, -h * 0.8], [0, h * 0.8], [-s * 0.8, h * 0.8], [-s * 0.8, -h * 0.8]] }] }
    case 'diamant':
      return { plein: true, sous: [{ ferme: true, pts: [[0, 0], [-s / 2, -h * 0.8], [-s, 0], [-s / 2, h * 0.8]] }] }
    case 'chevrons':
      return { plein: false, sous: [{ ferme: false, pts: [[-s, -h], [0, 0], [-s, h]] }] }
    case 'double-fleche':
      return {
        plein: false,
        sous: [
          { ferme: false, pts: [[-s * 0.7, -h], [0, 0], [-s * 0.7, h]] },
          { ferme: false, pts: [[-s * 1.4, -h], [-s * 0.7, 0], [-s * 1.4, h]] },
        ],
      }
    case 'anti-triangle':
      return { plein: true, sous: [{ ferme: true, pts: [[0, -h], [0, h], [-s, 0]] }] }
    case 'attache':
      return { plein: false, sous: [{ ferme: false, pts: [[0, -h], [0, h]] }] }
    case 'crochet':
      return { plein: false, sous: [{ ferme: false, pts: [[-s, -h * 1.1], [0, 0]] }] }
  }
}

const n = (v: number) => Math.round(v * 10) / 10

/**
 * Le chemin d'une pointe qui finit en (`x`, `y`), le trait arrivant dans la direction `angle` (radians, 0 : vers la
 * droite), de taille `taille` px. `null` : pas de pointe.
 */
export function cheminPointe(pointe: PointeTrait, x: number, y: number, angle: number, taille: number): DessinPointe | null {
  const f = formes(pointe, taille)
  if (!f) return null
  const [c, s] = [Math.cos(angle), Math.sin(angle)]
  const d = f.sous
    .map(({ pts, ferme }) => `M${pts.map(([px, py]) => `${n(x + px * c - py * s)} ${n(y + px * s + py * c)}`).join('L')}${ferme ? 'Z' : ''}`)
    .join('')
  return { d, plein: f.plein }
}

/** Les onze pointes, dans l'ordre du panneau de Xmind, avec le suffixe de `org.xmind.arrowShape.*`. */
export const POINTES: readonly { id: PointeTrait; xmind: string }[] = [
  { id: 'aucune', xmind: 'none' },
  { id: 'point', xmind: 'dot' },
  { id: 'triangle', xmind: 'triangle' },
  { id: 'fer-de-lance', xmind: 'spearhead' },
  { id: 'carre', xmind: 'square' },
  { id: 'diamant', xmind: 'diamond' },
  { id: 'chevrons', xmind: 'herringbone' },
  { id: 'double-fleche', xmind: 'doublearrow' },
  { id: 'anti-triangle', xmind: 'antiTriangle' },
  { id: 'attache', xmind: 'attached' },
  { id: 'crochet', xmind: 'hook' },
]

export const pointeDepuisXmind = (classe: unknown): PointeTrait | undefined => {
  const m = typeof classe === 'string' ? classe.match(/^org\.xmind\.arrowShape\.(.+)$/) : null
  return m ? POINTES.find((p) => p.xmind === m[1])?.id : undefined
}

export const xmindDePointe = (p: PointeTrait): string => `org.xmind.arrowShape.${POINTES.find((x) => x.id === p)!.xmind}`
