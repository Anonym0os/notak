import { type Commentaire, type Id, type NoeudTexte } from '../../coeur/tableau'

/**
 * Les fils posés sur des passages d'une note. Le passage est une marque Tiptap (`commentaireTexte`, attribut `fil`),
 * le fil vit dans le champ facultatif `fils` de la note : le texte reste partagé, les messages se rangent à côté.
 */

export const MARQUE_FIL = 'commentaireTexte'

export type Fils = Record<Id, Commentaire>

/** Les fils que le texte désigne, dans l'ordre où l'on rencontre leurs passages ; chacun une seule fois. */
export function filsDuTexte(n: NoeudTexte): Id[] {
  const vus = new Set<Id>()
  const parcourir = (x: NoeudTexte) => {
    for (const m of x.marks ?? []) if (m.type === MARQUE_FIL && typeof m.attrs?.fil === 'string') vus.add(m.attrs.fil)
    // Un bloc sans texte (image, séparateur…) porte son fil lui-même (voir `blocs/commentaires.ts`).
    if (typeof x.attrs?.fil === 'string') vus.add(x.attrs.fil)
    x.content?.forEach(parcourir)
  }
  parcourir(n)
  return [...vus]
}

/** Les fils dont le passage est encore dans le texte ; `undefined` s'il n'en reste aucun. */
export function filsVivants(fils: Fils | undefined, texte: NoeudTexte): Fils | undefined {
  if (!fils) return undefined
  const dedans = new Set(filsDuTexte(texte))
  const gardes = Object.entries(fils).filter(([id]) => dedans.has(id))
  if (gardes.length === 0) return undefined
  return gardes.length === Object.keys(fils).length ? fils : Object.fromEntries(gardes)
}

/** Ce fil, remplacé (ou posé) ; un fil sans message reste : le passage vient d'être marqué et attend son premier mot. */
export const avecFil = (fils: Fils | undefined, id: Id, fil: Commentaire): Fils => ({ ...fils, [id]: fil })

/**
 * Le texte tel qu'on le lit hors édition : un passage dont le fil n'a aucun message (on a marqué sans rien écrire)
 * perd sa marque. Rend le même objet si rien ne change.
 */
export function sansPassagesMuets(texte: NoeudTexte, fils: Fils | undefined): NoeudTexte {
  const muet = (id: unknown) => typeof id === 'string' && !(fils?.[id]?.messages.length ?? 0)
  const nettoyer = (x: NoeudTexte): NoeudTexte => {
    const marks = x.marks?.filter((m) => !(m.type === MARQUE_FIL && muet(m.attrs?.fil)))
    const content = x.content?.map(nettoyer)
    const marksChange = marks && x.marks && marks.length !== x.marks.length
    const contentChange = content && x.content && content.some((c, i) => c !== x.content![i])
    if (!marksChange && !contentChange) return x
    const { marks: _m, ...reste } = x
    return { ...reste, ...(content ? { content } : {}), ...(marks && marks.length > 0 ? { marks } : {}) }
  }
  return nettoyer(texte)
}

/**
 * Où poser des fiches en marge : chacune voudrait être à la hauteur de son passage (`voulues`), mais elles
 * ne se chevauchent pas, avec `ecart` entre deux. Les fiches sont données dans l'ordre du texte.
 */
export function placerEnMarge(voulues: readonly number[], hauteurs: readonly number[], ecart = 8): number[] {
  const places: number[] = []
  let bas = Number.NEGATIVE_INFINITY
  voulues.forEach((v, i) => {
    const haut = Math.max(v, bas)
    places.push(haut)
    bas = haut + (hauteurs[i] ?? 0) + ecart
  })
  return places
}
