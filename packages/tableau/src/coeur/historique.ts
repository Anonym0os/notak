import { type Operation, type Tableau, appliquer, inverse } from './tableau'

/** Au-delà, on oublie les plus anciens pas, jusqu'à en garder `PAS_GARDES`. */
const PAS_MAX = 500
const PAS_GARDES = 400

/**
 * Annuler et rétablir. Un pas regroupe toutes les opérations d'un même geste :
 * un déplacement de groupe s'annule d'un coup.
 */
export class Historique {
  private passe: Operation[][] = []
  private futur: Operation[][] = []

  get peutAnnuler(): boolean {
    return this.passe.length > 0
  }

  get peutRetablir(): boolean {
    return this.futur.length > 0
  }

  /** Inscrit un geste déjà appliqué au tableau. */
  inscrire(pas: Operation[]) {
    if (pas.length === 0) return
    this.passe.push(pas)
    this.futur = []
    if (this.passe.length > PAS_MAX) this.passe.splice(0, this.passe.length - PAS_GARDES)
  }

  annuler(t: Tableau): Tableau | null {
    const pas = this.passe.pop()
    if (!pas) return null
    this.futur.push(pas)
    return pas.reduceRight((acc, op) => appliquer(acc, inverse(op)), t)
  }

  retablir(t: Tableau): Tableau | null {
    const pas = this.futur.pop()
    if (!pas) return null
    this.passe.push(pas)
    return pas.reduce(appliquer, t)
  }
}
