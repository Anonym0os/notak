import { type Arbre, type Id, type Limite, type Relation, type Resume, type Sujet, nouvelId } from '../../../coeur/tableau'
import { type Lecture, branche, changerSujet, enfantsDe, lire } from './sujets'

/**
 * Ce qui se pose sur une carte en plus des sujets (docs/XMIND.md § 1 et § 3) : relations, limites, résumés, et ce
 * qu'un sujet porte. Fonctions pures `(Arbre) → Arbre`.
 */

const sans = <T>(dico: Record<Id, T> | undefined, id: Id): Record<Id, T> | undefined => {
  if (!dico || !(id in dico)) return dico
  const { [id]: _, ...reste } = dico
  return Object.keys(reste).length > 0 ? reste : undefined
}

const avecChamp = <K extends 'relations' | 'limites' | 'resumes'>(a: Arbre, champ: K, valeur: Arbre[K]): Arbre => {
  const { [champ]: _, ...reste } = a
  return valeur && Object.keys(valeur).length > 0 ? ({ ...reste, [champ]: valeur } as unknown as Arbre) : (reste as unknown as Arbre)
}

// — Relations —

export function ajouterRelation(a: Arbre, de: Id, vers: Id): [Arbre, Id | null] {
  if (de === vers || !a.sujets[de] || !a.sujets[vers]) return [a, null]
  const id = nouvelId()
  return [avecChamp(a, 'relations', { ...a.relations, [id]: { de, vers } }), id]
}

export function changerRelation(a: Arbre, id: Id, f: (r: Relation) => Relation): Arbre {
  const r = a.relations?.[id]
  return r ? avecChamp(a, 'relations', { ...a.relations, [id]: f(r) }) : a
}

// — Limites et résumés : sur une plage de frères —

/** Les sujets choisis vus comme une plage de frères : le premier et le dernier, dans l'ordre. `null` s'ils ne sont pas frères. */
export function plage(l: Lecture, ids: readonly Id[]): { de: Id; a?: Id } | null {
  const valides = ids.filter((x) => l.sujets.has(x) && x !== l.central)
  if (valides.length === 0) return null
  const parent = l.sujets.get(valides[0]!)!.parent
  if (valides.some((x) => l.sujets.get(x)!.parent !== parent || l.sujets.get(x)!.genre)) return valides.length === 1 ? { de: valides[0]! } : null
  const freres = enfantsDe(l, parent!)
  const rangs = valides.map((x) => freres.indexOf(x)).sort((x, y) => x - y)
  return rangs[0] === rangs.at(-1) ? { de: freres[rangs[0]!]! } : { de: freres[rangs[0]!]!, a: freres[rangs.at(-1)!]! }
}

/** Les sujets d'une plage (chaque frère de `de` à `a`), avec leurs branches. */
export function sujetsDePlage(l: Lecture, p: { de: Id; a?: Id }): Id[] {
  const s = l.sujets.get(p.de)
  if (!s) return []
  if (!p.a || s.parent === undefined) return branche(l, p.de)
  const freres = enfantsDe(l, s.parent)
  const [i, j] = [freres.indexOf(p.de), freres.indexOf(p.a)]
  if (i < 0 || j < 0) return branche(l, p.de)
  return freres.slice(Math.min(i, j), Math.max(i, j) + 1).flatMap((x) => branche(l, x))
}

export function ajouterLimite(a: Arbre, ids: readonly Id[]): [Arbre, Id | null] {
  const p = plage(lire(a), ids)
  if (!p) return [a, null]
  const id = nouvelId()
  return [avecChamp(a, 'limites', { ...a.limites, [id]: p satisfies Limite }), id]
}

export function changerLimite(a: Arbre, id: Id, f: (x: Limite) => Limite): Arbre {
  const x = a.limites?.[id]
  return x ? avecChamp(a, 'limites', { ...a.limites, [id]: f(x) }) : a
}

/** Un résumé de ces frères : une accolade, et un sujet de résumé qu'on édite aussitôt. */
export function ajouterResume(a: Arbre, ids: readonly Id[], titre: string): [Arbre, Id | null] {
  const l = lire(a)
  const p = plage(l, ids)
  const parent = p ? l.sujets.get(p.de)?.parent : undefined
  if (!p || parent === undefined) return [a, null]
  const sujet = nouvelId()
  const id = nouvelId()
  const sujets = { ...a.sujets, [sujet]: { parent, genre: 'resume', ordre: 'V', titre } satisfies Sujet }
  return [avecChamp({ ...a, sujets }, 'resumes', { ...a.resumes, [id]: { ...p, sujet } satisfies Resume }), sujet]
}

/** Retire une relation, une limite ou un résumé (avec son sujet de résumé et ce qui en descend). */
export function retirer(a: Arbre, id: Id): Arbre {
  if (a.relations?.[id]) return avecChamp(a, 'relations', sans(a.relations, id))
  if (a.limites?.[id]) return avecChamp(a, 'limites', sans(a.limites, id))
  const r = a.resumes?.[id]
  if (!r) return a
  const sujets = { ...a.sujets }
  delete sujets[r.sujet]
  for (const [x, s] of Object.entries(sujets)) if (s.parent === r.sujet) delete sujets[x]
  return avecChamp({ ...a, sujets }, 'resumes', sans(a.resumes, id))
}

/**
 * Ce qui tient encore debout : une relation dont un bout manque, une limite ou un résumé dont la plage a disparu, ne
 * se dessinent pas (un autre a pu effacer le sujet entre-temps). Le document n'est pas réécrit.
 */
export function relationsValides(a: Arbre, l: Lecture): [Id, Relation][] {
  return Object.entries(a.relations ?? {}).filter(([, r]) => r && l.sujets.has(r.de) && l.sujets.has(r.vers))
}
export function limitesValides(a: Arbre, l: Lecture): [Id, Limite][] {
  return Object.entries(a.limites ?? {}).filter(([, x]) => x && l.sujets.has(x.de) && (!x.a || l.sujets.has(x.a)))
}
export function resumesValides(a: Arbre, l: Lecture): [Id, Resume][] {
  return Object.entries(a.resumes ?? {}).filter(([, x]) => x && l.sujets.has(x.de) && (!x.a || l.sujets.has(x.a)) && a.sujets[x.sujet]?.genre === 'resume')
}

/** Le résumé dont ce sujet est le sujet de résumé. */
export const resumeDe = (a: Arbre, sujet: Id): Id | undefined => Object.entries(a.resumes ?? {}).find(([, r]) => r.sujet === sujet)?.[0]

// — Ce qu'un sujet porte —

/** Les groupes de marqueurs : un sujet n'en porte qu'un par groupe. */
export const groupeDuMarqueur = (m: string): string => {
  if (m.startsWith('task-')) return 'task'
  return m.split('-')[0]!
}

/** Pose ce marqueur, ou l'ôte s'il y est ; il remplace celui de son groupe. */
export function basculerMarqueur(a: Arbre, ids: readonly Id[], m: string): Arbre {
  const tous = ids.every((id) => a.sujets[id]?.marqueurs?.includes(m))
  let sortie = a
  for (const id of ids)
    sortie = changerSujet(sortie, id, ({ marqueurs, ...s }) => {
      const autres = (marqueurs ?? []).filter((x) => groupeDuMarqueur(x) !== groupeDuMarqueur(m))
      const liste = tous ? autres : [...autres, m]
      return liste.length > 0 ? { ...s, marqueurs: liste } : s
    })
  return sortie
}

type Portable = 'etiquettes' | 'lien' | 'note' | 'image' | 'tache' | 'numerotation' | 'classe'

/** Pose (ou retire, avec `undefined` ou une liste vide) ce que portent ces sujets. */
export function porter<K extends Portable>(a: Arbre, ids: readonly Id[], champ: K, valeur: Sujet[K] | undefined): Arbre {
  let sortie = a
  const vide = valeur === undefined || (Array.isArray(valeur) && valeur.length === 0)
  for (const id of ids) sortie = changerSujet(sortie, id, ({ [champ]: _, ...s }) => (vide ? s : { ...s, [champ]: valeur }) as Sujet)
  return sortie
}

/** Le préfixe de numérotation d'un sujet, s'il en a un : d'après le motif de son parent (`1.`, `IV.`, `b.`). */
export function numeroDe(l: Lecture, id: Id): string | null {
  const s = l.sujets.get(id)
  if (!s || s.parent === undefined || s.genre) return null
  const p = l.sujets.get(s.parent)
  const motif = p?.numerotation
  if (!motif) return null
  const rang = enfantsDe(l, s.parent).indexOf(id) + 1
  const propre = ecrire(rang, motif.motif)
  if (!motif.paliers) return propre
  const dessus = numeroDe(l, s.parent)
  return dessus ? `${dessus}.${propre}` : propre
}

function ecrire(n: number, motif: NonNullable<Sujet['numerotation']>['motif']): string {
  switch (motif) {
    case 'arabe':
      return String(n)
    case 'romain':
      return romain(n)
    case 'majuscule':
      return lettres(n)
    case 'minuscule':
      return lettres(n).toLowerCase()
  }
}

function lettres(n: number): string {
  let s = ''
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s
  return s
}

function romain(n: number): string {
  const t: [number, string][] = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]
  let s = ''
  for (const [v, l] of t) while (n >= v) ((s += l), (n -= v))
  return s
}
