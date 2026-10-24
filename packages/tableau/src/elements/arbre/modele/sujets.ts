import { cleEntre, comparerOrdre } from '../../../coeur/ordre'
import { type Arbre, type Id, type StructureArbre, type Sujet, nouvelId } from '../../../coeur/tableau'

/**
 * Une carte mentale se stocke à plat (un dictionnaire de sujets, chacun pointe son parent) : c'est ce qui laisse
 * deux personnes écrire dans deux sujets à la fois. Ce module la lit comme un arbre et fait les gestes de
 * docs/XMIND.md § 4, en fonctions pures `(Arbre) → Arbre`.
 */

/** La carte lue comme un arbre : le central, les enfants rangés de chaque sujet, les flottants. */
export interface Lecture {
  central: Id
  sujets: ReadonlyMap<Id, Sujet>
  /** Les enfants attachés de chaque sujet, dans l'ordre (sans flottants ni résumés). */
  enfants: ReadonlyMap<Id, readonly Id[]>
  flottants: readonly Id[]
}

const estSujet = (s: unknown): s is Sujet => {
  if (typeof s !== 'object' || s === null) return false
  const v = s as Record<string, unknown>
  return typeof v.titre === 'string' && typeof v.ordre === 'string' && (v.parent === undefined || typeof v.parent === 'string')
}

const AUCUN: readonly Id[] = []
const caches = new WeakMap<Arbre['sujets'], Lecture>()

/**
 * La carte en arbre. Ce qu'un autre a pu écrire de travers est écarté : un sujet mal formé, ou dont le parent manque
 * (avec ses descendants). S'il n'y a pas de central, le premier sujet sans parent l'est. Le résultat est gardé
 * tant que le dictionnaire de sujets est le même objet.
 */
export function lire(a: Arbre): Lecture {
  const deja = caches.get(a.sujets)
  if (deja) return deja
  const sujets = new Map<Id, Sujet>()
  for (const [id, s] of Object.entries(a.sujets)) if (estSujet(s)) sujets.set(id, s)
  const racines = [...sujets].filter(([, s]) => s.parent === undefined).sort(([x, a1], [y, b1]) => comparerOrdre(a1.ordre, b1.ordre) || comparerOrdre(x, y))
  const central = racines[0]?.[0] ?? ''
  const brut = new Map<Id, Id[]>()
  const flottants: Id[] = []
  for (const [id, s] of sujets) {
    if (s.parent === undefined) continue
    if (s.genre === 'detache') {
      if (s.parent === central) flottants.push(id)
      continue
    }
    if (s.genre === 'resume') continue
    const l = brut.get(s.parent)
    if (l) l.push(id)
    else brut.set(s.parent, [id])
  }
  const parOrdre = (x: Id, y: Id) => comparerOrdre(sujets.get(x)!.ordre, sujets.get(y)!.ordre) || comparerOrdre(x, y)
  // Ne garde que ce qui descend du central ou d'un flottant : un sujet orphelin (parent effacé ailleurs) disparaît.
  const enfants = new Map<Id, readonly Id[]>()
  const atteints = new Set<Id>()
  const parcourir = (id: Id) => {
    if (atteints.has(id)) return
    atteints.add(id)
    const l = brut.get(id)
    if (!l) return
    l.sort(parOrdre)
    enfants.set(id, l)
    for (const e of l) parcourir(e)
  }
  if (central) parcourir(central)
  flottants.sort(parOrdre)
  for (const f of flottants) parcourir(f)
  for (const id of [...sujets.keys()]) if (!atteints.has(id) && sujets.get(id)!.genre !== 'resume') sujets.delete(id)
  const lecture: Lecture = { central, sujets, enfants, flottants }
  caches.set(a.sujets, lecture)
  return lecture
}

export const enfantsDe = (l: Lecture, id: Id): readonly Id[] => l.enfants.get(id) ?? AUCUN

/** Combien de crans sous le central (le central : 0, un principal : 1) ; un flottant compte comme un principal. */
export function profondeur(l: Lecture, id: Id): number {
  let n = 0
  for (let s = l.sujets.get(id); s?.parent !== undefined; s = l.sujets.get(s.parent)) {
    if (s.genre === 'detache') return n + 1
    n++
  }
  return n
}

/** Le sujet et tous ses descendants (attachés), lui en premier. */
export function branche(l: Lecture, id: Id): Id[] {
  const sortie: Id[] = []
  const pile = [id]
  while (pile.length) {
    const x = pile.pop()!
    sortie.push(x)
    pile.push(...enfantsDe(l, x).toReversed())
  }
  return sortie
}

/** Ses descendants sont cachés : lui ou un ancêtre est replié. */
export function cache(l: Lecture, id: Id): boolean {
  for (let p = l.sujets.get(id)?.parent; p !== undefined; p = l.sujets.get(p)?.parent) if (l.sujets.get(p)?.replie) return true
  return false
}

/** La structure qui dispose les enfants de ce sujet : la sienne, ou celle du premier ancêtre qui en a une. */
export function structureDe(l: Lecture, id: Id): StructureArbre {
  for (let s = l.sujets.get(id); s; s = s.parent !== undefined ? l.sujets.get(s.parent) : undefined) if (s.structure) return s.structure
  return 'carte'
}

const avec = (a: Arbre, changes: Record<Id, Sujet | undefined>): Arbre => {
  const sujets = { ...a.sujets }
  for (const [id, s] of Object.entries(changes)) {
    if (s === undefined) delete sujets[id]
    else sujets[id] = s
  }
  return { ...a, sujets }
}

/** Une carte neuve : un central seul. */
export function nouvelArbre(titreCentral: string): Arbre {
  return { type: 'arbre', sujets: { [nouvelId()]: { ordre: 'V', titre: titreCentral, structure: 'carte' } } }
}

/** La clé de rang qui place un sujet en `index` parmi ces frères (ordonnés). */
function ordreA(l: Lecture, freres: readonly Id[], index: number): string {
  const ordre = (i: number) => (i >= 0 && i < freres.length ? l.sujets.get(freres[i]!)!.ordre : undefined)
  return cleEntre(ordre(index - 1), ordre(index))
}

/** Un enfant de `parent`, en dernier (ou en `index`). Rend la carte et l'id du sujet neuf. */
export function ajouterEnfant(a: Arbre, parent: Id, titre: string, index?: number): [Arbre, Id] {
  const l = lire(a)
  const freres = enfantsDe(l, parent)
  const id = nouvelId()
  return [avec(a, { [id]: { parent, ordre: ordreA(l, freres, index ?? freres.length), titre } }), id]
}

/** Un frère juste après `id` (ou avant). Sur le central, qui n'a pas de frère, c'est un enfant (comme Xmind). */
export function ajouterFrere(a: Arbre, id: Id, titre: string, avant = false): [Arbre, Id] {
  const l = lire(a)
  const s = l.sujets.get(id)
  if (!s || s.parent === undefined || s.genre === 'detache') return ajouterEnfant(a, id, titre)
  const freres = enfantsDe(l, s.parent)
  const i = freres.indexOf(id)
  return ajouterEnfant(a, s.parent, titre, avant ? i : i + 1)
}

/** Un parent intercalé entre `id` et son parent, à sa place. Rien sur le central ni sur un flottant. */
export function ajouterParent(a: Arbre, id: Id, titre: string): [Arbre, Id | null] {
  const l = lire(a)
  const s = l.sujets.get(id)
  if (!s || s.parent === undefined || s.genre === 'detache') return [a, null]
  const neuf = nouvelId()
  return [avec(a, { [neuf]: { parent: s.parent, ordre: s.ordre, titre }, [id]: { ...s, parent: neuf, ordre: 'V' } }), neuf]
}

/** Un sujet flottant, posé à `position` (px depuis le centre du central). */
export function ajouterFlottant(a: Arbre, position: { x: number; y: number }, titre: string): [Arbre, Id] {
  const l = lire(a)
  const id = nouvelId()
  return [avec(a, { [id]: { parent: l.central, genre: 'detache', position, ordre: ordreA(l, l.flottants, l.flottants.length), titre } }), id]
}

/** Retire ces sujets et leurs descendants. Le central reste. */
export function supprimerBranches(a: Arbre, ids: Iterable<Id>): Arbre {
  const l = lire(a)
  const partis: Record<Id, undefined> = {}
  for (const id of ids) if (id !== l.central && l.sujets.has(id)) for (const x of branche(l, id)) partis[x] = undefined
  return avec(a, partis)
}

/** Retire ce sujet seul : ses enfants prennent sa place, dans l'ordre. Le central reste. */
export function supprimerSeul(a: Arbre, id: Id): Arbre {
  const l = lire(a)
  const s = l.sujets.get(id)
  if (!s || s.parent === undefined) return a
  const freres = enfantsDe(l, s.parent)
  const i = freres.indexOf(id)
  const suivant = freres[i + 1] !== undefined ? l.sujets.get(freres[i + 1]!)!.ordre : undefined
  const changes: Record<Id, Sujet | undefined> = { [id]: undefined }
  let bas = freres[i - 1] !== undefined ? l.sujets.get(freres[i - 1]!)!.ordre : undefined
  for (const e of enfantsDe(l, id)) {
    bas = cleEntre(bas, suivant)
    changes[e] = { ...l.sujets.get(e)!, parent: s.parent, ordre: bas }
  }
  if (s.genre === 'detache') for (const e of enfantsDe(l, id)) changes[e] = { ...changes[e]!, genre: 'detache', position: s.position ?? { x: 0, y: 0 } }
  return avec(a, changes)
}

/** Change ce qu'on dit d'un sujet (titre, repli, structure…). */
export function changerSujet(a: Arbre, id: Id, f: (s: Sujet) => Sujet): Arbre {
  const s = a.sujets[id]
  return s && estSujet(s) ? avec(a, { [id]: f(s) }) : a
}

export const renommer = (a: Arbre, id: Id, titre: string) => changerSujet(a, id, (s) => ({ ...s, titre }))

/** Replie ou déplie un sujet ; sans enfant, rien. */
export function basculerRepli(a: Arbre, id: Id): Arbre {
  const l = lire(a)
  if (enfantsDe(l, id).length === 0) return a
  return changerSujet(a, id, ({ replie, ...s }) => (replie ? s : { ...s, replie: true }))
}

/** Tout replier (les principaux) ou tout déplier. */
export function toutReplier(a: Arbre, replier: boolean): Arbre {
  const l = lire(a)
  const changes: Record<Id, Sujet> = {}
  for (const [id, s] of l.sujets) {
    const veut = replier && id !== l.central && enfantsDe(l, id).length > 0 && profondeur(l, id) === 1
    if (!!s.replie === veut) continue
    const { replie: _r, ...reste } = s
    changes[id] = veut ? { ...reste, replie: true } : reste
  }
  return avec(a, changes)
}

/** Déplie jusqu'au niveau `n` (1 : les principaux seuls visibles), replie au-delà. */
export function deplierJusquA(a: Arbre, n: number): Arbre {
  const l = lire(a)
  const changes: Record<Id, Sujet> = {}
  for (const [id, s] of l.sujets) {
    const veut = enfantsDe(l, id).length > 0 && profondeur(l, id) >= n
    if (!!s.replie === veut) continue
    const { replie: _r, ...reste } = s
    changes[id] = veut ? { ...reste, replie: true } : reste
  }
  return avec(a, changes)
}

/** `id` descend de `ancetre` (ou l'est). */
export function descendDe(l: Lecture, id: Id, ancetre: Id): boolean {
  for (let x: Id | undefined = id; x !== undefined; x = l.sujets.get(x)?.parent) if (x === ancetre) return true
  return false
}

/** Rattache `id` à `parent`, en `index` parmi ses enfants. Refusé si `parent` descend de `id`. */
export function rattacher(a: Arbre, id: Id, parent: Id, index: number): Arbre {
  const l = lire(a)
  const s = l.sujets.get(id)
  if (!s || id === l.central || descendDe(l, parent, id)) return a
  const freres = enfantsDe(l, parent).filter((x) => x !== id)
  const { genre: _g, position: _p, ...reste } = s
  return avec(a, { [id]: { ...reste, parent, ordre: ordreA(l, freres, Math.max(0, Math.min(index, freres.length))) } })
}

/** Détache `id` en sujet flottant, posé à `position`. */
export function detacher(a: Arbre, id: Id, position: { x: number; y: number }): Arbre {
  const l = lire(a)
  const s = l.sujets.get(id)
  if (!s || id === l.central) return a
  return avec(a, { [id]: { ...s, parent: l.central, genre: 'detache', position, ordre: ordreA(l, l.flottants, l.flottants.length) } })
}

/** Échange `id` avec le frère d'avant (`-1`) ou d'après (`1`). */
export function echanger(a: Arbre, id: Id, sens: -1 | 1): Arbre {
  const l = lire(a)
  const s = l.sujets.get(id)
  if (!s || s.parent === undefined || s.genre === 'detache') return a
  const freres = enfantsDe(l, s.parent)
  const j = freres.indexOf(id) + sens
  if (j < 0 || j >= freres.length) return a
  const autre = l.sujets.get(freres[j]!)!
  return avec(a, { [id]: { ...s, ordre: autre.ordre }, [freres[j]!]: { ...autre, ordre: s.ordre } })
}

/** Une copie de la branche de `id`, juste après elle. Rend la carte et l'id de la copie. */
export function dupliquer(a: Arbre, id: Id): [Arbre, Id | null] {
  const l = lire(a)
  const s = l.sujets.get(id)
  if (!s || s.parent === undefined) return [a, null]
  const ids = new Map(branche(l, id).map((x) => [x, nouvelId()]))
  const changes: Record<Id, Sujet> = {}
  for (const [ancien, neuf] of ids) {
    const v = l.sujets.get(ancien)!
    changes[neuf] = { ...v, ...(v.parent !== undefined && ids.has(v.parent) ? { parent: ids.get(v.parent)! } : {}) }
  }
  const copie = ids.get(id)!
  if (s.genre === 'detache') changes[copie] = { ...changes[copie]!, position: { x: (s.position?.x ?? 0) + 24, y: (s.position?.y ?? 0) + 24 }, ordre: ordreA(l, l.flottants, l.flottants.length) }
  else {
    const freres = enfantsDe(l, s.parent)
    changes[copie] = { ...changes[copie]!, ordre: ordreA(l, freres, freres.indexOf(id) + 1) }
  }
  return [avec(a, changes), copie]
}
