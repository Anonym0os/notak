import { FICHIER_OUVERT, type FichierOuvert, ecouter, estErreurCoque, fichiersOuverts, lireFichierOuvert } from '../bureau'

/**
 * Les copies `.notak` ouvertes depuis le système (un double clic, « Ouvrir avec… ») attendent dans la coque, qui les
 * range en file. L'édition locale les prend au chargement, puis à chaque `FICHIER_OUVERT`, et les rouvre comme
 * n'importe quelle copie rouverte (`rouvrirCopie` : la copie d'un autre est marquée, ses lecteurs attendent l'accord).
 *
 * Celles que la page embarquée a confiées au serveur (`confiee`) ne sont pas des fichiers du disque, et pas pour elle :
 * seule la page du serveur les voit, et elle les prend.
 */

export interface Reouverture {
  /** Rouvre une copie. `'recharge'` : la page repart de l'accueil, ce qui reste en file attendra. */
  rouvrir(octets: Uint8Array, nom: string): Promise<'fait' | 'recharge'>
  /** Une copie qu'on n'a pu ni lire ni rouvrir. */
  echec(e: unknown, nom: string): void
}

/** Ce que la coque sait faire ; les essais en mettent un autre. */
export interface MoyensFichiers {
  lister(): Promise<FichierOuvert[]>
  lire(id: string): Promise<Uint8Array>
  ecouter(evenement: string, rappel: () => void): Promise<() => void>
}
const MOYENS: MoyensFichiers = { lister: fichiersOuverts, lire: lireFichierOuvert, ecouter: (e, r) => ecouter(e, r) }

/** Une passe : rouvre, l'une après l'autre, les copies qui attendent. Rend combien elle en a lues. */
export async function traiterFichiersOuverts(r: Reouverture, moyens: MoyensFichiers = MOYENS, vivant: () => boolean = () => true): Promise<number> {
  let lus = 0
  for (const f of await moyens.lister()) {
    if (f.confiee) continue
    if (!vivant()) break
    let octets: Uint8Array
    try {
      octets = await moyens.lire(f.id)
    } catch (e) {
      // Prise entre-temps par une autre passe : il n'y a rien à dire.
      if (!(estErreurCoque(e) && e.code === 'introuvable')) r.echec(e, f.nom)
      continue
    }
    lus++
    try {
      if ((await r.rouvrir(octets, f.nom)) === 'recharge') break
    } catch (e) {
      r.echec(e, f.nom)
    }
  }
  return lus
}

/** Une passe à la fois : deux événements rapprochés (plusieurs fichiers ouverts d'un coup) ne se marchent pas dessus. */
let suite: Promise<unknown> = Promise.resolve()

/**
 * Prend les copies en attente maintenant, et à chaque fois que la coque en annonce une. Rend de quoi cesser. Une coque
 * d'avant les fichiers ouverts ne connaît pas la commande : il n'y a rien à prendre, et la page ne s'en plaint pas.
 */
export function suivreFichiersOuverts(r: Reouverture, moyens: MoyensFichiers = MOYENS): () => void {
  let actif = true
  const passer = () => {
    suite = suite.then(() => (actif ? traiterFichiersOuverts(r, moyens, () => actif) : 0)).catch((e: unknown) => console.warn('Notak : copies ouvertes illisibles', e))
  }
  passer()
  let arreter: (() => void) | null = null
  moyens.ecouter(FICHIER_OUVERT, passer).then(
    (off) => (actif ? (arreter = off) : off()),
    () => {},
  )
  return () => {
    actif = false
    arreter?.()
  }
}
