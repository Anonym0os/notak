/**
 * Où est rangée chaque toile, et lesquelles sont à la corbeille : la règle de la bibliothèque, la même sur un serveur
 * (`GET /api/bibliotheque`) et dans l'app (`apps/web/src/local/bibliotheque.ts`). Une toile est dans celle qui porte sa
 * carte, où qu'on l'ait glissée ; son parent déclaré (la base, l'index) ne compte que s'il porte cette carte, ou si
 * aucune toile lue ne la porte. Sa carte jetée, elle est à la corbeille, et tout ce qu'elle contient avec elle.
 *
 * Un raccourci (une carte `raccourci: true`) ne range rien : la toile reste dans celle qui porte sa carte. Il la montre
 * seulement, en plus, dans la toile qui le porte (`raccourcisVers`), comme un alias du Finder.
 */

/** Ce qu'on sait d'une toile pour la ranger : son parent déclaré, et ce que dit son résumé (`resumesDuTableau`). */
export interface ToileARanger {
  id: string
  parent: string | null
  /** Les toiles dont elle porte la carte (pas un raccourci). */
  cartes?: readonly string[]
  /** Les toiles dont elle a jeté la carte à sa corbeille. */
  jetees?: readonly string[]
  /** Les toiles dont elle porte un raccourci, hors corbeille : elles s'y montrent aussi, sans y être rangées. */
  raccourcis?: readonly string[]
}

export interface Rangement {
  /** La toile qui la range (son « dossier »), ou `null` : l'accueil, ou une toile venue d'ailleurs qu'on ne lit pas. */
  dossierDe(id: string): string | null
  /** À la corbeille : leur carte est jetée, ou elles sont dans une toile qui l'est. */
  cachees: ReadonlySet<string>
  /**
   * Les toiles qui la montrent aussi par un raccourci, hors celle qui la range : seulement parmi les toiles données (ce
   * qu'on lit), et ni elle ni elles à la corbeille. Vide pour une toile qu'aucun raccourci ne montre.
   */
  raccourcisVers(id: string): readonly string[]
}

export function rangerLesToiles(toiles: readonly ToileARanger[]): Rangement {
  const parents = new Map(toiles.map((t) => [t.id, t.parent]))
  const portees = new Map<string, string[]>()
  const jetees = new Set<string>()
  const montrees = new Map<string, string[]>()
  for (const t of toiles) {
    for (const cible of t.cartes ?? []) portees.set(cible, [...(portees.get(cible) ?? []), t.id])
    for (const cible of t.jetees ?? []) jetees.add(cible)
    for (const cible of t.raccourcis ?? []) if (cible !== t.id) montrees.set(cible, [...(montrees.get(cible) ?? []), t.id])
  }
  const dossierDe = (id: string) => {
    const parent = parents.get(id) ?? null
    const la = portees.get(id) ?? []
    return parent !== null && la.includes(parent) ? parent : (la[0] ?? parent)
  }
  const cachees = new Set(toiles.flatMap((t) => (jetees.has(t.id) && !portees.has(t.id) ? [t.id] : [])))
  for (let ajoute = cachees.size > 0; ajoute; ) {
    ajoute = false
    for (const t of toiles) {
      const d = dossierDe(t.id)
      if (!cachees.has(t.id) && d !== null && cachees.has(d)) ajoute = Boolean(cachees.add(t.id))
    }
  }
  const raccourcisVers = (id: string): readonly string[] => {
    const par = montrees.get(id)
    if (!par || !parents.has(id) || cachees.has(id)) return []
    const range = dossierDe(id)
    return [...new Set(par)].filter((t) => t !== range && !cachees.has(t))
  }
  return { dossierDe, cachees, raccourcisVers }
}
