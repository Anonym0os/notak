import type { Element } from '../../coeur/tableau'
import { registre } from '../registre'
import './decor.css'
import { OutilAffichage, OutilCommentaire, OutilEcheance, OutilEtiquettes, OutilReactions } from './Outils'
import { appliquerAffichage, estReduit, peutSeReduire } from './affichage'
import { ouvrirFil } from './etat'
import { t } from '../../langue'

registre.outilCommun(OutilEtiquettes)
registre.outilCommun(OutilReactions)
registre.outilCommun(OutilEcheance)
registre.outilCommun(OutilAffichage)
registre.outilCommun(OutilCommentaire)

const modifiables = (elements: Element[], contexte: { services: { lectureSeule?: boolean } }) => !contexte.services.lectureSeule && elements.length > 0
const repliables = (elements: Element[]) => elements.every(peutSeReduire)

registre.entreeMenu({
  get libelle() {
    return t('menu.commenter')
  },
  visible: (elements) => elements.length === 1,
  faire: (elements) => ouvrirFil(elements[0]!.id),
})
registre.entreeMenu({
  get libelle() {
    return t('menu.enIcone')
  },
  visible: (elements, contexte) => modifiables(elements, contexte) && repliables(elements) && elements.some((e) => !estReduit(e)),
  faire: (elements, contexte) => appliquerAffichage(elements, true, contexte),
})
registre.entreeMenu({
  get libelle() {
    return t('menu.enDetail')
  },
  visible: (elements, contexte) => modifiables(elements, contexte) && repliables(elements) && elements.some(estReduit),
  faire: (elements, contexte) => appliquerAffichage(elements, false, contexte),
})
