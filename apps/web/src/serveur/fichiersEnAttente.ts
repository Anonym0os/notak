import { useEffect, useState } from 'react'
import { FICHIER_OUVERT, type FichierOuvert, ecouter, estPageServeur, fichiersOuverts } from '../bureau'

/** Ce que la coque dit d'une copie en attente, relu : une réponse à demi lisible n'ouvre rien. */
export const estCopie = (f: unknown): f is FichierOuvert => {
  const c = f as Partial<FichierOuvert> | null
  return typeof c?.id === 'string' && typeof c.nom === 'string' && typeof c.taille === 'number' && typeof c.confiee === 'boolean'
}

/**
 * Les copies que la coque tient en file pour la page du serveur (un double clic sur un `.notak`, ou les toiles de cet
 * ordinateur qu'on lui a confiées) : lues au montage, relues à chaque `FICHIER_OUVERT`. Rien hors de l'app de bureau, et
 * rien quand la coque ne répond pas. La page locale a sa propre lecture, qui rouvre les copies au lieu de les proposer
 * (`bureau/ouverts.ts`).
 */
export function useFichiersEnAttente(): FichierOuvert[] {
  const [file, setFile] = useState<FichierOuvert[]>([])
  useEffect(() => {
    if (!estPageServeur()) return
    let vivant = true
    let arreter: (() => void) | undefined
    const relire = () =>
      void fichiersOuverts().then(
        (liste) => vivant && setFile(Array.isArray(liste) ? liste.filter(estCopie) : []),
        () => {},
      )
    relire()
    ecouter(FICHIER_OUVERT, relire).then(
      (a) => (vivant ? (arreter = a) : a()),
      () => {},
    )
    return () => {
      vivant = false
      arreter?.()
    }
  }, [])
  return file
}
