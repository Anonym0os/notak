import * as Y from 'yjs'
import type { Base, GenreActivite, LigneActivite, NouvelleNotification } from './base.ts'
import { type ElementLu, texteCherchable } from './contenu.ts'
import { NOM_ARBRES, decouper } from '../../../packages/tableau/src/coeur/arbresYjs.ts'
import { type Role, meilleurRole } from './droits.ts'

// Ce que le serveur déduit des mises à jour Yjs qu'il reçoit : qui a créé, modifié, déplacé ou jeté quoi.
// Il n'a pas le geste, seulement l'état d'avant et d'après d'un élément : il les compare.

/** Une mise à jour de cet élément se renouvelle au lieu de s'ajouter si elle suit la précédente de moins que ça. */
export const FENETRE_FUSION = 30_000
/** Deux gestes d'une même personne se regroupent tant qu'aucun silence ne dépasse ça. */
export const ECART_GROUPE = 10 * 60_000
/** Un déplacement plus court (en unités de grille) n'est pas un geste : on a effleuré l'élément. */
export const DEPLACEMENT_MIN = 4
/** Des modifications d'un même auteur, sur un même tableau, restent une seule notification tant qu'elle n'est pas lue. */
export const FUSION_NOTIFICATION = 60 * 60_000
const LIBELLE_MAX = 80
const EXTRAIT_MAX = 140

/** Un élément tel que Yjs le garde : le contenu, la place, le plan. */
type Stocke = Record<string, unknown>

export interface Changement {
  genre: GenreActivite
  /** L'élément touché ; vide pour le titre du tableau. */
  element: string
  typeElement: string
  libelle: string
  /** Pour un fil de commentaires : les messages arrivés avec ce changement. */
  messages?: { texte: string }[]
  /** Pour un fil de commentaires : qui avait déjà écrit dedans. */
  participants?: string[]
}

const chaine = (v: unknown): string => (typeof v === 'string' ? v : '')
const nombre = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const court = (texte: string, max: number) => {
  const net = texte.replace(/\s+/g, ' ').trim()
  return net.length > max ? `${net.slice(0, max - 1)}…` : net
}

const contenuDe = (s: Stocke): ElementLu['contenu'] | null => {
  const c = s.contenu
  return c && typeof c === 'object' && typeof (c as { type?: unknown }).type === 'string' ? (c as ElementLu['contenu']) : null
}

/** De quoi reconnaître un élément dans une liste : le début de son texte, son titre ou son adresse. */
export function libelleDe(id: string, s: Stocke): string {
  const contenu = contenuDe(s)
  if (!contenu) return ''
  const e: ElementLu = { id, x: nombre(s.x), y: nombre(s.y), largeur: nombre(s.largeur), contenu }
  const premiere = texteCherchable(e, () => undefined)
    .split('\n')
    .find((l) => l.trim() !== '')
  return court(premiere ?? '', LIBELLE_MAX)
}

const messagesDe = (c: ElementLu['contenu'] | null): { id: string; texte: string; auteur: string }[] =>
  Array.isArray(c?.messages)
    ? (c.messages as { id?: unknown; texte?: unknown; auteur?: { id?: unknown } }[]).map((m) => ({
        id: chaine(m.id),
        texte: chaine(m.texte),
        auteur: chaine(m.auteur?.id),
      }))
    : []

/** Ce qui a changé d'un élément entre `avant` et `apres` (absent : n'existait pas, n'existe plus), ou `null`. */
export function comparer(id: string, avant: Stocke | undefined, apres: Stocke | undefined): Changement | null {
  const decrire = (s: Stocke, genre: GenreActivite): Changement => ({
    genre,
    element: id,
    typeElement: contenuDe(s)?.type ?? '',
    libelle: libelleDe(id, s),
  })
  const aLaCorbeille = (s: Stocke) => s.corbeille !== undefined
  if (apres && !contenuDe(apres)) return null
  if (!avant) {
    if (!apres || aLaCorbeille(apres)) return null
    if (contenuDe(apres)?.type === 'commentaire') {
      // Un fil sans message n'a rien à dire : il n'existe qu'à son premier message.
      const neufs = messagesDe(contenuDe(apres))
      if (neufs.length === 0) return null
      return { ...decrire(apres, 'commente'), libelle: court(neufs[neufs.length - 1]!.texte, LIBELLE_MAX), messages: neufs.map((m) => ({ texte: m.texte })), participants: [] }
    }
    return decrire(apres, 'cree')
  }
  if (!apres) return aLaCorbeille(avant) ? null : decrire(avant, 'supprime')
  if (!aLaCorbeille(avant) && aLaCorbeille(apres)) return decrire(avant, 'supprime')
  if (aLaCorbeille(avant) && !aLaCorbeille(apres)) return decrire(apres, 'restaure')
  if (aLaCorbeille(apres)) return null

  const c0 = contenuDe(avant)
  const c1 = contenuDe(apres)
  if (JSON.stringify(c0) !== JSON.stringify(c1)) {
    if (c1?.type === 'commentaire') {
      const anciens = messagesDe(c0)
      const connus = new Set(anciens.map((m) => m.id))
      const neufs = messagesDe(c1).filter((m) => !connus.has(m.id))
      if (neufs.length > 0) {
        return {
          ...decrire(apres, 'commente'),
          libelle: court(neufs[neufs.length - 1]!.texte, LIBELLE_MAX),
          messages: neufs.map((m) => ({ texte: m.texte })),
          participants: [...new Set(anciens.map((m) => m.auteur).filter(Boolean))],
        }
      }
    }
    return decrire(apres, 'modifie')
  }
  const loin = Math.hypot(nombre(apres.x) - nombre(avant.x), nombre(apres.y) - nombre(avant.y)) >= DEPLACEMENT_MIN
  if (loin || chaine(apres.parent) !== chaine(avant.parent)) return decrire(apres, 'deplace')
  return null
}

// ---- Suivre un document ----

export interface Acteur {
  id: string
  nom: string
  couleur: string
}

/**
 * Observe un document chargé et accumule ce qui change ; `ramasser` rend et vide la liste.
 * Les changements faits par le serveur lui-même (titre d'un accueil) ne sont pas observés : l'observation commence après.
 */
export function observer(doc: Y.Doc): { ramasser(): Changement[] } {
  const elements = doc.getMap<Stocke>('elements')
  const textes = doc.getMap<Y.XmlFragment>('textes')
  const meta = doc.getMap<unknown>('meta')
  let attente: Changement[] = []

  elements.observe((evenement) => {
    for (const [id, cle] of evenement.changes.keys) {
      const c = comparer(id, cle.oldValue as Stocke | undefined, cle.action === 'delete' ? undefined : elements.get(id))
      if (c) attente.push(c)
    }
  })
  // Le texte d'une note vit à part des éléments : une frappe y laisse sa trace, pas dans `elements`.
  textes.observeDeep((evenements) => {
    for (const e of evenements) {
      const id = e.path[0]
      const s = typeof id === 'string' ? elements.get(id) : undefined
      if (typeof id === 'string' && s && s.corbeille === undefined && contenuDe(s)) {
        attente.push({ genre: 'modifie', element: id, typeElement: contenuDe(s)!.type, libelle: libelleDe(id, s) })
      }
    }
  })
  // Les sujets d'une carte mentale vivent aussi à part, dans `arbres` : une carte touchée compte une fois par passage.
  doc.getMap<unknown>(NOM_ARBRES).observe((evenement) => {
    const cartes = new Set<string>()
    for (const cle of evenement.keysChanged) {
      const d = decouper(cle)
      if (d) cartes.add(d[0])
    }
    for (const id of cartes) {
      const s = elements.get(id)
      if (s && s.corbeille === undefined && contenuDe(s)) attente.push({ genre: 'modifie', element: id, typeElement: contenuDe(s)!.type, libelle: libelleDe(id, s) })
    }
  })
  meta.observe((evenement) => {
    const ancien = evenement.changes.keys.get('titre')
    const titre = chaine(meta.get('titre'))
    // Le premier titre d'un tableau neuf n'est pas un renommage.
    if (ancien && ancien.action !== 'add' && chaine(ancien.oldValue) !== '' && titre !== chaine(ancien.oldValue)) {
      attente.push({ genre: 'titre', element: '', typeElement: 'tableau', libelle: court(titre, LIBELLE_MAX) })
    }
  })
  return {
    ramasser() {
      const pris = attente
      attente = []
      return pris
    },
  }
}

/** Un changement par élément et par genre : une rafale de frappes n'en fait qu'un. */
export function sansDoublons(changements: readonly Changement[]): Changement[] {
  const dernier = new Map<string, Changement>()
  for (const c of changements) {
    const cle = `${c.element}|${c.genre}`
    const avant = dernier.get(cle)
    dernier.set(cle, avant?.messages ? { ...c, messages: [...avant.messages, ...(c.messages ?? [])], participants: avant.participants } : c)
  }
  return [...dernier.values()]
}

// ---- Qui est concerné ----

/**
 * Ceux à qui ce tableau est partagé, à lui ou à un tableau au-dessus, avec le meilleur rôle donné : ceux qu'une
 * activité peut concerner. Les droits eux-mêmes (blocages, rôles d'espace) sont à OpenFGA ; ici, on ne fait que
 * choisir à qui écrire.
 */
export function membresDe(base: Base, tableau: string): Map<string, Role> {
  const lignee: string[] = []
  for (let t: string | null = tableau; t !== null && !lignee.includes(t); t = base.tableau(t)?.parent ?? null) lignee.push(t)
  const membres = new Map<string, Role>()
  for (const t of lignee) {
    for (const a of base.acces(t)) membres.set(a.utilisateur, meilleurRole(membres.get(a.utilisateur) ?? null, a.role)!)
  }
  return membres
}

const plier = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Ceux que ce texte nomme avec une arobase : `@Ana Martin`, ou `@Ana` si un seul membre porte ce prénom.
 * Majuscules et accents ne comptent pas.
 */
export function mentionnes(texte: string, candidats: readonly { id: string; nom: string }[]): string[] {
  const plie = plier(texte)
  const prenom = (nom: string) => plier(nom.trim().split(/\s+/)[0] ?? '')
  const trouves: string[] = []
  for (const c of candidats) {
    const noms = [plier(c.nom.trim())]
    const p = prenom(c.nom)
    if (p.length >= 2 && candidats.filter((x) => prenom(x.nom) === p).length === 1) noms.push(p)
    const present = noms.some((n) => n && new RegExp(`(^|[^\\p{L}\\p{N}])@${echapper(n)}(?![\\p{L}\\p{N}])`, 'u').test(plie))
    if (present) trouves.push(c.id)
  }
  return trouves
}

/** Les notifications que ces changements font naître chez les autres membres du tableau. */
export function notificationsDe(
  base: Base,
  tableau: string,
  acteur: string,
  changements: readonly Changement[],
  instant: number,
): NouvelleNotification[] {
  const membres = membresDe(base, tableau)
  const autres = [...membres.keys()].filter((id) => id !== acteur)
  if (autres.length === 0) return []
  const noms = autres.flatMap((id) => {
    const u = base.utilisateurParId(id)
    return u ? [{ id, nom: u.nom }] : []
  })
  const proprietaires = autres.filter((id) => membres.get(id) === 'proprietaire')
  const sortie: NouvelleNotification[] = []
  const notifier = (destinataire: string, genre: NouvelleNotification['genre'], c: Changement, extrait: string) =>
    sortie.push({ destinataire, genre, tableau, element: c.element, auteur: acteur, extrait: court(extrait, EXTRAIT_MAX), instant })

  for (const c of changements) {
    if (c.genre === 'commente') {
      for (const m of c.messages ?? []) {
        const cites = new Set(mentionnes(m.texte, noms))
        for (const id of cites) notifier(id, 'mention', c, m.texte)
        // Le fil parle à ceux qui y ont écrit et à ceux qui tiennent le tableau.
        const voisins = new Set([...(c.participants ?? []).filter((id) => autres.includes(id)), ...proprietaires])
        for (const id of voisins) if (!cites.has(id)) notifier(id, 'commentaire', c, m.texte)
      }
    } else if (c.genre === 'deplace') {
      continue
    } else {
      for (const id of autres) notifier(id, 'modification', c, c.libelle)
    }
  }
  return sortie
}

// ---- Brancher sur la synchro ----

export interface SuiviActivite {
  /** À appeler quand un document vient d'être chargé. */
  suivre(doc: Y.Doc): void
  /** À appeler à chaque mise à jour reçue ; `acteur` : qui l'a envoyée (absent : le serveur, on ne note rien). */
  noter(tableau: string | null, doc: Y.Doc, acteur: Acteur | undefined): void
}

export function suivreActivite(base: Base, maintenant: () => number): SuiviActivite {
  const observes = new WeakMap<Y.Doc, { ramasser(): Changement[] }>()
  return {
    suivre(doc) {
      if (!observes.has(doc)) observes.set(doc, observer(doc))
    },
    noter(tableau, doc, acteur) {
      const pris = observes.get(doc)?.ramasser() ?? []
      if (!acteur || !tableau || pris.length === 0 || !base.tableau(tableau) || !base.utilisateurParId(acteur.id)) return
      const changements = sansDoublons(pris)
      const instant = maintenant()
      base.transaction(() => {
        for (const c of changements) {
          base.noterActivite(
            { tableau, auteur: acteur.id, genre: c.genre, element: c.element, typeElement: c.typeElement, libelle: c.libelle, instant },
            FENETRE_FUSION,
          )
        }
        for (const n of notificationsDe(base, tableau, acteur.id, changements, instant)) {
          base.noterNotification(n, n.genre === 'modification' ? FUSION_NOTIFICATION : undefined)
        }
      })
    },
  }
}

// ---- Regrouper pour l'affichage ----

export interface GroupeActivite {
  auteur: LigneActivite['auteur']
  debut: number
  fin: number
  /** Combien d'éléments ont reçu chaque genre de geste (un élément compte une fois, pour son geste le plus lourd). */
  resume: Partial<Record<GenreActivite, number>>
  /** Quelques-uns de ces éléments, de quoi les reconnaître. */
  elements: { element: string; genre: GenreActivite; typeElement: string; libelle: string }[]
}

/** Du plus lourd au plus léger : créer une note qu'on a aussi corrigée, c'est l'avoir créée. */
const POIDS: GenreActivite[] = ['supprime', 'cree', 'commente', 'restaure', 'modifie', 'deplace', 'titre']
export const ELEMENTS_PAR_GROUPE = 8

/**
 * Regroupe les gestes (le plus récent d'abord) : ceux d'une même personne qui se suivent, sans silence de plus de
 * `ecart`, ne font qu'une ligne.
 */
export function regrouper(lignes: readonly LigneActivite[], ecart = ECART_GROUPE): GroupeActivite[] {
  const groupes: { groupe: GroupeActivite; parElement: Map<string, LigneActivite> }[] = []
  for (const l of lignes) {
    const courant = groupes[groupes.length - 1]
    if (courant && courant.groupe.auteur.id === l.auteur.id && courant.groupe.debut - l.instant <= ecart) {
      courant.groupe.debut = Math.min(courant.groupe.debut, l.instant)
      const cle = l.element || `titre:${l.id}`
      const deja = courant.parElement.get(cle)
      if (!deja || POIDS.indexOf(l.genre) < POIDS.indexOf(deja.genre)) courant.parElement.set(cle, l)
    } else {
      groupes.push({ groupe: { auteur: l.auteur, debut: l.instant, fin: l.instant, resume: {}, elements: [] }, parElement: new Map([[l.element || `titre:${l.id}`, l]]) })
    }
  }
  return groupes.map(({ groupe, parElement }) => {
    for (const l of parElement.values()) groupe.resume[l.genre] = (groupe.resume[l.genre] ?? 0) + 1
    groupe.elements = [...parElement.values()]
      .slice(0, ELEMENTS_PAR_GROUPE)
      .map((l) => ({ element: l.element, genre: l.genre, typeElement: l.typeElement, libelle: l.libelle }))
    return groupe
  })
}
