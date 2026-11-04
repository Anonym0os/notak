import type { Dessin, Element, Operation, Trait } from '../../coeur/tableau'
import { nouvelId } from '../../coeur/tableau'
import { arrondirTrait, rayonMax } from '../croquis/trace'

// La sélection vit dans le module partagé du croquis ; le dessin la reprend d'ici comme avant.
export { type Boite, boiteTrait, deplacerTraits, sansTraits, traitsDansMarquise } from '../croquis/selection'

/** Ce qui entoure les traits, en UG : le dessin ne colle pas à son cadre. */
const MARGE = 1

/** Un trait utilisable : au moins un point, et pas de valeur absurde (un simple appui peut donner des NaN). */
export const traitValide = (t: Trait): boolean => t.points.length >= 2 && t.points.every(Number.isFinite)

/**
 * Le dessin né des traits tracés sur la toile (points en UG du tableau, à plat : x, y, x, y…) : un seul élément pour
 * toute la session, posé au coin haut gauche de l'encre (`rayonMax`), ses traits ramenés à son repère (tous leurs
 * points sont gardés, à moins d'un cinquantième d'épaisseur près). `null` s'il n'y a rien à garder.
 */
export function dessinDepuis(traits: readonly Trait[]): Element<Dessin> | null {
  const tous = traits.filter(traitValide)
  if (tous.length === 0) return null
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const t of tous) {
    const r = rayonMax(t)
    for (let i = 0; i < t.points.length; i += 2) {
      const [x, y] = [t.points[i]!, t.points[i + 1]!]
      ;[x0, y0, x1, y1] = [Math.min(x0, x - r), Math.min(y0, y - r), Math.max(x1, x + r), Math.max(y1, y + r)]
    }
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
      traits: tous.map((t) => ({ ...t, points: arrondirTrait(t.points.map((v, i) => v - (i % 2 === 0 ? ox : oy)), t.epaisseur) })),
    },
  }
}

/** Les traits d'un dessin posé, ramenés au repère du tableau (UG) : de quoi le rouvrir. */
export function traitsDe(element: Element<Dessin>): Trait[] {
  const c = element.contenu
  const k = c.largeurOrigine > 0 ? element.largeur / c.largeurOrigine : 1
  return c.traits.map((t) => ({ ...t, epaisseur: t.epaisseur * k, points: t.points.map((v, i) => v * k + (i % 2 === 0 ? element.x : element.y)) }))
}

/** Ce qu'il faut faire d'un dessin rouvert une fois ses traits refaits : le mettre à jour sur place, ou le jeter s'il n'en reste aucun. */
export function operationsApresEdition(element: Element<Dessin>, traits: readonly Trait[]): Operation[] {
  const neuf = dessinDepuis(traits)
  if (!neuf) return [{ type: 'supprimer', element }]
  const ops: Operation[] = []
  if (neuf.x !== element.x || neuf.y !== element.y) ops.push({ type: 'deplacer', id: element.id, de: [element.x, element.y], vers: [neuf.x, neuf.y] })
  if (neuf.largeur !== element.largeur) ops.push({ type: 'redimensionner', id: element.id, de: element.largeur, vers: neuf.largeur })
  ops.push({ type: 'contenu', id: element.id, avant: element.contenu, apres: neuf.contenu })
  return ops
}

/** Le pointeur est-il assez près du bas de la fenêtre pour que la barre s'efface pendant un tracé ? */
export const presDuBas = (y: number, hauteurFenetre: number, seuil = 120): boolean => hauteurFenetre - y < seuil
