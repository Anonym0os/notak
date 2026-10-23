import { type Commentaire, type Element, annoter } from '../../coeur/tableau'
import type { ContexteToile } from '../types'
import { BulleFil } from './Epingle'

/** Le fil vide sur lequel repart un élément qui n'en avait pas. */
const VIDE: Commentaire = { type: 'commentaire', messages: [] }

/** Un fil, ou plus rien : un fil sans message n'a pas à rester accroché. */
const poser = (e: Element, fil: Commentaire) => annoter(e, { commentaire: fil.messages.length > 0 ? fil : null })

/**
 * Le fil de discussion accroché à un élément : les mêmes messages, auteurs et dates que l'élément Commentaire
 * (voir `fil.ts`), mais rangés dans l'élément lui-même plutôt que posés sur la toile.
 */
export function FilAttache({ element, contexte, fermer }: { element: Element; contexte: ContexteToile; fermer(): void }) {
  const fil = element.commentaire ?? VIDE
  const cle = `fil:${element.id}`
  const maj = (apres: Commentaire) => {
    const op = poser(element, apres)
    if (op) contexte.magasin.faire([op])
  }
  return <BulleFil fil={fil} maj={maj} contexte={contexte} cle={cle} cles={[cle]} signal={cle} fermer={fermer} />
}
