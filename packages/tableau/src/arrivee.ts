import type { Magasin } from './coeur/magasin'
import { type Element, type Operation, LARGEUR_NOTE, nouvelId, nouvelleNote } from './coeur/tableau'
import { TAILLE_MAX, TYPES_ACCEPTES, largeurInitiale } from './elements/image/geometrie'
import { lireDimensions, lireTransparence } from './elements/image/lecture'
import type { DepotFichiers } from './elements/types'

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

/** Ce qu'une arrivée devient, avant de recevoir un identifiant et une place. */
export type Brouillon = { genre: 'lien'; url: string } | { genre: 'note'; texte: string }

const LARGEUR_LIEN = 34

/** Une adresse web, ou `null`. */
export function adresseWeb(saisie: string | undefined): string | null {
  const s = saisie?.trim()
  if (!s || /\s/.test(s) || !/^https?:\/\//i.test(s)) return null
  try {
    new URL(s)
    return s
  } catch {
    return null
  }
}

const premiereAdresse = (texte: string) => /https?:\/\/[^\s<>"']+/i.exec(texte)?.[0] ?? null

/**
 * Ce qu'on garde d'un partage. Une adresse (donnée à part, ou seule dans le texte, comme le font beaucoup
 * d'applications) devient un lien et le titre de la page n'est pas recopié : l'aperçu le retrouvera. Le texte qui
 * l'accompagne devient une note. Sans adresse, le titre et le texte font une seule note.
 */
export function decomposerArrivee(a: Pick<Arrivee, 'titre' | 'texte' | 'adresse'>): Brouillon[] {
  const titre = a.titre?.trim() ?? ''
  const texte = a.texte?.trim() ?? ''
  const url = adresseWeb(a.adresse) ?? adresseWeb(texte) ?? premiereAdresse(texte)
  if (url) {
    const reste = texte.replace(url, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    return [{ genre: 'lien', url }, ...(reste ? [{ genre: 'note' as const, texte: reste }] : [])]
  }
  const corps = [titre, texte].filter((p, i, tout) => p && tout.indexOf(p) === i && !(i === 1 && titre.includes(p)))
  return corps.length > 0 ? [{ genre: 'note', texte: corps.join('\n') }] : []
}

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
