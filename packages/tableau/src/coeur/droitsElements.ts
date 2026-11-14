import type { Magasin } from './magasin'
import { type DroitsTableau, carteIntacte, gesteSurElement, permis, toileDeLaCarte } from './reglesDroits'
import { type Element, type Id, type Operation, type Tableau, appliquer, inverse } from './tableau'

// Ce que la toile fait des règles de `reglesDroits.ts` : ne laisser passer que les gestes que le serveur acceptera.

export * from './reglesDroits'

/** Les éléments que touchent ces pas, et si le tableau lui-même est touché (étiquettes, fond). */
function touches(pas: readonly Operation[]): { ids: Set<Id>; tableau: boolean } {
  const ids = new Set<Id>()
  let tableau = false
  for (const op of pas) {
    if (op.type === 'creer' || op.type === 'supprimer') ids.add(op.element.id)
    else if (op.type === 'etiquettes' || op.type === 'fond') tableau = true
    else ids.add(op.id)
  }
  return { ids, tableau }
}

/** Ces pas sont-ils permis, d'après l'état `t` du tableau ? */
export function pasPermis(t: Tableau, pas: readonly Operation[], droits: DroitsTableau, auteur: string): boolean {
  const { ids, tableau } = touches(pas)
  if (tableau && !permis(droits, null, 'ecriture')) return false
  const apres = pas.reduce(appliquer, t)
  for (const id of ids) {
    const avant = t.elements.find((e) => e.id === id)
    const suite = apres.elements.find((e) => e.id === id)
    if (!permis(droits, id, gesteSurElement(avant, suite, auteur))) return false
  }
  return true
}

/** Une ligne accrochée à l'un de ces éléments, par son départ ou son arrivée. */
const accrochee = (e: Tableau['elements'][number], ids: ReadonlySet<Id>) => {
  if (e.contenu.type !== 'ligne') return false
  const bout = (b: unknown) => !!b && typeof b === 'object' && 'element' in b && ids.has(String((b as { element: unknown }).element))
  return bout(e.contenu.depart) || bout(e.contenu.arrivee)
}

/**
 * Le magasin sans ces éléments, ni les lignes qui y tiennent : les cartes des toiles que ce compte ne lit pas
 * (`DroitsTableau.caches`). Les gestes passent tels quels ; `remplacer` garde, sous le reste, ce qu'il ne voit pas.
 */
export function sansCaches(m: Magasin, ids: ReadonlySet<Id>): Magasin {
  let source: Tableau | null = null
  let vue: Tableau | null = null
  const lire = () => {
    const t = m.lire()
    if (t !== source) {
      source = t
      vue = { ...t, elements: t.elements.filter((e) => !ids.has(e.id) && !accrochee(e, ids)) }
    }
    return vue!
  }
  return {
    ...m,
    lire,
    remplacer(t) {
      const visibles = new Set(lire().elements.map((e) => e.id))
      m.remplacer({ ...t, elements: [...m.lire().elements.filter((e) => !visibles.has(e.id)), ...t.elements] })
    },
  }
}

/**
 * Le magasin tel que ce compte peut l'écrire : un geste n'y passe que s'il est permis en entier (le serveur refuserait
 * le reste, et l'annulerait chez tout le monde). `refus` est appelé quand un geste est écarté.
 */
export function filtrerMagasin(m: Magasin, droits: () => DroitsTableau, auteur: () => string, refus?: () => void): Magasin {
  const garder = (f: (pas: Operation[]) => void) => (pas: Operation[]) => {
    if (pasPermis(m.lire(), pas, droits(), auteur())) f(pas)
    else refus?.()
  }
  return {
    ...m,
    faire: (pas, hors) => garder((p) => m.faire(p, hors))(pas),
    appliquerSeulement: garder((p) => m.appliquerSeulement(p)),
    inscrire: garder((p) => m.inscrire(p)),
    corriger: garder((p) => m.corriger(p)),
    remplacer() {},
  }
}

/**
 * Les dossiers générés dont ce passage de `avant` à `apres` toucherait la carte autrement qu'en la déplaçant
 * (`carteIntacte`), pour les éléments `ids` ; vide : rien à refuser.
 */
function cartesTouchees(avant: readonly Element[], apres: readonly Element[], ids: Iterable<Id>, genere: (toile: Id) => boolean): Id[] {
  const [de, vers] = [new Map(avant.map((e) => [e.id, e])), new Map(apres.map((e) => [e.id, e]))]
  const touchees = new Set<Id>()
  for (const id of ids) {
    const [a, b] = [de.get(id), vers.get(id)]
    if (carteIntacte(a, b, genere)) continue
    for (const toile of [toileDeLaCarte(a), toileDeLaCarte(b)]) if (toile !== undefined && genere(toile)) touchees.add(toile)
  }
  return [...touchees]
}

/**
 * Le magasin d'une toile qui porte la carte de dossiers qu'un outil rattaché a générés (`DroitsTableau.generes`) : un
 * geste qui en jetterait, retirerait, changerait ou doublerait une n'y passe pas, en entier, comme le serveur
 * l'annulerait chez tout le monde ; sa place, elle, bouge. `refus` reçoit les dossiers en cause. Les gestes de la toile
 * qui emportent ailleurs (corbeille, autre toile, copie) laissent d'abord ces cartes de côté : ceci rattrape le reste.
 */
export function garderLesGeneres(m: Magasin, generes: () => Readonly<Record<Id, string>> | undefined, refus?: (dossiers: Id[]) => void): Magasin {
  const genere = (toile: Id) => generes()?.[toile] !== undefined
  /** Passe `pas` à `f` s'ils laissent ces cartes intactes, depuis l'état `depart` (celui d'avant les pas). */
  const garder = (f: (pas: Operation[]) => void, depart: (pas: Operation[]) => Tableau = () => m.lire()) => (pas: Operation[]) => {
    const t = depart(pas)
    const { ids } = touches(pas)
    const touchees = ids.size === 0 ? [] : cartesTouchees(t.elements, pas.reduce(appliquer, t).elements, ids, genere)
    if (touchees.length === 0) f(pas)
    else refus?.(touchees)
  }
  return {
    ...m,
    faire: (pas, hors) => garder((p) => m.faire(p, hors))(pas),
    appliquerSeulement: garder((p) => m.appliquerSeulement(p)),
    // Inscrire refait le geste depuis son début (`magasinYjs`) : c'est de là qu'il se juge, déjà appliqué ou non.
    inscrire: garder(
      (p) => m.inscrire(p),
      (pas) => pas.toReversed().map(inverse).reduce(appliquer, m.lire()),
    ),
    corriger: garder((p) => m.corriger(p)),
    remplacer(t) {
      const avant = m.lire().elements
      const ids = [...avant, ...t.elements].flatMap((e) => {
        const toile = toileDeLaCarte(e)
        return toile !== undefined && genere(toile) ? [e.id] : []
      })
      const touchees = cartesTouchees(avant, t.elements, ids, genere)
      if (touchees.length === 0) m.remplacer(t)
      else refus?.(touchees)
    },
  }
}
