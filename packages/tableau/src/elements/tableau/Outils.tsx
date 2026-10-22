import type { RenvoiTableau } from '../../coeur/tableau'
import type { PropsOutils } from '../types'
import { demanderRenommage } from './renommage'

export function OutilsRenvoi({ elements }: PropsOutils<RenvoiTableau>) {
  if (elements.length !== 1) return null
  return (
    <button title="Renommer le tableau" onClick={() => demanderRenommage(elements[0]!.id)}>
      Renommer
    </button>
  )
}
