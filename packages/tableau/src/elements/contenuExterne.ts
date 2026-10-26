import { useMemo, useSyncExternalStore } from 'react'
import type { Id } from '../coeur/tableau'
import { domaineDe } from './lien/adresse'
import type { ContexteToile, Services } from './types'

/**
 * Le contenu d'autres sites dans un tableau venu d'une copie reçue (`Services.contenuExterne`) : un lecteur intégré,
 * une image d'aperçu, une favicon, l'image d'un texte. Il n'apparaît pas de lui-même : ce fichier dit s'il attend, et
 * retient ce que la personne a permis le temps de la session, élément par élément. L'accord pour tout le tableau, lui,
 * est durable : c'est l'hôte qui le garde (`Services.permettreContenuExterne`).
 */

/** Les accords de cette session, en mémoire : ils ne survivent pas au rechargement de la page. */
const permis = new Set<string>()
const ecouteurs = new Set<() => void>()

/** Ce qui attend l'accord, pour un élément du tableau (une carte, un document) ; `partie` nomme ce qui est en jeu dedans. */
export interface ContenuExterne {
  /** Cette partie de l'élément (une adresse, un bloc) attend-elle l'accord ? Sans `partie`, l'élément tout entier. */
  attend(partie?: string): boolean
  /** La personne dit oui pour cette partie, jusqu'à la fermeture de la page. */
  permettre(partie?: string): void
  /** Prévenu quand l'accord du tableau ou celui d'une partie change. Rend de quoi arrêter. */
  ecouter(f: () => void): () => void
  /** Un texte qui change quand l'un ou l'autre change : de quoi suivre avec `useSyncExternalStore`. */
  etat(): string
}

/**
 * Ce que l'élément `element` du tableau `tableau` doit attendre, ou `null` quand l'hôte n'a pas ce service (le serveur) ou
 * ne dit pas de quel tableau il s'agit : alors tout se charge, comme avant.
 */
export function contenuExterneDe(services: Services, tableau: Id | undefined, element: Id): ContenuExterne | null {
  const { contenuExterne, ecouterContenuExterne } = services
  if (!contenuExterne || !tableau) return null
  // Un tuple écrit en JSON : un identifiant ou une adresse venus du document ne se confondent pas avec un autre.
  const cle = (partie = '') => JSON.stringify([tableau, element, partie])
  const tableauAttend = () => contenuExterne(tableau) === 'demander'
  return {
    attend: (partie) => tableauAttend() && !permis.has(cle(partie)),
    permettre(partie) {
      const k = cle(partie)
      if (permis.has(k)) return
      permis.add(k)
      for (const f of [...ecouteurs]) f()
    },
    ecouter(f) {
      const hote = ecouterContenuExterne?.(f)
      ecouteurs.add(f)
      return () => {
        hote?.()
        ecouteurs.delete(f)
      }
    },
    etat: () => `${tableauAttend() ? 1 : 0}|${permis.size}`,
  }
}

/** Oublie les accords de la session (les essais). */
export const oublierLesAccords = () => {
  permis.clear()
  for (const f of [...ecouteurs]) f()
}

const sansEcoute = () => () => {}

/** Le contenu d'autres sites de cet élément, tel que l'hôte le règle ; `null` s'il n'y a rien à attendre. Stable tant que rien ne change. */
export function useContenuExterne(contexte: ContexteToile, element: Id): ContenuExterne | null {
  const { contenuExterne, ecouterContenuExterne } = contexte.services
  const tableau = contenuExterne ? contexte.magasin.lire().id : undefined
  return useMemo(() => contenuExterneDe({ contenuExterne, ecouterContenuExterne }, tableau, element), [contenuExterne, ecouterContenuExterne, tableau, element])
}

/** Cette partie attend-elle l'accord ? Le composant se redessine quand cela change. */
export function useAttend(externe: ContenuExterne | null, partie?: string): boolean {
  return useSyncExternalStore(externe?.ecouter ?? sansEcoute, () => externe?.attend(partie) ?? false)
}

/** Un texte qui change quand l'accord de l'élément change : de quoi refaire un rendu qui en dépend. */
export function useEtatExterne(externe: ContenuExterne | null): string {
  return useSyncExternalStore(externe?.ecouter ?? sansEcoute, externe?.etat ?? (() => ''))
}

/** Les hôtes d'où viendrait ce contenu, sans doublon, dans l'ordre : ce que l'emplacement dit à la personne. */
export function hotesDe(adresses: readonly (string | undefined)[]): string[] {
  const hotes = adresses.flatMap((a) => (a ? [domaineDe(a)] : []))
  return [...new Set(hotes)]
}
