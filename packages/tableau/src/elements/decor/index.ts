import { type Element, annoter } from '../../coeur/tableau'
import { definition, registre } from '../registre'
import './decor.css'
import { OutilAffichage, OutilCommentaire, OutilEcheance, OutilEtiquettes, OutilReactions } from './Outils'
import { pasPour, peutEtreIcone } from './annotations'
import { ouvrirFil } from './etat'

registre.outilCommun(OutilEtiquettes)
registre.outilCommun(OutilReactions)
registre.outilCommun(OutilEcheance)
registre.outilCommun(OutilAffichage)
registre.outilCommun(OutilCommentaire)

const modifiables = (elements: Element[], contexte: { services: { lectureSeule?: boolean } }) => !contexte.services.lectureSeule && elements.length > 0
const repliables = (elements: Element[]) => elements.every((e) => peutEtreIcone(definition(e.contenu.type)))

registre.entreeMenu({
  libelle: 'Commenter',
  visible: (elements) => elements.length === 1,
  faire: (elements) => ouvrirFil(elements[0]!.id),
})
registre.entreeMenu({
  libelle: 'Afficher en icône',
  visible: (elements, contexte) => modifiables(elements, contexte) && repliables(elements) && elements.some((e) => e.affichage !== 'icone'),
  faire: (elements, contexte) => contexte.magasin.faire(pasPour(elements, (e) => annoter(e, { affichage: 'icone' }))),
})
registre.entreeMenu({
  libelle: 'Afficher en détail',
  visible: (elements, contexte) => modifiables(elements, contexte) && repliables(elements) && elements.some((e) => e.affichage === 'icone'),
  faire: (elements, contexte) => contexte.magasin.faire(pasPour(elements, (e) => annoter(e, { affichage: null }))),
})
