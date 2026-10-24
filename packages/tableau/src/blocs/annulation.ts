import { closeHistory } from '@tiptap/pm/history'
import { AddMarkStep, RemoveMarkStep, ReplaceStep } from '@tiptap/pm/transform'
import { Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import { Extension } from '@tiptap/react'
import { ySyncPluginKey, yUndoPluginKey } from '@tiptap/y-tiptap'
import { CLE_IDS } from './ids'

/**
 * Ce qui forme un pas d'annulation (docs/NOTION.md § 4, relevé 1 § 9). Comme chez Notion :
 * - les frappes se regroupent dans une **fenêtre fixe de 700 ms** depuis la première transaction du groupe : elle ne
 *   glisse pas, une rafale de trois secondes fait environ quatre pas ;
 * - une frappe ne se regroupe pas avec un changement de bloc (type, retrait, couleur), ni l'inverse ;
 * - chaque geste de bloc (Entrée, coupure, fusion, indentation) est un pas à part, et la conversion d'un raccourci
 *   markdown ou d'un remplacement typographique aussi : ⌘Z la défait seule, et rend le motif tapé.
 * Le regroupement est celui de l'historique de ProseMirror, ou du partage (Y.UndoManager) quand le texte s'écrit à
 * plusieurs : ce plugin décide quelle transaction ouvre un groupe, les deux le suivent.
 */

/** La fenêtre des frappes regroupées, en millisecondes. */
export const FENETRE_MS = 700

/** Une transaction qui touche au texte (frappe, coupure, marque), ou qui ne change que des blocs (type, attribut). */
export type Classe = 'texte' | 'bloc'

/** Le groupe en cours : la date de sa première transaction, ce qu'il contient, et s'il est clos. */
export interface Groupe {
  debut: number
  classe: Classe
  ferme: boolean
  /** La transaction suivante rejoint le groupe quoi qu'il arrive (un geste fait de deux transactions). */
  enchaine?: boolean
}

/** Marque une transaction comme un geste de bloc : un pas d'annulation à part, avant et après. */
export const CLE_GESTE = new PluginKey('gesteDeBloc')
export const geste = <T extends Transaction>(tr: T): T => tr.setMeta(CLE_GESTE, true)

/** Marque une transaction dont la suivante fait partie du même geste (le choix du menu « / ») : un seul ⌘Z les défait. */
export const CLE_ENCHAINE = new PluginKey('enchaineAuSuivant')
export const enchainer = <T extends Transaction>(tr: T): T => tr.setMeta(CLE_ENCHAINE, true)

/** La transaction touche-t-elle au texte, ou seulement aux blocs ? */
export function classeDe(tr: Transaction): Classe {
  return tr.steps.every((s) => s instanceof ReplaceStep || s instanceof AddMarkStep || s instanceof RemoveMarkStep) ? 'texte' : 'bloc'
}

/** Une transaction rejoint-elle le groupe en cours ? Oui si elle est de la même classe, dans la fenêtre fixe (700 ms incluses). */
export function rejoint(groupe: Groupe | null, t: { time: number; classe: Classe; apart: boolean }): boolean {
  return !!groupe && !groupe.ferme && !t.apart && t.classe === groupe.classe && t.time - groupe.debut <= FENETRE_MS
}

/** Les transactions qui entrent dans l'historique, écrites ici : ni celles des autres, ni les ids, ni l'historique lui-même. */
function suivie(tr: Transaction): boolean {
  if (!tr.docChanged || tr.getMeta('addToHistory') === false || tr.getMeta(CLE_IDS) || tr.getMeta('history$') || tr.getMeta('appendedTransaction')) return false
  const sync = tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined
  return !sync?.isChangeOrigin
}

const CLE = new PluginKey<Groupe | null>('annulationBlocs')
/** La décision prise avant que la transaction s'applique : elle rejoint le groupe, ou en ouvre un. */
const DECISION = new PluginKey<'rejoint' | 'neuf'>('annulationDecision')

export const AnnulationBlocs = Extension.create({
  name: 'annulationBlocs',
  addProseMirrorPlugins() {
    return [
      new Plugin<Groupe | null>({
        key: CLE,
        state: {
          init: () => null,
          apply(tr, groupe) {
            if (tr.getMeta('history$')) return groupe && { ...groupe, ferme: true }
            const decision = tr.getMeta(DECISION) as 'rejoint' | 'neuf' | undefined
            const enchaine = !!tr.getMeta(CLE_ENCHAINE)
            if (decision === 'neuf') return { debut: tr.time, classe: classeDe(tr), ferme: apart(tr) && !enchaine, enchaine }
            if (decision === 'rejoint' && groupe) return { ...groupe, ferme: apart(tr) && !enchaine, enchaine }
            return groupe
          },
        },
        // Avant que la transaction s'applique : l'historique la regarde juste après, et n'a plus qu'à suivre.
        filterTransaction(tr, state) {
          if (!suivie(tr)) return true
          const groupe = CLE.getState(state) ?? null
          const gardee = (!!groupe?.enchaine && !groupe.ferme) || rejoint(groupe, { time: tr.time, classe: classeDe(tr), apart: apart(tr) })
          tr.setMeta(DECISION, gardee ? 'rejoint' : 'neuf')
          const annuleur = yUndoPluginKey.getState(state)?.undoManager
          if (annuleur) {
            // Le partage ne coupe jamais de lui-même : c'est ce plugin qui ferme les groupes.
            annuleur.captureTimeout = Number.POSITIVE_INFINITY
            if (!gardee) annuleur.stopCapturing()
          } else if (gardee && groupe) {
            // L'historique de ProseMirror ouvre un groupe quand 500 ms ont passé depuis la transaction d'avant : la
            // fenêtre de Notion est fixe, la transaction garde donc la date du début du groupe.
            tr.setTime(groupe.debut)
          } else closeHistory(tr)
          return true
        },
      }),
    ]
  },
})

/** Une transaction qui forme son propre pas : un geste de bloc, ou la conversion d'une règle de saisie. */
function apart(tr: Transaction): boolean {
  return !!tr.getMeta(CLE_GESTE) || !!tr.getMeta('inputRule')
}
