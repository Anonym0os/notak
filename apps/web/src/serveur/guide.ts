import { type EspaceNavigable, type Id, auDoigt, creerDans, nouvelId, quandPretes } from '@notak/tableau'
import { ACCUEIL } from '@notak/tableau/modeles/accueil'
import { ACCUEIL_EN } from '@notak/tableau/modeles/accueil.en'
import { accueilAuDoigt } from '@notak/tableau/modeles/accueilDoigt'
import { elementsDuModele } from '@notak/tableau/modeles/construire'
import { langue, t } from '../langue'

/**
 * Le guide sur un serveur, demandé depuis la bibliothèque (« Découvrir Notak ») : une toile posée sur l'accueil, faite
 * du modèle des gestes, au doigt sur un écran qu'on touche. L'accueil d'un compte neuf naît vide : le guide ne vient
 * que si on le veut.
 */
export async function poserLeGuideServeur(
  espace: Pick<EspaceNavigable, 'racine' | 'magasin' | 'tableau' | 'ecouter' | 'creerTableau' | 'renommer' | 'lectureSeule' | 'synchronise'>,
): Promise<Id> {
  await quandPretes(espace, [espace.racine])
  const { tableau } = creerDans(espace, espace.racine, 'toile', t('guide.titre'))
  const l = langue() === 'en' ? 'en' : 'fr'
  const modele = l === 'en' ? ACCUEIL_EN : ACCUEIL
  const elements = elementsDuModele(auDoigt() ? accueilAuDoigt(modele, l) : modele, () => nouvelId())
  // Il arrive d'un modèle, hors de l'historique : sinon le premier geste qu'on y fait s'y joindrait, et l'annuler
  // effacerait tout le guide.
  espace.magasin(tableau).transferer(elements.map((element) => ({ type: 'creer' as const, element })))
  return tableau
}
