import { useSyncExternalStore } from 'react'
import { confierCopie, joindreServeur } from '../bureau'
import { type Echec, echecDe } from './acces'

/**
 * Passer de l'édition locale à son serveur mémorisé : « Revenir sur… », ou « Copier mes toiles sur… », qui confie à la
 * coque une copie complète des toiles de cet ordinateur avant d'y aller : la page de ce serveur, et d'aucun autre, la
 * proposera à l'import. Rien n'est supprimé ici. Si la jonction échoue, la coque oublie la copie : elle n'attend pas le
 * serveur suivant. L'état se tient hors du panneau « Où sont mes toiles ? », qui peut se refermer pendant ce temps.
 */

/**
 * Le nom de la copie confiée : un nom de code, pas un texte traduit. La coque n'accepte qu'un `.notak`, et la page du
 * serveur reconnaît la copie à `confiee`, pas à son nom.
 */
export const NOM_COPIE = 'Toiles de cet ordinateur.notak'

/** Le temps qu'IndexedDB ait écrit le dernier geste, avant que la page ne parte (comme avant un redémarrage, `MiseAJour.tsx`). */
export const ATTENTE_ECRITURES_MS = 400
/** Si la fenêtre est toujours là ce temps après une réussite, c'est qu'elle ne part pas : les boutons se rendent. */
export const DEPART_MS = 15_000

export type EtatServeur = { type: 'repos' } | { type: 'cours'; quoi: 'emporter' | 'revenir' } | { type: 'echec'; echec: Echec }

let etat: EtatServeur = { type: 'repos' }
const abonnes = new Set<() => void>()
const ecouter = (f: () => void) => {
  abonnes.add(f)
  return () => void abonnes.delete(f)
}
const poser = (e: EtatServeur) => {
  etat = e
  for (const f of abonnes) f()
}
export const lireEtatServeur = () => etat
export const useEtatServeur = () => useSyncExternalStore(ecouter, lireEtatServeur)
/** Une erreur d'un essai d'avant ne s'attarde pas quand on rouvre le panneau. */
export function oublierEchecServeur() {
  if (etat.type === 'echec') poser({ type: 'repos' })
}

/** Ce que l'emport demande à la coque : de quoi le faire sans elle dans les essais. */
export interface Moyens {
  confier: typeof confierCopie
  joindre: typeof joindreServeur
  attendre(ms: number): Promise<void>
}
const MOYENS: Moyens = { confier: confierCopie, joindre: joindreServeur, attendre: (ms) => new Promise((fin) => setTimeout(fin, ms)) }

/** Une copie de toutes les toiles de cet ordinateur confiée à la coque, puis la fenêtre part chez le serveur. */
export async function emporterToiles(serveur: string, copie: () => Promise<Uint8Array>, moyens: Moyens = MOYENS): Promise<void> {
  const octets = await copie()
  await moyens.attendre(ATTENTE_ECRITURES_MS)
  await moyens.confier(octets, NOM_COPIE)
  await moyens.joindre(serveur, true)
}

async function lancer(quoi: 'emporter' | 'revenir', travail: () => Promise<unknown>) {
  if (etat.type === 'cours') return
  poser({ type: 'cours', quoi })
  try {
    await travail()
  } catch (e) {
    poser({ type: 'echec', echec: echecDe(e) })
    return
  }
  // Réussi : la fenêtre part chez le serveur, et cette page avec elle.
  setTimeout(() => etat.type === 'cours' && poser({ type: 'repos' }), DEPART_MS)
}

export const revenirSurServeur = (serveur: string) => lancer('revenir', () => joindreServeur(serveur, true))
export const emporterSurServeur = (serveur: string, copie: () => Promise<Uint8Array>) => lancer('emporter', () => emporterToiles(serveur, copie))
