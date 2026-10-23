import type { Dessin, Element, Trait } from '../../coeur/tableau'
import { nouvelId } from '../../coeur/tableau'
import { arrondir } from '../croquis/trace'

/** Ce qui entoure les traits, en UG : le dessin ne colle pas à son cadre. */
const MARGE = 1

/**
 * Le dessin né des traits tracés sur la toile (points en UG du tableau, à plat : x, y, x, y…) : posé à leur coin haut
 * gauche, ses traits ramenés à son repère (tous leurs points sont gardés). `null` s'il n'y a rien à garder.
 */
export function dessinDepuis(traits: readonly Trait[]): Element<Dessin> | null {
  const tous = traits.filter((t) => t.points.length >= 2)
  if (tous.length === 0) return null
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const t of tous)
    for (let i = 0; i < t.points.length; i += 2) {
      const [x, y] = [t.points[i]!, t.points[i + 1]!]
      ;[x0, y0, x1, y1] = [Math.min(x0, x - t.epaisseur), Math.min(y0, y - t.epaisseur), Math.max(x1, x + t.epaisseur), Math.max(y1, y + t.epaisseur)]
    }
  const ox = Math.floor(x0 - MARGE)
  const oy = Math.floor(y0 - MARGE)
  const largeur = Math.max(2, Math.ceil(x1 + MARGE) - ox)
  const hauteur = Math.max(2, Math.ceil(y1 + MARGE) - oy)
  return {
    id: nouvelId(),
    x: ox,
    y: oy,
    largeur,
    contenu: {
      type: 'dessin',
      largeurOrigine: largeur,
      hauteurOrigine: hauteur,
      traits: tous.map((t) => ({ ...t, points: arrondir(t.points.map((v, i) => v - (i % 2 === 0 ? ox : oy))) })),
    },
  }
}
