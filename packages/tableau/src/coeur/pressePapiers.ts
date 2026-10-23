import { type Point, type Rect, englobant } from './geometrie'
import { type Element, type Extremite, type Id, type Tableau, aimanter, nouvelId } from './tableau'

/** Ce qu'on a copié : les éléments, prêts à recréer, et leur cadre d'origine sur le tableau (en UG). */
export interface Paquet {
  tableau?: Id
  elements: Element[]
  cadre: Rect
}

export const TYPE_PAQUET = 'application/x-notak+json'

const ancres = (e: Element): Id[] => {
  const c = e.contenu
  if (c.type !== 'ligne') return []
  return [c.depart, c.arrivee].flatMap((x) => ('element' in x ? [x.element] : []))
}

/**
 * Le paquet de ces éléments : eux, le contenu des colonnes copiées, et les lignes dont chaque bout accroché
 * part avec. Un élément tiré de sa colonne se pose sur la toile à l'endroit où on le voit (`rect`).
 */
export function empaqueter(t: Tableau, ids: Iterable<Id>, rect: (id: Id) => Rect | null): Paquet | null {
  const choisis = new Set(ids)
  const pris = new Map<Id, Element>()
  for (const e of t.elements) {
    if (!choisis.has(e.id) || e.contenu.type === 'ligne') continue
    if (e.parent && !choisis.has(e.parent)) {
      const r = rect(e.id)
      const { parent: _p, ordre: _o, ...libre } = e
      const [x, y] = r ? aimanter(r.min) : [e.x, e.y]
      pris.set(e.id, { ...libre, x, y })
    } else pris.set(e.id, e)
  }
  // Le contenu d'une colonne copiée part avec elle.
  for (const e of t.elements) if (e.parent && pris.has(e.parent) && !pris.has(e.id)) pris.set(e.id, e)
  for (const e of t.elements) {
    if (e.contenu.type !== 'ligne') continue
    const bouts = ancres(e)
    const avecLesSiens = bouts.length > 0 && bouts.every((a) => pris.has(a))
    // Une ligne choisie se copie même seule : ses bouts gardent alors les éléments d'origine.
    if (avecLesSiens || choisis.has(e.id)) pris.set(e.id, e)
  }
  const elements = [...pris.values()]
  const cadres = elements.filter((e) => !e.parent && e.contenu.type !== 'ligne').flatMap((e) => rect(e.id) ?? [])
  // Des lignes seules n'ont pas de carte pour cadre : leurs bouts libres et les éléments où elles tiennent.
  if (cadres.length === 0) {
    for (const e of elements) {
      if (e.contenu.type !== 'ligne') continue
      for (const x of [e.contenu.depart, e.contenu.arrivee]) {
        if ('element' in x) cadres.push(...[rect(x.element)].flatMap((r) => r ?? []))
        else cadres.push({ min: { x: x.x, y: x.y }, max: { x: x.x, y: x.y } })
      }
    }
  }
  const cadre = englobant(cadres)
  if (elements.length === 0 || !cadre) return null
  return { ...(t.id ? { tableau: t.id } : {}), elements, cadre }
}

/** Les éléments du paquet, avec des identifiants neufs (colonnes et lignes suivent), décalés de `d` UG. */
export function deballer(p: Paquet, d: Point): Element[] {
  const neufs = new Map(p.elements.map((e) => [e.id, nouvelId()]))
  return p.elements.map((e) => {
    const id = neufs.get(e.id)!
    const parent = e.parent && neufs.get(e.parent)
    const { corbeille: _c, nonTrie: _n, verrou: _v, ...reste } = e
    let contenu = e.contenu
    if (contenu.type === 'ligne') {
      const bout = (x: Extremite): Extremite =>
        'element' in x ? { ...x, element: neufs.get(x.element) ?? x.element } : { x: x.x + d.x, y: x.y + d.y }
      contenu = { ...contenu, depart: bout(contenu.depart), arrivee: bout(contenu.arrivee) }
    }
    return parent
      ? { ...reste, id, parent, contenu }
      : { ...reste, id, contenu, x: e.x + d.x, y: e.y + d.y }
  })
}

/**
 * Où coller : décalé de 2 UG par collage tant que l'original est en vue sur le même tableau ;
 * sinon centré dans la vue.
 */
export function decalageDeCollage(p: Paquet, enVue: boolean, n: number, centre: Point): Point {
  if (enVue) return { x: 2 * n, y: 2 * n }
  const [cx, cy] = [(p.cadre.min.x + p.cadre.max.x) / 2, (p.cadre.min.y + p.cadre.max.y) / 2]
  return { x: Math.round(centre.x - cx), y: Math.round(centre.y - cy) }
}

/** Le texte brut du paquet, pour coller ailleurs que dans Notak. */
export function texteDuPaquet(p: Paquet): string {
  const lignes: string[] = []
  const lire = (n: { text?: string; content?: unknown[] }): string =>
    n.text ?? (n.content ?? []).map((x) => lire(x as typeof n)).join(n.content?.length ? '\n' : '')
  for (const e of p.elements) {
    const c = e.contenu
    if (c.type === 'note' || c.type === 'taches') lignes.push(lire(c.texte).trim())
    else if (c.type === 'lien') lignes.push(c.url)
    else if (c.type === 'colonne') lignes.push(c.titre)
  }
  return lignes.filter(Boolean).join('\n\n')
}
