import { randomBytes } from 'node:crypto'
import type * as Y from 'yjs'
import type { ContenuLu, ElementLu, NoeudTexte } from './contenu.ts'

// Ce qui arrive du dehors (un jeton personnel, la route `POST /api/arrivee`) et doit aller dans les non triés de
// l'accueil. C'est la même décision que `decomposerArrivee` et `poserDansNonTries` de `@notak/tableau`, que la page
// `/partage` applique côté navigateur : le serveur ne peut pas charger ces fichiers (leurs imports n'ont pas
// d'extension, Node ne les résout pas), il en reprend donc le résultat, sans la toile. Un changement de l'un se
// reporte sur l'autre ; les essais de `arrivee.test.ts` tiennent les deux d'accord sur ce qu'on voit.

export interface Arrivee {
  titre?: string
  texte?: string
  adresse?: string
}

/** Ce qu'une arrivée de texte devient, avant de recevoir un identifiant. */
type Brouillon = { genre: 'lien'; url: string } | { genre: 'note'; texte: string }

export type ElementArrive = ElementLu & { nonTrie: number }

const LARGEUR_NOTE = 34
const LARGEUR_LIEN = 34
const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const ALPHABET_PLAN = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/** Un identifiant d'élément : le temps (triable) puis du hasard, comme `nouvelId` de la toile. */
function nouvelId(maintenant: number): string {
  let temps = ''
  for (let t = maintenant, i = 0; i < 10; i++, t = Math.floor(t / 32)) temps = BASE32[t % 32] + temps
  return temps + Array.from(randomBytes(16), (o) => BASE32[o % 32]).join('')
}

const docDepuisTexte = (texte: string): NoeudTexte => ({
  type: 'doc',
  content: texte.split('\n').map((ligne) => (ligne ? { type: 'paragraph', content: [{ type: 'text', text: ligne }] } : { type: 'paragraph' })),
})

/** Une adresse web, ou `null`. */
function adresseWeb(saisie: string | undefined): string | null {
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
 * Ce qu'on garde d'une arrivée. Une adresse (donnée à part, ou seule dans le texte, comme le font beaucoup
 * d'applications) devient un lien et le titre de la page n'est pas recopié : l'aperçu le retrouvera. Le texte qui
 * l'accompagne devient une note. Sans adresse, le titre et le texte font une seule note.
 */
export function decomposer(a: Arrivee): Brouillon[] {
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
export function elementsDeTexte(a: Arrivee, maintenant: number): ElementArrive[] {
  return decomposer(a).map((b, i): ElementArrive => {
    const nonTrie = maintenant + i
    const contenu: ContenuLu = b.genre === 'lien' ? { type: 'lien', url: b.url, statut: 'attente' } : { type: 'note', texte: docDepuisTexte(b.texte) }
    return { id: nouvelId(maintenant), x: 0, y: 0, largeur: b.genre === 'lien' ? LARGEUR_LIEN : LARGEUR_NOTE, nonTrie, contenu }
  })
}

/** Un fichier image déjà rangé, posé dans les non triés après le texte (`rang` : sa place parmi les éléments). */
export function elementImage(
  image: { fichier: string; largeur: number; hauteur: number; typeMime: string },
  maintenant: number,
  rang: number,
): ElementArrive {
  // Sa taille en pixels sur dix, entre 4 et 34 unités : la largeur initiale de `largeurInitiale` de la toile.
  const largeur = Math.max(4, Math.min(Math.round(image.largeur / 10), 34))
  return {
    id: nouvelId(maintenant),
    x: 0,
    y: 0,
    largeur,
    nonTrie: maintenant + rang,
    contenu: { type: 'image', fichier: image.fichier, largeurOrigine: image.largeur, hauteurOrigine: image.hauteur, typeMime: image.typeMime },
  }
}

/** Une clé de plan strictement après `a` : le dessus de l'empilement (`cleEntre(a, undefined)` de la toile). */
function planApres(a: string): string {
  const da = a ? ALPHABET_PLAN.indexOf(a[0]!) : 0
  if (ALPHABET_PLAN.length - da > 1) return ALPHABET_PLAN[(da + ALPHABET_PLAN.length) >> 1]!
  return ALPHABET_PLAN[da]! + planApres(a.slice(1))
}

/** Pose ces éléments au-dessus de tout dans le document du tableau, d'une seule transaction. */
export function poserDansNonTries(doc: Y.Doc, elements: readonly ElementArrive[]): void {
  if (elements.length === 0) return
  const stockes = doc.getMap<Record<string, unknown>>('elements')
  doc.transact(() => {
    let plan = ''
    stockes.forEach((e) => {
      if (typeof e.plan === 'string' && e.plan > plan) plan = e.plan
    })
    for (const e of elements) {
      if (stockes.has(e.id)) continue
      plan = planApres(plan)
      stockes.set(e.id, { ...e, plan })
    }
  })
}
