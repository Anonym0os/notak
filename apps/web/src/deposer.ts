import { type Arrivee, type DepotFichiers, type EspaceDistant, elementsArrives, poserDansNonTries } from '@notak/tableau'
import { t, tn } from './langue'

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
  const quoi = tn('deposer.quoi', d.ajoutes)
  const ou = d.etat === 'enregistre' ? t('deposer.ou.enregistre') : t('deposer.ou.local')
  const refus = d.ignores > 0 ? ` ${tn('deposer.ignores', d.ignores)}` : ''
  return `${quoi} ${ou}${refus}`
}

const SYNCHRO_MAX = 6000
const HORS_LIGNE_APRES = 1500

/**
 * Pose une arrivée dans les non triés de l'accueil. L'accueil est d'abord rattrapé sur le serveur (jusqu'à six
 * secondes, bien moins sans réseau), puis on attend que le serveur ait reçu le geste ; hors ligne, il reste sur cet
 * appareil et partira au retour du réseau.
 */
export async function deposerDansAccueil(espace: EspaceDistant, arrivee: Arrivee, fichiers: DepotFichiers, maintenant = Date.now()): Promise<Depot> {
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
