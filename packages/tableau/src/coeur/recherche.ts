import { type Element, type NoeudTexte, texteBrut } from './tableau'

/** Sans accents ni majuscules : « Éte » trouve « été ». */
export const normaliser = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/** Tout le texte qu'on peut chercher dans un élément. `titreDe` donne le titre d'un tableau imbriqué. */
export function texteCherchable(e: Element, titreDe: (id: string) => string | undefined): string {
  const c = e.contenu
  const doc = (n: NoeudTexte) => texteBrut(n)
  switch (c.type) {
    case 'note':
      return doc(c.texte)
    case 'taches':
      return [c.titre ?? '', doc(c.texte)].join('\n')
    case 'lien':
      return [c.titre, c.legende, c.apercu?.titre, c.apercu?.description, c.url].filter(Boolean).join('\n')
    case 'colonne':
      return c.titre
    case 'tableau':
      return titreDe(c.cible) ?? c.titre ?? ''
    case 'image':
      return c.legende ?? ''
    case 'fichier':
      return [c.titre, c.nom].filter(Boolean).join('\n')
    case 'ligne':
      return c.libelle ?? ''
    case 'commentaire':
      return c.messages.map((m) => `${m.auteur.nom}\n${m.texte}`).join('\n')
    case 'document':
      return [c.titre, doc(c.texte)].join('\n')
    case 'croquis':
      return ''
    case 'lieu':
      return [c.nom, c.adresse].filter(Boolean).join('\n')
    case 'nuancier':
      return c.couleur
    case 'table':
      return c.cellules.flat().filter(Boolean).join('\n')
  }
}

/**
 * Les éléments qui contiennent tous les mots de la requête, dans l'ordre de lecture (de haut en bas, puis de
 * gauche à droite ; un élément rangé prend la place de sa colonne). Une requête vide ne trouve rien.
 */
export function chercher(elements: readonly Element[], requete: string, titreDe: (id: string) => string | undefined): Element[] {
  const mots = normaliser(requete).split(/\s+/).filter(Boolean)
  if (mots.length === 0) return []
  const parId = new Map(elements.map((e) => [e.id, e]))
  const place = (e: Element) => (e.parent ? (parId.get(e.parent) ?? e) : e)
  return elements
    .filter((e) => {
      const t = normaliser(texteCherchable(e, titreDe))
      return mots.every((m) => t.includes(m))
    })
    .sort((a, b) => place(a).y - place(b).y || place(a).x - place(b).x || (a.ordre ?? '').localeCompare(b.ordre ?? ''))
}
