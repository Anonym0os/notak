import type { Magasin } from './coeur/magasin'
import { type Element, type Operation, LARGEUR_NOTE, nouvelId, nouvelleNote } from './coeur/tableau'
import { TAILLE_MAX, TYPES_ACCEPTES, largeurInitiale } from './elements/image/geometrie'
import { lireDimensions, lireTransparence } from './elements/image/lecture'
import type { DepotFichiers } from './elements/types'
import { decomposerArrivee } from './decomposer'

export { type Brouillon, adresseWeb, decomposerArrivee } from './decomposer'

/**
 * Ce qui arrive de l'extérieur et doit aller dans les non triés de l'accueil : une page ou un texte partagés depuis
 * le téléphone (`title`, `text`, `url` d'un partage), une note rapide, des images.
 */
export interface Arrivee {
  titre?: string
  texte?: string
  adresse?: string
  fichiers?: File[]
}

const LARGEUR_LIEN = 34

/** Les éléments d'une arrivée de texte, posés dans les non triés depuis `maintenant`. */
export function elementsDeTexte(a: Pick<Arrivee, 'titre' | 'texte' | 'adresse'>, maintenant: number): Element[] {
  return decomposerArrivee(a).map((b, i): Element => {
    const nonTrie = maintenant + i
    if (b.genre === 'lien') {
      return { id: nouvelId(maintenant), x: 0, y: 0, largeur: LARGEUR_LIEN, nonTrie, contenu: { type: 'lien', url: b.url, statut: 'attente' } }
    }
    return { ...nouvelleNote(0, 0, b.texte), largeur: LARGEUR_NOTE, nonTrie }
  })
}

/**
 * Les éléments de toute l'arrivée. Les images sont envoyées tout de suite et l'élément porte leur vrai fichier :
 * personne ne les regarde ici pour finir un envoi. Une image illisible, trop grosse, ou d'un format refusé est
 * laissée, et comptée dans `ignores`.
 */
export async function elementsArrives(
  a: Arrivee,
  depot: DepotFichiers | undefined,
  maintenant = Date.now(),
): Promise<{ elements: Element[]; ignores: number }> {
  const elements = elementsDeTexte(a, maintenant)
  let ignores = 0
  for (const [i, f] of (a.fichiers ?? []).entries()) {
    const d = TYPES_ACCEPTES.includes(f.type) && f.size <= TAILLE_MAX && depot ? await lireDimensions(f) : null
    if (!d || !depot) {
      ignores++
      continue
    }
    try {
      const transparente = await lireTransparence(f)
      const fichier = await depot.enregistrer(f)
      elements.push({
        id: nouvelId(maintenant),
        x: 0,
        y: 0,
        largeur: largeurInitiale(d.largeur),
        nonTrie: maintenant + elements.length + i,
        contenu: {
          type: 'image',
          fichier,
          largeurOrigine: d.largeur,
          hauteurOrigine: d.hauteur,
          typeMime: f.type,
          ...(transparente !== undefined ? { transparente } : {}),
        },
      })
    } catch {
      ignores++
    }
  }
  return { elements, ignores }
}

/** Pose ces éléments dans les non triés du tableau, d'un seul pas d'historique. */
export function poserDansNonTries(magasin: Magasin, elements: Element[]): void {
  if (elements.length === 0) return
  magasin.faire(elements.map((element): Operation => ({ type: 'creer', element })))
}
