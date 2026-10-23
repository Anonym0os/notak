import type { Rect } from './geometrie'
import type { Id } from './tableau'

/**
 * Ce qui grandit pousse ce qui est dessous ; ce qui rapetisse ramène ce qu'il avait collé à lui. Tout est en UG.
 *
 * Un voisin est « collé » quand moins de `ECART_LIE` le sépare du bas de l'élément : il garde cet écart en étant
 * poussé. Un voisin plus loin n'est rattrapé que si l'élément l'atteint ; il garde alors `MARGE`, et sa place
 * d'origine est retenue : en remontant, il ne la dépassera pas. Un voisin poussé pousse à son tour.
 */
export const ECART_LIE = 3
export const MARGE = 2
/** L'ombre d'une carte la fait paraître plus près de celle du dessous. */
const OMBRE = 0.4

/** Chevauchement strict : deux bords qui se touchent ne se chevauchent pas. */
const croise = (a: Rect, b: Rect) => a.min.x < b.max.x && b.min.x < a.max.x && a.min.y < b.max.y && b.min.y < a.max.y
const allonge = (r: Rect, dy: number): Rect => ({ min: r.min, max: { x: r.max.x, y: r.max.y + dy } })
const decale = (r: Rect, dy: number): Rect => ({ min: { x: r.min.x, y: r.min.y + dy }, max: { x: r.max.x, y: r.max.y + dy } })

export interface Changement {
  avant: Rect
  apres: Rect
  /** Un élément qui vient de naître sous un autre (Cmd+Entrée) : `avant` est ignoré, il n'avait pas de place. */
  nouveau?: boolean
}

/**
 * Les décalages verticaux (UG entières) à donner aux voisins quand un élément passe de `avant` à `apres`.
 * `origines` retient la hauteur d'origine des voisins rattrapés, d'un appel à l'autre pendant un même geste.
 */
export function poussees(id: Id, change: Changement, voisins: ReadonlyMap<Id, Rect>, origines: Map<Id, number>): Map<Id, number> {
  const decalages = new Map<Id, number>()
  const traites = new Set<Id>([id])
  const ou = (v: Id) => decale(voisins.get(v)!, decalages.get(v) ?? 0)
  // Né à l'instant, il pousse comme s'il avait grandi depuis son bord haut.
  const depart = change.nouveau ? { ...change, avant: { min: change.apres.min, max: { x: change.apres.max.x, y: change.apres.min.y } } } : change
  pousser(depart, [...voisins.keys()], [...voisins.keys()])

  function pousser({ avant, apres, nouveau }: Changement, candidats: Id[], tous: Id[]) {
    const ecart = apres.max.y - avant.max.y
    if (ecart === 0) return
    // Un voisin qui chevauchait déjà l'élément : la disposition n'est pas une pile, on ne touche à rien.
    if (!nouveau && candidats.some((v) => !traites.has(v) && croise(avant, ou(v)))) return

    const atteinte = allonge(apres, ECART_LIE)
    const lieAvant = allonge(avant, ECART_LIE + 1)
    const lieApres = allonge(apres, ECART_LIE + 1)
    const suite: { id: Id; change: Changement }[] = []
    const dessous = candidats.filter((v) => !traites.has(v) && ou(v).min.y >= avant.max.y)

    for (const v of candidats) {
      if (traites.has(v)) continue
      const r = ou(v)
      const descend = ecart > 0 && !croise(avant, r) && croise(atteinte, r)
      const remonte = ecart < 0 && croise(lieAvant, r) && !croise(apres, r)
      if (!descend && !remonte) {
        // Il vient d'être rattrapé sans bouger : sa place d'origine compte pour la suite du geste.
        if (ecart > 0 && !croise(lieAvant, r) && croise(lieApres, r) && !origines.has(v)) origines.set(v, r.min.y)
        continue
      }
      traites.add(v)
      const ecartOrigine = Math.round(r.min.y - (avant.max.y + OMBRE))
      const marge = ecartOrigine > ECART_LIE ? MARGE : Math.max(0, ecartOrigine)
      let dy = Math.round(apres.max.y + OMBRE) + marge - Math.round(r.min.y)
      if (descend && ecartOrigine > ECART_LIE && !origines.has(v)) origines.set(v, r.min.y)
      if (remonte) {
        dy = Math.min(0, Math.max(dy, plafond(v, r, dy, tous)))
        const origine = origines.get(v)
        if (origine !== undefined) dy = Math.max(dy, Math.round(origine - r.min.y))
      }
      if (dy === 0) continue
      decalages.set(v, (decalages.get(v) ?? 0) + dy)
      suite.push({ id: v, change: { avant: r, apres: decale(r, dy) } })
    }
    for (const s of suite) pousser(s.change, dessous, tous)
  }

  /** En remontant, ne pas monter sur un élément resté au-dessus. */
  function plafond(v: Id, r: Rect, dy: number, tous: Id[]): number {
    const zone: Rect = { min: { x: r.min.x, y: r.min.y + dy - 2 }, max: { x: r.max.x, y: r.min.y } }
    let limite = -Infinity
    for (const w of tous) {
      if (w === v || traites.has(w)) continue
      const rw = ou(w)
      if (croise(r, rw) || !croise(zone, rw)) continue
      limite = Math.max(limite, Math.round(rw.max.y - r.min.y) + 1)
    }
    return limite
  }

  for (const [v, dy] of decalages) if (dy === 0) decalages.delete(v)
  return decalages
}
