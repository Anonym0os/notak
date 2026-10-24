import type { Arbre, Id } from '../../../coeur/tableau'
import {
  type Lecture,
  ajouterEnfant,
  ajouterFlottant,
  ajouterFrere,
  ajouterParent,
  basculerRepli,
  deplierJusquA,
  dupliquer,
  echanger,
  enfantsDe,
  lire,
  renommer,
  supprimerBranches,
  supprimerSeul,
  toutReplier,
} from './sujets'

/** Ce qu'on peut faire dans une carte ouverte (docs/XMIND.md § 4). */
export type Geste =
  | { type: 'enfant'; id: Id }
  | { type: 'frere'; id: Id; avant: boolean }
  | { type: 'parent'; id: Id }
  | { type: 'flottant'; position: { x: number; y: number } }
  | { type: 'renommer'; id: Id; titre: string }
  | { type: 'supprimer'; ids: Id[] }
  | { type: 'supprimerSeul'; id: Id }
  | { type: 'replier'; id: Id }
  | { type: 'toutReplier' }
  | { type: 'deplierNiveau'; n: number }
  | { type: 'echanger'; id: Id; sens: -1 | 1 }
  | { type: 'dupliquer'; id: Id }
  /** Ceux-là ne touchent pas la carte : la vue les fait elle-même. */
  | { type: 'editer'; id: Id; frappe?: string }
  | { type: 'choisir'; ids: Id[] }
  | { type: 'recadrer' }
  | { type: 'zoom'; facteur: number }

/** Ce que devient la carte, et quel sujet choisir ou éditer ensuite. */
export interface Effet {
  arbre: Arbre
  choisir?: Id
  editer?: Id
}

/** Le titre d'un sujet qui naît : selon ce qu'il est (principal, sous-sujet…) et combien il a de frères. */
export type Titreur = (l: Lecture, parent: Id | null, genre: 'enfant' | 'parent' | 'flottant') => string

/** Applique un geste qui touche la carte ; `null` pour un geste de vue. */
export function appliquerGeste(a: Arbre, g: Geste, titre: Titreur): Effet | null {
  const l = lire(a)
  switch (g.type) {
    case 'enfant': {
      const [arbre, neuf] = ajouterEnfant(a, g.id, titre(l, g.id, 'enfant'))
      // Un enfant né sous un sujet replié le déplie : on doit le voir.
      const ouvert = l.sujets.get(g.id)?.replie ? basculerRepli(arbre, g.id) : arbre
      return { arbre: ouvert, choisir: neuf, editer: neuf }
    }
    case 'frere': {
      const s = l.sujets.get(g.id)
      const parent = s?.parent !== undefined && s.genre !== 'detache' ? s.parent : g.id
      const [arbre, neuf] = ajouterFrere(a, g.id, titre(l, parent, 'enfant'), g.avant)
      return { arbre, choisir: neuf, editer: neuf }
    }
    case 'parent': {
      const [arbre, neuf] = ajouterParent(a, g.id, titre(l, null, 'parent'))
      return neuf ? { arbre, choisir: neuf, editer: neuf } : null
    }
    case 'flottant': {
      const [arbre, neuf] = ajouterFlottant(a, g.position, titre(l, null, 'flottant'))
      return { arbre, choisir: neuf, editer: neuf }
    }
    case 'renommer':
      return { arbre: renommer(a, g.id, g.titre) }
    case 'supprimer': {
      const premier = g.ids.map((x) => l.sujets.get(x)).find((s) => s?.parent !== undefined)
      const apres = supprimerBranches(a, g.ids)
      return { arbre: apres, choisir: suivantApresSuppression(l, g.ids[0]!) ?? premier?.parent ?? l.central }
    }
    case 'supprimerSeul': {
      const s = l.sujets.get(g.id)
      return { arbre: supprimerSeul(a, g.id), choisir: enfantsDe(l, g.id)[0] ?? s?.parent ?? l.central }
    }
    case 'replier':
      return { arbre: basculerRepli(a, g.id) }
    case 'toutReplier': {
      // Tout replié déjà : tout déplier ; sinon tout replier.
      const replies = enfantsDe(l, l.central).filter((x) => enfantsDe(l, x).length > 0)
      const tous = replies.length > 0 && replies.every((x) => l.sujets.get(x)?.replie)
      return { arbre: toutReplier(a, !tous) }
    }
    case 'deplierNiveau':
      return { arbre: deplierJusquA(a, g.n) }
    case 'echanger':
      return { arbre: echanger(a, g.id, g.sens), choisir: g.id }
    case 'dupliquer': {
      const [arbre, copie] = dupliquer(a, g.id)
      return copie ? { arbre, choisir: copie } : null
    }
    default:
      return null
  }
}

/** Après une suppression : le frère d'après, sinon celui d'avant, sinon le parent. */
function suivantApresSuppression(l: Lecture, id: Id): Id | undefined {
  const s = l.sujets.get(id)
  if (!s || s.parent === undefined || s.genre === 'detache') return undefined
  const freres = enfantsDe(l, s.parent)
  const i = freres.indexOf(id)
  return freres[i + 1] ?? freres[i - 1] ?? s.parent
}
