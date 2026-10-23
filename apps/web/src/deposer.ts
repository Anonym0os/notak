import { type Arrivee, type EspaceDistant, elementsArrives, poserDansNonTries } from '@notak/tableau'
import { fichiers } from './fichiers'

/** Attend que `fait` soit vrai, en le relisant toutes les `pas` ms ; rend faux si `delai` s'écoule avant. */
export function attendre(fait: () => boolean, delai: number, pas = 100, abandon: (ecoule: number) => boolean = () => false): Promise<boolean> {
  return new Promise((resolve) => {
    let ecoule = 0
    const verifier = () => {
      if (fait()) return resolve(true)
      if (ecoule >= delai || abandon(ecoule)) return resolve(false)
      ecoule += pas
      setTimeout(verifier, pas)
    }
    verifier()
  })
}

/** Où en est ce qu'on vient de poser : reçu par le serveur, ou gardé ici en attendant le réseau. */
export type Depot = { etat: 'enregistre' | 'local'; ajoutes: number; ignores: number }

/** Ce que la page dit d'un dépôt réussi. */
export function messageDuDepot(d: Depot): string {
  const quoi = d.ajoutes === 1 ? 'Ajouté' : `${d.ajoutes} éléments ajoutés`
  const ou = d.etat === 'enregistre' ? 'aux non triés.' : 'aux non triés, sur cet appareil : ça partira au retour du réseau.'
  const refus = d.ignores > 0 ? ` ${d.ignores === 1 ? 'Une image n’a pas pu être prise.' : `${d.ignores} images n’ont pas pu être prises.`}` : ''
  return `${quoi} ${ou}${refus}`
}

const SYNCHRO_MAX = 6000
const HORS_LIGNE_APRES = 1500

/**
 * Pose une arrivée dans les non triés de l'accueil. L'accueil est d'abord rattrapé sur le serveur (jusqu'à six
 * secondes, bien moins sans réseau), puis on attend que le serveur ait reçu le geste ; hors ligne, il reste sur cet
 * appareil et partira au retour du réseau.
 */
export async function deposerDansAccueil(espace: EspaceDistant, arrivee: Arrivee, maintenant = Date.now()): Promise<Depot> {
  const { racine } = espace
  const liberer = espace.retenir?.(racine)
  try {
    await attendre(
      () => espace.synchronise(racine),
      SYNCHRO_MAX,
      100,
      (ecoule) => ecoule >= HORS_LIGNE_APRES && espace.envoi?.(racine) === 'hors-ligne',
    )
    const { elements, ignores } = await elementsArrives(arrivee, fichiers, maintenant)
    poserDansNonTries(espace.magasin(racine), elements)
    // Le lien avec le serveur ne se sait « en attente » qu'un instant après le geste : on lui laisse le temps de le dire.
    await new Promise((fin) => setTimeout(fin, 300))
    await attendre(() => espace.envoi?.(racine) !== 'envoi', SYNCHRO_MAX)
    return { etat: espace.envoi?.(racine) === 'enregistre' ? 'enregistre' : 'local', ajoutes: elements.length, ignores }
  } finally {
    liberer?.()
  }
}
