import type { Ligne, Rect } from './glisser'

/**
 * Le rectangle de sélection (docs/NOTION.md § 7) : tiré depuis la marge ou un espace vide, il choisit les blocs qu'il
 * touche. Les décisions sont pures : le rectangle entre deux points, ce qu'il touche, le groupe de frères retenu, et
 * le ou-exclusif avec la sélection d'avant quand Maj est tenue.
 */

/** Le rectangle que dessinent deux points, dans un même repère. */
export function entreDeuxPoints(x0: number, y0: number, x1: number, y1: number): Rect {
  return { gauche: Math.min(x0, x1), haut: Math.min(y0, y1), droite: Math.max(x0, x1), bas: Math.max(y0, y1) }
}

/** Deux rectangles se touchent-ils (les bords comptent) ? */
export const touche = (a: Rect, b: Rect) => !(a.droite < b.gauche || a.gauche > b.droite || a.bas < b.haut || a.haut > b.bas)

/**
 * Les blocs que le rectangle choisit. Ceux dont la ligne le touche, plus leurs ancêtres (chez Notion le rectangle d'un
 * parent contient celui de ses enfants), sont rangés par niveau, selon leur plus proche ancêtre ; le rectangle retient
 * le premier groupe de plus d'un bloc : on ne prend que des frères. Faute d'un tel groupe, le premier qui compte un bloc
 * touché pour de bon (un parent et son premier enfant donnent le parent ; un enfant seul, l'enfant).
 */
export function blocsTouches(lignes: readonly Ligne[], rect: Rect): string[] {
  const parId = new Map(lignes.map((l) => [l.id, l]))
  const touchees = new Set<string>()
  const directes = new Set<string>()
  for (const l of lignes) {
    if (l.type === 'colonnes' || !touche(l, rect)) continue
    touchees.add(l.id)
    directes.add(l.id)
    // Les ancêtres, jusqu'à la colonne ou la page.
    for (let p = l.parent ? parId.get(l.parent) : undefined; p; p = p.parent ? parId.get(p.parent) : undefined) touchees.add(p.id)
  }
  const groupes = new Map<string | null, string[]>()
  for (const l of lignes) {
    if (!touchees.has(l.id)) continue
    const cle = l.parent
    const liste = groupes.get(cle) ?? []
    liste.push(l.id)
    groupes.set(cle, liste)
  }
  const tous = [...groupes.values()]
  return tous.find((g) => g.length > 1) ?? tous.find((g) => g.some((id) => directes.has(id))) ?? []
}

/** Maj tenue : ce que le rectangle touche et la sélection d'avant s'excluent l'un l'autre (ou-exclusif), dans l'ordre du texte. */
export function ouExclusif(ordre: readonly string[], avant: readonly string[], touches: readonly string[]): string[] {
  const a = new Set(avant)
  const t = new Set(touches)
  return ordre.filter((id) => a.has(id) !== t.has(id))
}

/**
 * Un appui peut-il lancer un rectangle ? Pas le bouton du milieu ou de droite, pas là où `refuse` (un bouton, un champ, du
 * texte), pas la barre de défilement (à droite de `largeurUtile`, la largeur de la zone sans sa barre).
 */
export function departPermis(e: { bouton: number; refuse: boolean; x: number; gaucheZone: number; largeurUtile: number }): boolean {
  return e.bouton === 0 && !e.refuse && e.x - e.gaucheZone < e.largeurUtile
}
