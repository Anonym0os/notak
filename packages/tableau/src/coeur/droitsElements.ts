import type { Magasin } from './magasin'
import { type DroitsTableau, gesteSurElement, permis } from './reglesDroits'
import { type Id, type Operation, type Tableau, appliquer } from './tableau'

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
    faire: garder((p) => m.faire(p)),
    appliquerSeulement: garder((p) => m.appliquerSeulement(p)),
    inscrire: garder((p) => m.inscrire(p)),
    corriger: garder((p) => m.corriger(p)),
    remplacer() {},
  }
}
