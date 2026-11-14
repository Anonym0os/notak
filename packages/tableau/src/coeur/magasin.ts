import type { Text as YText, XmlFragment } from 'yjs'
import { Historique, type HorsDocument } from './historique'
import { type Id, type Operation, type Tableau, type Trace, appliquer, surLeTableau } from './tableau'

export type { HorsDocument } from './historique'

/**
 * Le tableau et son historique, derrière une petite interface qu'écoute l'interface.
 * Demain, la même interface sera servie par un document Yjs partagé.
 */
export interface Magasin {
  lire(): Tableau
  ecouter(f: () => void): () => void
  /** Applique un geste et l'inscrit dans l'historique ; `hors`, ce qu'il fait aussi ailleurs, se fait, s'annule et se rétablit avec lui. */
  faire(pas: Operation[], hors?: HorsDocument): void
  /** Applique sans rien inscrire : un glisser en cours, inscrit à la fin par `inscrire`. */
  appliquerSeulement(pas: Operation[]): void
  /**
   * Écrit ce qu'un transfert fait à cette toile : ce qui y arrive d'ailleurs (`creer`), ce qui part pour une autre toile
   * (`supprimer`). Rien n'en entre dans l'historique, et aucun pas, d'avant ou à rétablir, ne le défait : annuler ici ne
   * fait pas revenir ce qui est parti (il ferait double avec sa copie là-bas), ni ne retire ce qui est arrivé (il serait
   * perdu). Le geste en cours s'y arrête ; ce qu'il avait écrit des seuls partants part avec eux.
   */
  transferer(pas: Operation[]): void
  inscrire(pas: Operation[]): void
  /**
   * Écrit la suite d'un geste déjà inscrit, qui ne doit pas devenir un pas à part (un fichier qui finit d'arriver,
   * les couleurs d'une photo) : elle rejoint le pas qui a écrit ce qu'elle corrige, et annuler ce pas l'emporte
   * aussi, le rétablir la rend. Jamais un pas de plus ni de moins, ce qu'on peut rétablir reste là, et un geste en
   * cours (un glisser, une saisie) reste un seul pas, qui commence où il commençait.
   */
  corriger(pas: Operation[]): void
  /** Remplace le tableau sans passer par l'historique (premier plan, chargement). */
  remplacer(t: Tableau): void
  /**
   * Le texte d'un élément tel que plusieurs personnes l'écrivent ensemble (un fragment Yjs, créé au besoin).
   * Absent d'un magasin qui n'est pas partagé : l'éditeur écrit alors seul dans le contenu.
   */
  texte?(id: Id): XmlFragment
  /** Qui a créé et dernièrement touché cet élément, et quand. Absent d'un magasin qui n'en garde pas la trace. */
  trace?(id: Id): Trace | undefined
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
    faire(pas, hors) {
      if (pas.length === 0) return
      // Inscrit avant de prévenir : ceux qui écoutent lisent déjà la pile à jour.
      historique.inscrire(pas, hors)
      poser(pas.reduce(appliquer, tableau))
      hors?.faire()
    },
    appliquerSeulement(pas) {
      if (pas.length > 0) poser(pas.reduce(appliquer, tableau))
    },
    transferer(pas) {
      if (pas.length === 0) return
      historique.oublier(new Set(pas.flatMap((op) => (op.type === 'supprimer' ? [op.element.id] : []))))
      poser(pas.reduce(appliquer, tableau))
    },
    inscrire(pas) {
      historique.inscrire(pas)
      for (const f of ecouteurs) f()
    },
    corriger(pas) {
      if (pas.length === 0) return
      historique.joindre(pas)
      poser(pas.reduce(appliquer, tableau))
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
    transferer() {},
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
