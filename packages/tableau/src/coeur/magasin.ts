import { Historique } from './historique'
import { type Operation, type Tableau, appliquer } from './tableau'

/**
 * Le tableau et son historique, derrière une petite interface qu'écoute l'interface.
 * Demain, la même interface sera servie par un document Yjs partagé.
 */
export interface Magasin {
  lire(): Tableau
  ecouter(f: () => void): () => void
  /** Applique un geste et l'inscrit dans l'historique. */
  faire(pas: Operation[]): void
  /** Applique sans rien inscrire : un glisser en cours, inscrit à la fin par `inscrire`. */
  appliquerSeulement(pas: Operation[]): void
  inscrire(pas: Operation[]): void
  /** Remplace le tableau sans passer par l'historique (premier plan, chargement). */
  remplacer(t: Tableau): void
  annuler(): boolean
  retablir(): boolean
}

export function creerMagasin(initial: Tableau): Magasin {
  let tableau = initial
  const historique = new Historique()
  const ecouteurs = new Set<() => void>()
  const poser = (t: Tableau) => {
    tableau = t
    for (const f of ecouteurs) f()
  }

  return {
    lire: () => tableau,
    ecouter(f) {
      ecouteurs.add(f)
      return () => ecouteurs.delete(f)
    },
    faire(pas) {
      if (pas.length === 0) return
      poser(pas.reduce(appliquer, tableau))
      historique.inscrire(pas)
    },
    appliquerSeulement(pas) {
      if (pas.length > 0) poser(pas.reduce(appliquer, tableau))
    },
    inscrire: (pas) => historique.inscrire(pas),
    remplacer: poser,
    annuler() {
      const t = historique.annuler(tableau)
      if (t) poser(t)
      return t !== null
    },
    retablir() {
      const t = historique.retablir(tableau)
      if (t) poser(t)
      return t !== null
    },
  }
}

/** Le même tableau, qu'on ne peut que regarder : tout geste est ignoré. */
export function enLectureSeule(m: Magasin): Magasin {
  return {
    lire: m.lire,
    ecouter: m.ecouter,
    faire() {},
    appliquerSeulement() {},
    inscrire() {},
    remplacer() {},
    annuler: () => false,
    retablir: () => false,
  }
}
