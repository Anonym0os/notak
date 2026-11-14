import { type Element, type Id, type Operation, type Tableau, appliquer, inverse } from './tableau'

/** Au-delà, on oublie les plus anciens pas, jusqu'à en garder `PAS_GARDES`. */
const PAS_MAX = 500
const PAS_GARDES = 400

/** Ce qu'une correction change d'un élément, et ce qu'elle y trouve avant. */
type Champ = { id: Id; nom: 'contenu' | 'position' | 'largeur' | 'hauteur'; avant: unknown }

/** Le champ que corrige cette opération ; `undefined` pour celles qu'aucune correction n'écrit, qui ne se joignent pas. */
function champCorrige(op: Operation): Champ | undefined {
  if (op.type === 'contenu') return { id: op.id, nom: 'contenu', avant: op.avant }
  if (op.type === 'deplacer') return { id: op.id, nom: 'position', avant: op.de }
  if (op.type === 'redimensionner') return { id: op.id, nom: 'largeur', avant: op.de }
  if (op.type === 'borner') return { id: op.id, nom: 'hauteur', avant: op.de }
  return undefined
}

const SANS_CE_CHAMP = Symbol('sans ce champ')
const RETIRE = Symbol('retiré')

function lireChamp(e: Element, nom: Champ['nom']): unknown {
  if (nom === 'contenu') return e.contenu
  if (nom === 'position') return [e.x, e.y]
  return nom === 'largeur' ? e.largeur : (e.hauteur ?? null)
}

/** Ce que ce pas laisse du champ (sa dernière opération qui l'écrit), `RETIRE` s'il retire l'élément, `SANS_CE_CHAMP` s'il n'y touche pas. */
function laisse(pas: readonly Operation[], c: Champ): unknown {
  for (let k = pas.length - 1; k >= 0; k--) {
    const op = pas[k]!
    if (op.type === 'creer' && op.element.id === c.id) return lireChamp(op.element, c.nom)
    if (op.type === 'supprimer' && op.element.id === c.id) return RETIRE
    if (op.type === 'etiquettes' || op.type === 'fond' || op.type === 'creer' || op.type === 'supprimer' || op.id !== c.id) continue
    if (c.nom === 'contenu' && op.type === 'contenu') return op.apres
    if (c.nom === 'position' && op.type === 'deplacer') return op.vers
    if (c.nom === 'position' && op.type === 'ranger') return [op.vers.x, op.vers.y]
    if (c.nom === 'largeur' && op.type === 'redimensionner') return op.vers
    if (c.nom === 'hauteur' && op.type === 'borner') return op.vers
  }
  return SANS_CE_CHAMP
}

const memes = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b)

/**
 * Ce qu'un geste fait aussi hors du document de sa toile : le titre de la toile qu'une carte porte, qui ne vit que dans
 * le document de celle-ci (sa carte n'en garde rien, pour ne pas le montrer à qui ne la lit pas). Le magasin le fait avec
 * le geste, et seulement s'il le fait ; son historique le défait et le refait avec lui.
 */
export interface HorsDocument {
  /** Quand le geste se fait, puis quand on le rétablit. */
  faire(): void
  /** Quand on l'annule. */
  defaire(): void
}

interface Pas {
  operations: Operation[]
  hors?: HorsDocument
}

/**
 * Annuler et rétablir. Un pas regroupe toutes les opérations d'un même geste :
 * un déplacement de groupe s'annule d'un coup.
 */
export class Historique {
  private passe: Pas[] = []
  private futur: Pas[] = []

  get peutAnnuler(): boolean {
    return this.passe.length > 0
  }

  get peutRetablir(): boolean {
    return this.futur.length > 0
  }

  /** Inscrit un geste déjà appliqué au tableau, et ce qu'il a fait hors de lui. */
  inscrire(pas: Operation[], hors?: HorsDocument) {
    if (pas.length === 0) return
    this.passe.push(hors ? { operations: pas, hors } : { operations: pas })
    this.futur = []
    if (this.passe.length > PAS_MAX) this.passe.splice(0, this.passe.length - PAS_GARDES)
  }

  /**
   * Joint une correction (voir `Magasin.corriger`) au pas qui a écrit en dernier ce qu'elle corrige, s'il l'a laissé
   * tel qu'elle le trouve : annuler ce pas l'emporte, le rétablir la rejoue. Sinon (rien de tel, ou un geste en
   * cours l'a changé depuis, comme une saisie), elle ne rejoint rien : rejouée sur un autre état, elle le fausserait.
   * Aucun pas n'en naît ni ne s'en va, et ce qu'on peut rétablir reste là.
   */
  joindre(pas: readonly Operation[]) {
    for (const op of pas) {
      const c = champCorrige(op)
      if (!c) continue
      const i = this.passe.findLastIndex((p) => laisse(p.operations, c) !== SANS_CE_CHAMP)
      // Un nouveau pas et une nouvelle liste, jamais ceux qu'on a reçus : le geste qui les a inscrits les garde peut-être encore.
      if (i >= 0 && memes(laisse(this.passe[i]!.operations, c), c.avant)) this.passe[i] = { ...this.passe[i]!, operations: [...this.passe[i]!.operations, op] }
    }
  }

  /** Le tableau d'avant le dernier pas ; ce que ce pas a fait hors du tableau est défait. */
  annuler(t: Tableau): Tableau | null {
    const pas = this.passe.pop()
    if (!pas) return null
    this.futur.push(pas)
    pas.hors?.defaire()
    return pas.operations.reduceRight((acc, op) => appliquer(acc, inverse(op)), t)
  }

  retablir(t: Tableau): Tableau | null {
    const pas = this.futur.pop()
    if (!pas) return null
    this.passe.push(pas)
    pas.hors?.faire()
    return pas.operations.reduce(appliquer, t)
  }
}
