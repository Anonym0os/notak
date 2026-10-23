import type { Id } from '../../coeur/tableau'

/**
 * Les colonnes repliées que la recherche ouvre le temps qu'elle dure : un de leurs éléments correspond. L'état de
 * repli enregistré n'est pas touché ; ce n'est qu'un affichage.
 */
let ouvertes: ReadonlySet<Id> = new Set()
const ecouteurs = new Set<() => void>()

export function ouvrirPourRecherche(ids: Iterable<Id>) {
  const neuves = new Set(ids)
  if (neuves.size === ouvertes.size && [...neuves].every((id) => ouvertes.has(id))) return
  ouvertes = neuves
  for (const f of ecouteurs) f()
}

export const ecouterRecherche = (f: () => void) => {
  ecouteurs.add(f)
  return () => void ecouteurs.delete(f)
}
export const ouverteParRecherche = (id: Id) => ouvertes.has(id)
