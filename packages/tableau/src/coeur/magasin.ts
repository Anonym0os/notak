import type { Text as YText, XmlFragment } from 'yjs'
import { Historique } from './historique'
import { type Id, type Operation, type Tableau, appliquer, surLeTableau } from './tableau'

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
  /**
   * Écrit sans que l'historique le voie jamais : la suite d'un geste déjà inscrit, qui ne doit pas devenir un
   * pas à part (un fichier qui finit d'arriver). Annuler le geste emporte aussi la correction.
   */
  corriger(pas: Operation[]): void
  /** Remplace le tableau sans passer par l'historique (premier plan, chargement). */
  remplacer(t: Tableau): void
  /**
   * Le texte d'un élément tel que plusieurs personnes l'écrivent ensemble (un fragment Yjs, créé au besoin).
   * Absent d'un magasin qui n'est pas partagé : l'éditeur écrit alors seul dans le contenu.
   */
  texte?(id: Id): XmlFragment
  /** Une ligne d'un élément écrite à plusieurs (le titre d'une liste de tâches), créée au besoin. Même absence. */
  ligne?(id: Id): YText
  annuler(): boolean
  retablir(): boolean
  /** Il y a un geste à annuler (ou à rétablir) : l'en-tête grise ses boutons sinon. Prévient `ecouter` quand cela change. */
  peutAnnuler(): boolean
  peutRetablir(): boolean
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
      // Inscrit avant de prévenir : ceux qui écoutent lisent déjà la pile à jour.
      historique.inscrire(pas)
      poser(pas.reduce(appliquer, tableau))
    },
    appliquerSeulement(pas) {
      if (pas.length > 0) poser(pas.reduce(appliquer, tableau))
    },
    inscrire(pas) {
      historique.inscrire(pas)
      for (const f of ecouteurs) f()
    },
    corriger(pas) {
      if (pas.length > 0) poser(pas.reduce(appliquer, tableau))
    },
    remplacer: poser,
    annuler() {
      const t = historique.annuler(tableau)
      if (t) poser(t)
      return t !== null
    },
    peutAnnuler: () => historique.peutAnnuler,
    peutRetablir: () => historique.peutRetablir,
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
    corriger() {},
    remplacer() {},
    annuler: () => false,
    retablir: () => false,
    peutAnnuler: () => false,
    peutRetablir: () => false,
  }
}

/**
 * Le même tableau, sans ce qui est à la corbeille : c'est ce que voit la toile. Les gestes passent tels quels ;
 * `remplacer` garde la corbeille, qu'il ne voit pas, sous le reste.
 */
export function sansCorbeille(m: Magasin): Magasin {
  let source: Tableau | null = null
  let vue: Tableau | null = null
  const lire = () => {
    const t = m.lire()
    if (t !== source) {
      source = t
      const elements = surLeTableau(t)
      vue = elements === t.elements ? t : { ...t, elements }
    }
    return vue!
  }
  return {
    ...m,
    lire,
    remplacer(t) {
      const visibles = new Set(lire().elements.map((e) => e.id))
      const caches = m.lire().elements.filter((e) => !visibles.has(e.id))
      m.remplacer({ ...t, elements: [...caches, ...t.elements] })
    },
  }
}
