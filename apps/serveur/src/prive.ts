import type * as Y from 'yjs'
import type { Base } from './base.ts'
import type { ElementLu, TableauLu } from './contenu.ts'

// L'accès général d'une toile, comme celui de Notion (« Seulement les personnes invitées » ou « Tout l'espace ») et
// de Drive (« Accès limité ») : une toile privée ne s'ouvre plus par le rôle dans l'espace, ni ce qu'elle contient.
// OpenFGA en tire les droits (`autorisation/modele.fga`, `prive`) ; ce module dit seulement où la marque est posée,
// et ce qu'une toile lisible montre encore d'une toile qui ne l'est pas : la carte qui y mène.

/** La relation qui rend une toile privée, pour tout le monde. */
export const relationPrivee = (tableau: string) => ({ objet: `tableau:${tableau}`, relation: 'prive', sujet: 'user:*' })

/**
 * La toile qui rend celle-ci privée : elle-même, ou la plus proche au-dessus ; `null` si rien ne la ferme à l'espace.
 * `jusqua` arrête la remontée avant cette toile (exclue).
 */
export function priveePar(base: Base, tableau: string, jusqua?: string): string | null {
  const vus = new Set<string>()
  for (let t: string | null = tableau; t !== null && t !== jusqua && !vus.has(t); t = base.tableau(t)?.parent ?? null) {
    vus.add(t)
    if (base.relationExiste(relationPrivee(t))) return t
  }
  return null
}

/** La toile vers laquelle mène cette carte (une carte de toile, ou son raccourci), ou `null` pour un autre élément. */
export function cibleDeCarte(e: Pick<ElementLu, 'contenu'>): string | null {
  return e.contenu.type === 'tableau' && typeof e.contenu.cible === 'string' ? e.contenu.cible : null
}

/**
 * Les cartes de ce tableau qui mènent à une toile que ce compte ne lit pas : elles ne doivent rien en montrer, ni sur
 * la toile, ni dans sa vignette, ni dans son activité. Le document Yjs ne se filtre pas par connexion (décision du
 * 26/10) : la carte y reste, c'est à qui la lit de la taire.
 */
export function cartesCachees(t: Pick<TableauLu, 'elements'>, lisible: (tableau: string) => boolean): Set<string> {
  const caches = new Set<string>()
  for (const e of t.elements) {
    const cible = cibleDeCarte(e)
    if (cible !== null && !lisible(cible)) caches.add(e.id)
  }
  return caches
}

/** Le tableau sans ces éléments, ni les lignes qui y sont accrochées. */
export function sansElements<T extends Pick<TableauLu, 'elements'>>(t: T, ids: ReadonlySet<string>): T {
  if (ids.size === 0) return t
  const accroche = (b: unknown) => !!b && typeof b === 'object' && 'element' in b && ids.has(String((b as { element: unknown }).element))
  return {
    ...t,
    elements: t.elements.filter((e) => !ids.has(e.id) && !(e.contenu.type === 'ligne' && (accroche(e.contenu.depart) || accroche(e.contenu.arrivee)))),
  }
}

/**
 * Les cartes de ces toiles dans ce document (pas leurs raccourcis, dont le titre est le leur) oublient le titre qu'une
 * carte d'avant gardait : une toile le tient dans son propre document, qui ne part qu'à qui la lit, et celui de la
 * toile qui porte sa carte part à tous ceux qui lisent celle-ci.
 */
export function oublierLeTitreDesCartes(doc: Y.Doc, toiles: ReadonlySet<string>): void {
  const elements = doc.getMap<Record<string, unknown>>('elements')
  const nommees = [...elements.entries()].flatMap(([id, brut]) => {
    const c = brut && typeof brut === 'object' ? (brut.contenu as Record<string, unknown> | undefined) : undefined
    return c?.type === 'tableau' && typeof c.cible === 'string' && toiles.has(c.cible) && !c.raccourci && 'titre' in c ? [{ id, brut, contenu: c }] : []
  })
  for (const { id, brut, contenu } of nommees) {
    const { titre: _titre, ...reste } = contenu
    elements.set(id, { ...brut, contenu: reste })
  }
}
