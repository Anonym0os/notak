/**
 * Où est rangée chaque toile, et lesquelles sont à la corbeille : la règle de la bibliothèque, la même sur un serveur
 * (`GET /api/bibliotheque`) et dans l'app (`apps/web/src/local/bibliotheque.ts`). Une toile est dans celle qui porte sa
 * carte, où qu'on l'ait glissée ; son parent déclaré (la base, l'index) ne compte que s'il porte cette carte, ou si
 * aucune toile lue ne la porte. Sa carte jetée, elle est à la corbeille, et tout ce qu'elle contient avec elle.
 */

/** Ce qu'on sait d'une toile pour la ranger : son parent déclaré, et ce que dit son résumé (`resumesDuTableau`). */
export interface ToileARanger {
  id: string
  parent: string | null
  /** Les toiles dont elle porte la carte (pas un raccourci). */
  cartes?: readonly string[]
  /** Les toiles dont elle a jeté la carte à sa corbeille. */
  jetees?: readonly string[]
}

export interface Rangement {
  /** La toile qui la range (son « dossier »), ou `null` : l'accueil, ou une toile venue d'ailleurs qu'on ne lit pas. */
  dossierDe(id: string): string | null
  /** À la corbeille : leur carte est jetée, ou elles sont dans une toile qui l'est. */
  cachees: ReadonlySet<string>
}

export function rangerLesToiles(toiles: readonly ToileARanger[]): Rangement {
  const parents = new Map(toiles.map((t) => [t.id, t.parent]))
  const portees = new Map<string, string[]>()
  const jetees = new Set<string>()
  for (const t of toiles) {
    for (const cible of t.cartes ?? []) portees.set(cible, [...(portees.get(cible) ?? []), t.id])
    for (const cible of t.jetees ?? []) jetees.add(cible)
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
  return { dossierDe, cachees }
}
