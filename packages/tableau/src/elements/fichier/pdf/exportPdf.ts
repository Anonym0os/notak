import type { Fichier, TraitPage } from '../../../coeur/tableau'
import { couleurSure } from '../../image/annotation'
import { OPACITE_SURLIGNEUR } from '../../croquis/trace'
import { traitsDeLaPage } from './annotations'

/**
 * « Télécharger avec les annotations » : le PDF d'origine, et par-dessus, sur chaque page, les traits qu'on y a dessinés,
 * en annotations « Ink » du format PDF (celles d'Acrobat et d'Aperçu), que tout lecteur montre et imprime. pdf.js les
 * écrit lui-même (`saveDocument`, en mise à jour incrémentale) : pas de bibliothèque de plus, le moteur déjà chargé pour
 * lire le PDF suffit. Le fichier d'origine, lui, reste tel quel.
 */

/** Le préfixe des annotations neuves que pdf.js écrit à l'enregistrement (son `AnnotationEditorPrefix`). */
const PREFIXE_ANNOTATION = 'pdfjs_internal_editor_'
/**
 * Le crayon, à peine moins qu'opaque : pdf.js donne alors à l'apparence du trait ses ressources (un état graphique),
 * sans lesquelles Aperçu et le Coup d'œil de macOS le peignent en gris au lieu de sa couleur.
 */
export const OPACITE_CRAYON = 0.999

type Point = [number, number]

/** Une page telle que pdf.js la voit à l'échelle 1 : sa taille montrée (rotation comprise), et le passage aux coordonnées PDF. */
export interface PageVue {
  largeur: number
  hauteur: number
  versPdf(x: number, y: number): Point
}

/** `#rrggbb` en composantes de 0 à 255. */
export function rvb(hex: string): [number, number, number] {
  const n = Number.parseInt(couleurSure(hex).slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const net = (v: number) => Math.round(v * 100) / 100

/**
 * Le tracé d'un trait (points en coordonnées PDF) comme pdf.js range celui d'une annotation Ink : le point de départ,
 * puis des courbes de Bézier cubiques (`c1x, c1y, c2x, c2y, x, y`) ou des segments (`NaN ×4, x, y`). C'est le dessin de
 * la visionneuse : chaque point sert de contrôle à une quadratique qui finit au milieu du segment suivant, écrite ici en
 * cubique, et le dernier segment est droit. `points` : la liste à plat, que la PDF garde dans `InkList`.
 */
export function cheminEncre(pts: readonly Point[]): { lines: number[]; points: number[] } {
  const points = pts.flatMap(([x, y]) => [net(x), net(y)])
  if (pts.length === 0) return { lines: [], points }
  const [x0, y0] = pts[0]!
  const lines = [NaN, NaN, NaN, NaN, net(x0), net(y0)]
  let courant: Point = pts[0]!
  for (let i = 1; i < pts.length - 1; i++) {
    const q = pts[i]!
    const suivant = pts[i + 1]!
    const fin: Point = [(q[0] + suivant[0]) / 2, (q[1] + suivant[1]) / 2]
    const c1: Point = [courant[0] + (2 / 3) * (q[0] - courant[0]), courant[1] + (2 / 3) * (q[1] - courant[1])]
    const c2: Point = [fin[0] + (2 / 3) * (q[0] - fin[0]), fin[1] + (2 / 3) * (q[1] - fin[1])]
    lines.push(...[c1, c2, fin].flat().map(net))
    courant = fin
  }
  if (pts.length > 1) {
    const [xn, yn] = pts[pts.length - 1]!
    lines.push(NaN, NaN, NaN, NaN, net(xn), net(yn))
  }
  return { lines, points }
}

/**
 * L'annotation Ink d'un trait, telle que pdf.js l'écrit (`annotationStorage`) : sa couleur, son épaisseur et son tracé en
 * coordonnées PDF, son cadre. Le surligneur garde sa transparence. `encre` : le type « Ink » des éditeurs de pdf.js.
 */
export function annotationEncre(trait: TraitPage, pageIndex: number, page: PageVue, encre: number) {
  const pts = trait.points.map(([fx, fy]) => page.versPdf(fx * page.largeur, fy * page.hauteur))
  const epaisseur = net(Math.max(0.1, trait.epaisseur * page.largeur))
  const marge = epaisseur / 2 + 1
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const { lines, points } = cheminEncre(pts)
  return {
    annotationType: encre,
    pageIndex,
    color: rvb(trait.couleur),
    thickness: epaisseur,
    opacity: trait.surligneur ? OPACITE_SURLIGNEUR : OPACITE_CRAYON,
    paths: { lines: [lines], points: [points] },
    rect: [Math.min(...xs) - marge, Math.min(...ys) - marge, Math.max(...xs) + marge, Math.max(...ys) + marge].map(net),
    rotation: 0,
  }
}

/** Ce que ce module demande de pdf.js : ouvrir un document, en lire une page, l'enregistrer avec des annotations. */
export interface MoteurExport {
  AnnotationEditorType: { INK: number }
  getDocument(o: object): {
    promise: Promise<{
      getPage(n: number): Promise<{ getViewport(o: { scale: number }): { width: number; height: number; convertToPdfPoint(x: number, y: number): number[] } }>
      annotationStorage: { setValue(cle: string, valeur: unknown): void }
      saveDocument(): Promise<Uint8Array>
      destroy(): Promise<void>
    }>
  }
}

/** Le PDF `octets` avec les traits de `annotations` posés sur leurs pages ; une page qui n'existe pas est passée. */
export async function ajouterTraits(pdfjs: MoteurExport, octets: Uint8Array, annotations: Fichier['annotations'], options: object = {}): Promise<Uint8Array> {
  const doc = await pdfjs.getDocument({ data: octets, ...options }).promise
  try {
    let n = 0
    for (const cle of Object.keys(annotations ?? {})) {
      const numero = Number(cle)
      const traits = traitsDeLaPage(annotations, numero)
      if (!Number.isInteger(numero) || numero < 1 || traits.length === 0) continue
      const page = await doc.getPage(numero).catch(() => null)
      if (!page) continue
      const vue = page.getViewport({ scale: 1 })
      const versPdf = (x: number, y: number): Point => {
        const [px, py] = vue.convertToPdfPoint(x, y)
        return [px ?? 0, py ?? 0]
      }
      for (const trait of traits) doc.annotationStorage.setValue(`${PREFIXE_ANNOTATION}${n++}`, annotationEncre(trait, numero - 1, { largeur: vue.width, hauteur: vue.height, versPdf }, pdfjs.AnnotationEditorType.INK))
    }
    return await doc.saveDocument()
  } finally {
    void doc.destroy()
  }
}

/** Le nom du fichier annoté : celui d'origine, « (annoté) » avant son extension. */
export function nomAnnote(nom: string, suffixe: string): string {
  const point = nom.lastIndexOf('.')
  return point > 0 ? `${nom.slice(0, point)} (${suffixe})${nom.slice(point)}` : `${nom} (${suffixe}).pdf`
}
