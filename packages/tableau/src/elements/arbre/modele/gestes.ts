import type { Arbre, Id, Relation, StructureArbre, StyleSujet } from '../../../coeur/tableau'
import { type GesteStyle, appliquerGesteStyle } from './gestes-style'
import { ajouterLimite, ajouterRelation, ajouterResume, basculerMarqueur, changerLimite, changerRelation, porter, resumeDe, retirer } from './elements'
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
  | { type: 'relation'; de: Id; vers: Id }
  | { type: 'limite'; ids: Id[] }
  | { type: 'resume'; ids: Id[] }
  /** Retire des relations, des limites ou des résumés. */
  | { type: 'retirer'; ids: Id[] }
  | { type: 'titrer'; id: Id; titre: string }
  | { type: 'controles'; id: Id; controles: [{ x: number; y: number }, { x: number; y: number }] }
  | { type: 'marqueur'; ids: Id[]; marqueur: string }
  | { type: 'porter'; ids: Id[]; champ: 'etiquettes' | 'lien' | 'note' | 'image' | 'tache' | 'numerotation' | 'classe'; valeur: unknown }
  /** Cmd+Alt+T : la case à cocher d'une tâche, mise ou ôtée. */
  | { type: 'tache'; ids: Id[] }
  /** Dans le plan : Tab range le sujet sous son frère d'avant, Maj+Tab le remonte d'un cran. */
  | { type: 'indenter'; id: Id }
  | { type: 'desindenter'; id: Id }
  /** Change le style de ces sujets (une valeur `undefined` le retire) ; `null` : le réinitialiser. */
  | { type: 'style'; ids: Id[]; style: Partial<StyleSujet> | null }
  /** Remplace le style de ces sujets (coller un style copié). */
  | { type: 'collerStyle'; ids: Id[]; style: StyleSujet | undefined }
  /** Alt+Cmd+U : le style de ce sujet sur tous les sujets de son rang. */
  | { type: 'styleMemeRang'; id: Id }
  | { type: 'theme'; theme: string }
  | { type: 'relationStyle'; id: Id; forme?: Relation['forme']; pointes?: Relation['pointes'] }
  /** Ceux-là ne touchent pas la carte : la vue les fait elle-même. */
  | { type: 'editer'; id: Id; frappe?: string }
  | { type: 'choisir'; ids: Id[] }
  | { type: 'recadrer' }
  | { type: 'zoom'; facteur: number }
  | { type: 'brancheSeule'; id: Id }
  /** Commencer une relation depuis ce sujet : la vue attend le clic sur la cible. */
  | { type: 'relier'; id: Id }
  /** Ouvrir le panneau du sujet, sur une section. */
  | { type: 'panneau'; section?: 'note' | 'etiquettes' | 'lien' | 'image' | 'marqueurs' }
  /** Maj+Cmd+M, Cmd+Alt+F, Cmd+Alt+P, Cmd+F : le plan, le mode Zen, la présentation, la recherche. */
  | { type: 'mode'; mode: 'plan' | 'zen' | 'presentation' | 'recherche' }
  /** Cmd+Alt+C, Cmd+Alt+V : copier et coller un style ; la vue garde le style copié. */
  | { type: 'copierStyle'; id: Id }
  | { type: 'collerStyleCopie'; ids: Id[] }
  /** L'onglet Style : largeur imposée, style d'une relation, d'une limite ou d'un résumé, mise à jour, numérotation des frères. */
  | GesteStyle

/** Ce que devient la carte, et quel sujet choisir ou éditer ensuite. */
export interface Effet {
  arbre: Arbre
  choisir?: Id
  editer?: Id
}

/** Le titre d'un sujet qui naît : selon ce qu'il est (principal, sous-sujet…) et combien il a de frères. */
export type Titreur = (l: Lecture, parent: Id | null, genre: 'enfant' | 'parent' | 'flottant' | 'resume') => string

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
      // Dans la sélection, il peut y avoir des relations, des limites, des résumés : ils partent aussi.
      let base = a
      for (const id of g.ids) if (!a.sujets[id]) base = retirer(base, id)
      // Un sujet de résumé supprimé emporte son accolade.
      for (const id of g.ids) {
        const r = resumeDe(base, id)
        if (r) base = retirer(base, r)
      }
      const premier = g.ids.map((x) => l.sujets.get(x)).find((s) => s?.parent !== undefined)
      const apres = supprimerBranches(base, g.ids.filter((x) => !!base.sujets[x]))
      if (!g.ids.some((x) => l.sujets.has(x))) return { arbre: apres }
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
    case 'relation': {
      const [arbre, id] = ajouterRelation(a, g.de, g.vers)
      return id ? { arbre, choisir: id } : null
    }
    case 'limite': {
      const [arbre, id] = ajouterLimite(a, g.ids)
      return id ? { arbre, choisir: id } : null
    }
    case 'resume': {
      const [arbre, sujet] = ajouterResume(a, g.ids, titre(l, null, 'resume'))
      return sujet ? { arbre, choisir: sujet, editer: sujet } : null
    }
    case 'retirer':
      return { arbre: g.ids.reduce(retirer, a) }
    case 'titrer': {
      const nettoye = g.titre.trim()
      if (a.relations?.[g.id]) return { arbre: changerRelation(a, g.id, ({ titre: _t, ...r }) => (nettoye ? { ...r, titre: nettoye } : r)) }
      return { arbre: changerLimite(a, g.id, ({ titre: _t, ...x }) => (nettoye ? { ...x, titre: nettoye } : x)) }
    }
    case 'controles':
      return { arbre: changerRelation(a, g.id, (r) => ({ ...r, controles: g.controles })) }
    case 'marqueur':
      return { arbre: basculerMarqueur(a, g.ids, g.marqueur) }
    case 'porter':
      return { arbre: porter(a, g.ids, g.champ, g.valeur as never) }
    case 'tache': {
      const toutes = g.ids.every((x) => a.sujets[x]?.tache)
      return { arbre: porter(a, g.ids, 'tache', toutes ? undefined : 'a-faire') }
    }
    case 'style': {
      let arbre = a
      for (const id of g.ids)
        arbre = changerSujet(arbre, id, ({ style, ...reste }) => {
          if (g.style === null) return reste
          const neuf: Record<string, unknown> = { ...style }
          for (const [k, v] of Object.entries(g.style)) {
            if (v === undefined) delete neuf[k]
            else neuf[k] = v
          }
          return Object.keys(neuf).length > 0 ? { ...reste, style: neuf as StyleSujet } : reste
        })
      return { arbre }
    }
    case 'collerStyle':
      return { arbre: g.ids.reduce((x, id) => changerSujet(x, id, ({ style: _s, ...reste }) => (g.style ? { ...reste, style: g.style } : reste)), a) }
    case 'styleMemeRang': {
      const modele = l.sujets.get(g.id)
      if (!modele) return null
      const rang = rangSimple(l, g.id)
      const ids = [...l.sujets.keys()].filter((x) => x !== g.id && rangSimple(l, x) === rang)
      return { arbre: ids.reduce((x, id) => changerSujet(x, id, ({ style: _s, ...reste }) => (modele.style ? { ...reste, style: modele.style } : reste)), a) }
    }
    case 'theme': {
      const { theme: _t, ...reste } = a
      return { arbre: g.theme === 'classique' ? reste : { ...reste, theme: g.theme } }
    }
    case 'indenter': {
      const s = l.sujets.get(g.id)
      if (!s || s.parent === undefined || s.genre) return null
      const freres = enfantsDe(l, s.parent)
      const avant = freres[freres.indexOf(g.id) - 1]
      if (!avant) return null
      const arbre = rattacher(a, g.id, avant, Number.MAX_SAFE_INTEGER)
      return { arbre: l.sujets.get(avant)?.replie ? basculerRepli(arbre, avant) : arbre, choisir: g.id }
    }
    case 'desindenter': {
      const s = l.sujets.get(g.id)
      const p = s?.parent !== undefined ? l.sujets.get(s.parent) : undefined
      if (!s || !p || p.parent === undefined || s.genre || p.genre) return null
      const index = enfantsDe(l, p.parent).indexOf(s.parent!) + 1
      return { arbre: rattacher(a, g.id, p.parent, index), choisir: g.id }
    }
    case 'relationStyle':
      return {
        arbre: changerRelation(a, g.id, (r) => {
          const { forme: _f, pointes: _p, ...reste } = r
          const forme = g.forme !== undefined ? g.forme : r.forme
          const pointes = g.pointes !== undefined ? g.pointes : r.pointes
          return { ...reste, ...(forme && forme !== 'courbe' ? { forme } : {}), ...(pointes ? { pointes } : {}) }
        }),
      }
    default:
      return appliquerGesteStyle(a, g, l)
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

/** Le rang d'un sujet, pour « appliquer au même rang » : central, principal, sous-sujet, flottant ou résumé. */
function rangSimple(l: Lecture, id: Id): string {
  const s = l.sujets.get(id)
  if (!s || s.parent === undefined) return 'central'
  if (s.genre) return s.genre
  return s.parent === l.central ? 'principal' : 'sous'
}
