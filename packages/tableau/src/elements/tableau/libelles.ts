import type { Tableau } from '../../coeur/tableau'

/** La lettre de la carte : la première du titre, en majuscule. */
export function initiale(titre: string): string {
  const [premier] = [...titre.trim()]
  return premier ? premier.toLocaleUpperCase('fr') : '?'
}

/** Ce que la carte dit du contenu : « vide », « 1 élément », « 3 éléments ». Les lignes ne comptent pas. */
export function libelleContenu(t: Tableau): string {
  const n = t.elements.filter((e) => e.contenu.type !== 'ligne').length
  return n === 0 ? 'vide' : n === 1 ? '1 élément' : `${n} éléments`
}
