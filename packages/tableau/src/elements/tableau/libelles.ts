import { type Tableau, surLeTableau } from '../../coeur/tableau'
import { t } from '../../langue'
import { composition } from '../composition'

/** La lettre de la carte : la première du titre, en majuscule. */
export function initiale(titre: string): string {
  const [premier] = [...titre.trim()]
  return premier ? premier.toLocaleUpperCase() : '?'
}

/**
 * Ce que la carte dit du contenu, type par type : « vide », « 2 notes, 1 lien ». Seul ce qui est posé sur la
 * toile compte, lignes comprises : ni la corbeille, ni le contenu des colonnes (la colonne compte pour une).
 */
export function libelleContenu(tableau: Tableau): string {
  const poses = surLeTableau(tableau).filter((e) => !e.parent)
  return poses.length === 0 ? t('tableau.contenuVide') : composition(poses)
}
