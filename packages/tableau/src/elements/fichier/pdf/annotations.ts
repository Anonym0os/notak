import type { Fichier, TraitPage } from '../../../coeur/tableau'
import { type Point2, ajouterPoint, epaisseurPour, gommer, traitVise } from '../../image/annotation'
import type { TaillePage } from './mise'

/**
 * Le dessin sur les pages d'un PDF, sans pdf.js : les traits de l'image (`image/annotation.ts`) posés sur une page, en
 * fractions de la page telle qu'elle se montre. Ils sont rangés dans le contenu de l'élément Fichier, par numéro de page
 * (`Fichier.annotations`) : ils voyagent avec la synchro et l'historique comme le reste du contenu.
 */

export type Pages = Record<string, TraitPage[]>

const arrondi = (v: number) => Math.round(v * 10_000) / 10_000
const entre01 = (v: number) => Math.max(0, Math.min(1, v))
const nombre = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Un point de la page sous le pointeur (`x`, `y` en pixels d'écran), en fractions de la page montrée dans `boite`. */
export function pointSurPage(x: number, y: number, boite: { left: number; top: number; width: number; height: number }): Point2 {
  if (boite.width <= 0 || boite.height <= 0) return [0, 0]
  return [arrondi(entre01((x - boite.left) / boite.width)), arrondi(entre01((y - boite.top) / boite.height))]
}

/** Un trait venu du document (un autre appareil, une autre version) qu'on peut dessiner sans risque, ou `null`. */
function traitLu(brut: unknown): TraitPage | null {
  if (!brut || typeof brut !== 'object') return null
  const t = brut as Partial<TraitPage>
  if (typeof t.id !== 'string' || typeof t.couleur !== 'string' || !nombre(t.epaisseur) || t.epaisseur <= 0 || !Array.isArray(t.points)) return null
  const points = t.points.filter((p): p is [number, number] => Array.isArray(p) && nombre(p[0]) && nombre(p[1]))
  if (points.length === 0) return null
  return { id: t.id, couleur: t.couleur, epaisseur: t.epaisseur, points, ...(t.surligneur === true ? { surligneur: true } : {}) }
}

/** Les traits de cette page (1 pour la première), tels qu'on peut les dessiner. */
export function traitsDeLaPage(pages: Fichier['annotations'] | undefined, page: number): TraitPage[] {
  const brut = pages?.[String(page)]
  if (!Array.isArray(brut)) return []
  return brut.flatMap((t) => traitLu(t) ?? [])
}

/** Combien de traits porte le document, toutes pages comprises. */
export const nombreDeTraits = (pages: Fichier['annotations'] | undefined): number =>
  Object.values(pages ?? {}).reduce((n, traits) => n + (Array.isArray(traits) ? traits.length : 0), 0)

/** Les pages avec ces traits ; une page sans trait n'est pas gardée. */
export function avecTraitsDePage(pages: Pages, page: number, traits: readonly TraitPage[]): Pages {
  const { [String(page)]: _, ...reste } = pages
  return traits.length > 0 ? { ...reste, [String(page)]: [...traits] } : reste
}

/** Le fichier avec ces annotations, ou sans la clé quand il n'y en a plus. */
export function avecAnnotations(c: Fichier, pages: Pages): Fichier {
  const { annotations: _, ...reste } = c
  const gardees = Object.fromEntries(Object.entries(pages).filter(([, traits]) => traits.length > 0))
  return Object.keys(gardees).length > 0 ? { ...reste, annotations: gardees } : reste
}

/**
 * Ce que le brouillon change aux annotations, posé sur celles du document telles qu'elles sont maintenant : page par
 * page, les traits que le brouillon a retirés (par leur identifiant) s'en vont, ceux qu'il a ajoutés arrivent au-dessus.
 * Les traits qu'un autre a posés entre-temps, sur la même page ou ailleurs, restent.
 */
export function fusionnerAnnotations(actuel: Pages, depart: Pages, brouillon: Pages): Pages {
  let sortie: Pages = { ...actuel }
  for (const page of new Set([...Object.keys(depart), ...Object.keys(brouillon)])) {
    const avant = depart[page] ?? []
    const apres = brouillon[page] ?? []
    if (JSON.stringify(avant) === JSON.stringify(apres)) continue
    const idsApres = new Set(apres.map((t) => t.id))
    const idsAvant = new Set(avant.map((t) => t.id))
    const retires = new Set(avant.filter((t) => !idsApres.has(t.id)).map((t) => t.id))
    const ici = (actuel[page] ?? []).filter((t) => !retires.has(t.id))
    const deja = new Set(ici.map((t) => t.id))
    const ajoutes = apres.filter((t) => !idsAvant.has(t.id) && !deja.has(t.id))
    sortie = avecTraitsDePage(sortie, Number(page), [...ici, ...ajoutes])
  }
  return sortie
}

/** Une page vue comme une image : ce que les outils du dessin d'image attendent de sa taille. */
const commeImage = (taille: TaillePage) => ({ largeurOrigine: taille.largeur, hauteurOrigine: taille.hauteur })

/** L'épaisseur à ranger pour un trait de `px` pixels sur une page montrée large de `largeurPx` pixels. */
export const epaisseurSurPage = (px: number, largeurPx: number) => epaisseurPour(px, largeurPx)

/** Le tracé en cours, un point de plus (un doublon du dernier ne compte pas). */
export const prolonger = (points: readonly Point2[], p: Point2): Point2[] => ajouterPoint(points, p)

/** Les traits qui restent quand la gomme passe en `p` (rayon en fraction de la largeur de la page). */
export const gommerPage = (traits: readonly TraitPage[], p: Point2, rayon: number, taille: TaillePage): TraitPage[] => gommer(traits, p, rayon, commeImage(taille))

/** Le trait que la gomme viserait en `p` (le plus récent qu'elle touche), ou -1. */
export const traitViseSurPage = (traits: readonly TraitPage[], p: Point2, rayon: number, taille: TaillePage): number => traitVise(traits, p, rayon, commeImage(taille))
