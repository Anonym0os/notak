import { type Tableau, surLeTableau } from '../../coeur/tableau'
import { composition } from '../composition'

/** La lettre de la carte : la première du titre, en majuscule. */
export function initiale(titre: string): string {
  const [premier] = [...titre.trim()]
  return premier ? premier.toLocaleUpperCase('fr') : '?'
}

/**
 * Ce que la carte dit du contenu, type par type : « vide », « 2 notes, 1 lien ». Seul ce qui est posé sur la
 * toile compte : ni les lignes, ni la corbeille, ni le contenu des colonnes (la colonne compte pour une).
 */
export function libelleContenu(t: Tableau): string {
  const poses = surLeTableau(t).filter((e) => e.contenu.type !== 'ligne' && !e.parent)
  return poses.length === 0 ? 'vide' : composition(poses)
}
