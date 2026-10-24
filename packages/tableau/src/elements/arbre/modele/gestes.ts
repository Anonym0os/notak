import type { Arbre, Id, StructureArbre } from '../../../coeur/tableau'
import {
  type Lecture,
  ajouterEnfant,
  ajouterFlottant,
  ajouterFrere,
  ajouterParent,
  basculerRepli,
  changerSujet,
  deplierJusquA,
  detacher,
  dupliquer,
  echanger,
  enfantsDe,
  lire,
  rattacher,
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
  /** Lâcher un sujet glissé : le rattacher (en `index` parmi les enfants de `parent`), ou le poser librement. */
  | { type: 'rattacher'; id: Id; parent: Id; index: number }
  | { type: 'poser'; id: Id; position: { x: number; y: number } }
  /** Placement libre : tirer une branche hors de sa place, de `de` px. */
  | { type: 'decaler'; id: Id; de: { x: number; y: number } }
  /** La structure de ces sujets ; `null` : suivre le parent. */
  | { type: 'structure'; ids: Id[]; structure: StructureArbre | null }
  | { type: 'options'; options: NonNullable<Arbre['options']> }
  /** Carte non équilibrée : combien de principaux à droite. */
  | { type: 'aDroite'; n: number }
  /** Placement libre : rendre aux sujets la place que leur structure leur donne. */
  | { type: 'realigner' }
  /** Ceux-là ne touchent pas la carte : la vue les fait elle-même. */
  | { type: 'editer'; id: Id; frappe?: string }
  | { type: 'choisir'; ids: Id[] }
  | { type: 'recadrer' }
  | { type: 'zoom'; facteur: number }
  | { type: 'brancheSeule'; id: Id }

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
    case 'rattacher':
      return { arbre: rattacher(a, g.id, g.parent, g.index), choisir: g.id }
    case 'poser': {
      // Un flottant se déplace ; un sujet attaché se détache et devient flottant.
      const s = l.sujets.get(g.id)
      if (!s || g.id === l.central) return null
      const arbre = s.genre === 'detache' ? changerSujet(a, g.id, (x) => ({ ...x, position: g.position })) : detacher(a, g.id, g.position)
      return { arbre, choisir: g.id }
    }
    case 'decaler': {
      if (g.id === l.central) return null
      const arbre = changerSujet(a, g.id, (s) => {
        const x = (s.decalage?.x ?? 0) + g.de.x
        const y = (s.decalage?.y ?? 0) + g.de.y
        const { decalage: _d, ...reste } = s
        return Math.abs(x) < 1 && Math.abs(y) < 1 ? reste : { ...reste, decalage: { x: Math.round(x), y: Math.round(y) } }
      })
      return { arbre, choisir: g.id }
    }
    case 'structure': {
      let arbre = a
      for (const id of g.ids) {
        // Le central garde toujours une structure : « suivre le parent » n'a pas de sens pour lui.
        const s = g.structure ?? (id === l.central ? 'carte' : null)
        arbre = changerSujet(arbre, id, ({ structure: _s, ...reste }) => (s ? { ...reste, structure: s } : reste))
      }
      return { arbre }
    }
    case 'options': {
      const options = Object.fromEntries(Object.entries(g.options).filter(([, v]) => v)) as Arbre['options']
      const { options: _o, ...reste } = a
      return { arbre: options && Object.keys(options).length > 0 ? { ...reste, options } : reste }
    }
    case 'aDroite':
      return { arbre: changerSujet(a, l.central, (s) => ({ ...s, aDroite: Math.max(0, Math.round(g.n)) })) }
    case 'realigner': {
      let arbre = a
      for (const [id, s] of l.sujets) if (s.decalage) arbre = changerSujet(arbre, id, ({ decalage: _d, ...reste }) => reste)
      return { arbre }
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
