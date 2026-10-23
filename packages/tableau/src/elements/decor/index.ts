import type { Element } from '../../coeur/tableau'
import { registre } from '../registre'
import './decor.css'
import { OutilAffichage, OutilCommentaire, OutilEcheance, OutilEtiquettes, OutilReactions } from './Outils'
import { appliquerAffichage, estReduit, peutSeReduire } from './affichage'
import { ouvrirFil } from './etat'

registre.outilCommun(OutilEtiquettes)
registre.outilCommun(OutilReactions)
registre.outilCommun(OutilEcheance)
registre.outilCommun(OutilAffichage)
registre.outilCommun(OutilCommentaire)

const modifiables = (elements: Element[], contexte: { services: { lectureSeule?: boolean } }) => !contexte.services.lectureSeule && elements.length > 0
const repliables = (elements: Element[]) => elements.every(peutSeReduire)

registre.entreeMenu({
  libelle: 'Commenter',
  visible: (elements) => elements.length === 1,
  faire: (elements) => ouvrirFil(elements[0]!.id),
})
registre.entreeMenu({
  libelle: 'Afficher en icône',
  visible: (elements, contexte) => modifiables(elements, contexte) && repliables(elements) && elements.some((e) => !estReduit(e)),
  faire: (elements, contexte) => appliquerAffichage(elements, true, contexte),
})
registre.entreeMenu({
  libelle: 'Afficher en détail',
  visible: (elements, contexte) => modifiables(elements, contexte) && repliables(elements) && elements.some(estReduit),
  faire: (elements, contexte) => appliquerAffichage(elements, false, contexte),
})
