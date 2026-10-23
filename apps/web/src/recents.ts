import type { Id, ModifiePar } from '@notak/tableau'
import type { EvenementActivite } from './api'

/** Combien de temps un élément reste mis en valeur après le geste d'un autre. */
export const DUREE_MISE_EN_VALEUR = 20_000

type Carte = ReadonlyMap<Id, ModifiePar & { jusqua: number }>

/** Les gestes qui laissent un élément à voir : jeté, il n'est plus là. */
const VISIBLES = new Set<EvenementActivite['genre']>(['cree', 'modifie', 'deplace', 'restaure', 'commente'])

/**
 * La carte après ces gestes : ceux des autres y entrent (le plus récent d'un élément l'emporte), ceux de `moi`
 * n'y entrent pas, et ce qui a trop duré en sort. Rend la même carte si rien ne change.
 */
export function apresGestes(carte: Carte, evenements: readonly EvenementActivite[], moi: string, maintenant: number): Carte {
  let suivante: Map<Id, ModifiePar & { jusqua: number }> | null = null
  const modifiable = () => (suivante ??= new Map(carte))
  for (const [id, e] of carte) if (e.jusqua <= maintenant) modifiable().delete(id)
  // Du plus ancien au plus récent : le dernier mot est au dernier geste.
  for (const e of [...evenements].reverse()) {
    if (e.auteur.id === moi || !e.element || !VISIBLES.has(e.genre)) continue
    modifiable().set(e.element, { couleur: e.auteur.couleur, nom: e.auteur.nom, jusqua: maintenant + DUREE_MISE_EN_VALEUR })
  }
  return suivante ?? carte
}

/**
 * Ce que le web sait des gestes récents des autres sur le tableau ouvert. `Activite` l'alimente ; la toile le lit
 * par `Services.recemmentModifies`.
 */
export function creerRecents(maintenant: () => number = Date.now) {
  let tableau: string | null = null
  let carte: Carte = new Map()
  let vue: ReadonlyMap<Id, ModifiePar> = carte
  let minuteur: ReturnType<typeof setTimeout> | null = null
  const ecouteurs = new Set<() => void>()

  const publier = () => {
    // La toile ne lit pas `jusqua` : on lui rend les mêmes objets, la même carte tant que rien ne change.
    vue = carte
    for (const f of ecouteurs) f()
  }
  const programmer = () => {
    if (minuteur) clearTimeout(minuteur)
    minuteur = null
    if (carte.size === 0) return
    const prochaine = Math.min(...[...carte.values()].map((e) => e.jusqua))
    minuteur = setTimeout(() => {
      const apres = apresGestes(carte, [], '', maintenant())
      if (apres !== carte) {
        carte = apres
        publier()
      }
      programmer()
    }, Math.max(50, prochaine - maintenant()))
  }

  return {
    /** Les gestes arrivés sur `tableau` depuis la dernière lecture ; un autre tableau repart de zéro. */
    noter(sur: string, evenements: readonly EvenementActivite[], moi: string) {
      const change = sur !== tableau
      tableau = sur
      const base: Carte = change ? new Map() : carte
      const apres = apresGestes(base, evenements, moi, maintenant())
      if (apres === carte) return
      carte = apres
      publier()
      programmer()
    },
    lire: (): ReadonlyMap<Id, ModifiePar> => vue,
    ecouter(f: () => void) {
      ecouteurs.add(f)
      return () => ecouteurs.delete(f)
    },
  }
}
