import type { Commentaire, Fichier, Id } from '../../../coeur/tableau'

/**
 * Les commentaires épinglés sur les pages d'un PDF. Le fil est celui de la toile (`commentaire/fil.ts`) : mêmes
 * messages, mentions, réactions. Il vit dans `Fichier.fils`, par identifiant, avec sa page et son point (`surPage`).
 * Le serveur y lit les messages neufs comme dans les fils d'une note ou d'une carte mentale : notifications et mentions
 * suivent le même chemin, et une notification mène à son fil (`demanderLeFil(element, id)`).
 */

export interface FilSurPage {
  id: Id
  fil: Commentaire
  page: number
  x: number
  y: number
}

const entre01 = (v: number) => Math.max(0, Math.min(1, v))
const arrondi = (v: number) => Math.round(v * 10_000) / 10_000
const nombre = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Où le « lu » et la présence retiennent le fil d'une page (comme celui d'un sujet de carte). */
export const cleFilPdf = (element: Id, fil: Id) => `fil:${element}:${fil}`

/** Le point d'une page où l'on épingle, ramené sur la page. */
export const ancre = (page: number, x: number, y: number): NonNullable<Commentaire['surPage']> => ({ page: Math.max(1, Math.round(page)), x: arrondi(entre01(x)), y: arrondi(entre01(y)) })

/** Un fil neuf, encore sans message, épinglé là. */
export const filNeuf = (page: number, x: number, y: number): Commentaire => ({ type: 'commentaire', messages: [], surPage: ancre(page, x, y) })

/**
 * Les fils des pages, ceux qui ont un message et une place lisible, dans l'ordre de lecture : page par page, de haut en
 * bas, puis de gauche à droite.
 */
export function filsDesPages(c: Pick<Fichier, 'fils'>): FilSurPage[] {
  const sortie: FilSurPage[] = []
  for (const [id, fil] of Object.entries(c.fils ?? {})) {
    const p = fil?.surPage
    if (!p || !nombre(p.page) || !nombre(p.x) || !nombre(p.y) || !Array.isArray(fil.messages) || fil.messages.length === 0) continue
    sortie.push({ id, fil, page: p.page, x: entre01(p.x), y: entre01(p.y) })
  }
  return sortie.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x)
}

/** Les fils de cette page (1 pour la première). */
export const filsDeLaPage = (fils: readonly FilSurPage[], page: number) => fils.filter((f) => f.page === page)

/**
 * Le fichier avec ce fil (`null`, ou un fil sans message : retiré ; un fil muet n'a rien à dire). Le fil garde sa place
 * sur la page, même quand celui qu'on écrit l'a perdue.
 */
export function poserFilPdf(c: Fichier, id: Id, fil: Commentaire | null, place?: Commentaire['surPage']): Fichier {
  const garde = fil && fil.messages.length > 0 ? fil : null
  if (!garde && !c.fils?.[id]) return c
  const { fils: _, ...sans } = c
  const suite = { ...c.fils }
  if (garde) {
    const surPage = garde.surPage ?? place ?? c.fils?.[id]?.surPage
    suite[id] = surPage ? { ...garde, surPage } : garde
  } else delete suite[id]
  return Object.keys(suite).length > 0 ? { ...sans, fils: suite } : sans
}

/** Le fichier avec ce fil épinglé ailleurs : une autre page, un autre point. Rien ne change s'il n'existe pas. */
export function deplacerFilPdf(c: Fichier, id: Id, page: number, x: number, y: number): Fichier {
  const fil = c.fils?.[id]
  if (!fil) return c
  return { ...c, fils: { ...c.fils, [id]: { ...fil, surPage: ancre(page, x, y) } } }
}

/** Qui a ouvert ce fil : l'auteur de son premier message. */
export const auteurDuFil = (fil: Commentaire): string | undefined => fil.messages[0]?.auteur.id

/** Ce que la liste dit d'un fil : qui l'a ouvert, quand, et le début de ce qu'il a écrit. */
export function resumeDuFil(fil: Commentaire, longueur = 90): { auteur: string; date: number; texte: string; reponses: number } {
  const premier = fil.messages[0]
  const texte = (premier?.texte ?? '').replace(/\s+/g, ' ').trim()
  return {
    auteur: premier?.auteur.nom ?? '',
    date: premier?.date ?? 0,
    texte: texte.length > longueur ? `${texte.slice(0, longueur - 1).trimEnd()}…` : texte,
    reponses: Math.max(0, fil.messages.length - 1),
  }
}

/**
 * Le fil d'avant (`-1`) ou d'après (`1`) dans l'ordre de lecture : à partir du fil ouvert, sinon de la page qu'on lit
 * (le premier fil de cette page ou d'après, le dernier de cette page ou d'avant). On boucle aux deux bouts.
 */
export function filVoisin(fils: readonly FilSurPage[], ouvert: Id | null, pas: 1 | -1, page: number): FilSurPage | undefined {
  if (fils.length === 0) return undefined
  const i = ouvert === null ? -1 : fils.findIndex((f) => f.id === ouvert)
  if (i >= 0) return fils[(i + pas + fils.length) % fils.length]
  if (pas > 0) return fils.find((f) => f.page >= page) ?? fils[0]
  return [...fils].reverse().find((f) => f.page <= page) ?? fils[fils.length - 1]
}

/**
 * Les fils qu'on montre et qu'on parcourt : les ouverts, et les résolus seulement quand on les affiche. Un résolu reste
 * dans l'élément (on le rouvre), mais il ne parle plus : ni épingle, ni « suivant », ni compte dans la barre.
 */
export const filsParcourus = (fils: readonly FilSurPage[], resolusMontres: boolean): FilSurPage[] => (resolusMontres ? [...fils] : fils.filter((f) => !f.fil.resolu))

/** Le nombre de fils encore ouverts : celui que dit la barre. */
export const nombreOuverts = (fils: readonly FilSurPage[]) => fils.filter((f) => !f.fil.resolu).length

/** Le nombre de messages sur tout le document. */
export const nombreDeMessages = (fils: readonly FilSurPage[]) => fils.reduce((n, f) => n + f.fil.messages.length, 0)
