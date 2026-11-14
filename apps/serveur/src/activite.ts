import * as Y from 'yjs'
import type { Base, GenreActivite, LigneActivite, NouvelleNotification } from './base.ts'
import { type ElementLu, texteCherchable } from './contenu.ts'
import { NOM_ARBRES, decouper, toutLire } from '../../../packages/tableau/src/coeur/arbresYjs.ts'
import { type Role, meilleurRole } from './droits.ts'

// Ce que le serveur déduit des mises à jour Yjs qu'il reçoit : qui a créé, modifié, déplacé ou jeté quoi, et qui a
// commenté où. Il n'a pas le geste, seulement l'état d'avant et d'après d'un élément : il les compare.

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

/**
 * Ce que relève une mise à jour : un geste de l'activité, ou `fil` : un fil de discussion a changé sans message neuf
 * (un message corrigé ou retiré). Celui-là ne se note nulle part ; il ne sert qu'à tenir justes les citations.
 */
export type GenreChangement = GenreActivite | 'fil'

export interface Changement {
  genre: GenreChangement
  /** L'élément touché ; vide pour le titre du tableau. */
  element: string
  typeElement: string
  libelle: string
  /** Pour un fil de discussion : lequel, dans l'élément qui le porte (voir `FilsLus`). */
  fil?: string
  /** Pour un fil : les messages arrivés avec ce changement. */
  messages?: { id: string; texte: string }[]
  /** Pour un fil : qui avait déjà écrit dedans. */
  participants?: string[]
  /**
   * Pour un fil : les messages qui ne disent plus ce que l'activité et les notifications ont pu citer d'eux, supprimés,
   * récrits, ou partis avec leur fil. `noter` retire, récrit ou déplace ces citations.
   */
  perimes?: MessagePerime[]
}

export interface MessagePerime {
  id: string
  auteur: string
  /** Ce qu'il disait. */
  texte: string
  /** Ce qu'il dit maintenant ; absent : il n'est plus dans ce fil. */
  nouveau?: string
}

const chaine = (v: unknown): string => (typeof v === 'string' ? v : '')
const nombre = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const net = (texte: string) => texte.replace(/\s+/g, ' ').trim()
const court = (texte: string, max: number) => {
  const propre = net(texte)
  return propre.length > max ? `${propre.slice(0, max - 1)}…` : propre
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

// ---- Les fils de discussion ----

/** Un message, tel que le serveur le lit dans un fil. */
interface MessageLu {
  id: string
  texte: string
  auteur: string
}

/**
 * Les fils de discussion d'un élément, par clé : `''` pour le sien (une épingle, qui est elle-même un fil, ou le fil
 * accroché à une carte), la clé d'un passage commenté pour ceux de la marge d'une note ou d'un document, le sujet pour
 * ceux d'une carte mentale. Une notification retient cette clé : c'est là que son lien mène.
 */
export type FilsLus = Map<string, MessageLu[]>

const messagesDe = (fil: unknown): MessageLu[] => {
  const brut = fil && typeof fil === 'object' ? (fil as { messages?: unknown }).messages : undefined
  return Array.isArray(brut)
    ? (brut as ({ id?: unknown; texte?: unknown; auteur?: { id?: unknown } } | null)[]).map((m) => ({
        id: chaine(m?.id),
        texte: chaine(m?.texte),
        auteur: chaine(m?.auteur?.id),
      }))
    : []
}

const estDico = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Les fils d'un dictionnaire de fils (`Note.fils`, `DocumentTexte.fils`, `Arbre.fils`), par clé. */
const filsDuDico = (dico: unknown): FilsLus => new Map(estDico(dico) ? Object.entries(dico).map(([cle, fil]) => [cle, messagesDe(fil)]) : [])

/**
 * Les fils que porte un élément sur la toile ; à la corbeille, il n'en a plus. Ceux des sujets d'une carte vivent à
 * part, dans `arbres` : `aPart` les donne.
 */
export function filsDe(s: Stocke | undefined, aPart?: FilsLus): FilsLus {
  if (!s || s.corbeille !== undefined) return new Map()
  const contenu = contenuDe(s)
  if (!contenu) return new Map()
  // L'épingle est elle-même le fil : elle n'en porte pas d'autre.
  if (contenu.type === 'commentaire') return new Map([['', messagesDe(contenu)]])
  const fils: FilsLus = new Map()
  if (estDico(s.commentaire)) fils.set('', messagesDe(s.commentaire))
  for (const [cle, messages] of filsDuDico(contenu.fils)) fils.set(cle, messages)
  for (const [cle, messages] of aPart ?? []) fils.set(cle, messages)
  return fils
}

/** Les fils des sujets de cette carte, lus dans `arbres`. */
function filsDesSujets(arbres: Y.Map<unknown>, carte: string): FilsLus {
  const fils: FilsLus = new Map()
  arbres.forEach((valeur, cle) => {
    const d = decouper(cle)
    if (d && d[0] === carte && d[1] === 'fils') fils.set(d[2], messagesDe(valeur))
  })
  return fils
}

/**
 * Ce qui a changé d'un état des fils d'un élément à l'autre, fil par fil : les messages arrivés (`commente`, avec qui
 * y avait déjà écrit), et ceux qui ne disent plus ce qu'on a pu citer d'eux (`perimes`), supprimés, récrits ou partis.
 * Rien d'autre n'en sort : une réaction, un fil résolu, replié ou recoloré ne changent rien à ce qui s'y est dit.
 */
export function differenceDesFils(element: string, typeElement: string, avant: FilsLus, apres: FilsLus): Changement[] {
  const sortie: Changement[] = []
  for (const fil of new Set([...avant.keys(), ...apres.keys()])) {
    const anciens = avant.get(fil) ?? []
    const restants = new Map((apres.get(fil) ?? []).map((m) => [m.id, m]))
    const connus = new Set(anciens.map((m) => m.id))
    const neufs = [...restants.values()].filter((m) => !connus.has(m.id))
    const perimes = anciens.flatMap((m): MessagePerime[] => {
      const reste = restants.get(m.id)
      if (reste && net(reste.texte) === net(m.texte)) return []
      return [{ id: m.id, auteur: m.auteur, texte: m.texte, ...(reste ? { nouveau: reste.texte } : {}) }]
    })
    const commun = { element, typeElement, fil, ...(perimes.length > 0 ? { perimes } : {}) }
    if (neufs.length > 0) {
      sortie.push({
        genre: 'commente',
        ...commun,
        libelle: court(neufs[neufs.length - 1]!.texte, LIBELLE_MAX),
        messages: neufs.map((m) => ({ id: m.id, texte: m.texte })),
        participants: [...new Set(anciens.map((m) => m.auteur).filter(Boolean))],
      })
    } else if (perimes.length > 0) sortie.push({ genre: 'fil', ...commun, libelle: '' })
  }
  return sortie
}

/**
 * Les fils d'un élément d'un état à l'autre (`differenceDesFils`). Jeté ou retiré, l'élément emporte les siens ; revenu
 * de la corbeille, il n'en rapporte aucun message neuf : on ne prévient pas deux fois.
 */
export function comparerFils(id: string, avant: Stocke | undefined, apres: Stocke | undefined, aPart?: FilsLus): Changement[] {
  if (avant && avant.corbeille !== undefined) return []
  const type = (apres && contenuDe(apres)?.type) || (avant && contenuDe(avant)?.type) || ''
  return differenceDesFils(id, type, filsDe(avant, aPart), filsDe(apres, aPart))
}

/** Le contenu sans les fils de la marge (d'une note, d'un document) : y commenter ne modifie pas l'élément. */
function horsFils(c: ElementLu['contenu'] | null): ElementLu['contenu'] | null {
  if (!c || c.type === 'commentaire' || !('fils' in c)) return c
  const { fils: _, ...reste } = c
  return reste as ElementLu['contenu']
}

/**
 * Ce qui a changé d'un élément lui-même entre `avant` et `apres` (absent : n'existait pas, n'existe plus), ou `null`.
 * Ses fils de discussion n'en sont pas : `comparerFils` les suit.
 */
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
    // Une épingle n'existe qu'à son premier message, que ses fils disent.
    if (contenuDe(apres)?.type === 'commentaire') return null
    return decrire(apres, 'cree')
  }
  if (!apres) return aLaCorbeille(avant) ? null : decrire(avant, 'supprime')
  if (!aLaCorbeille(avant) && aLaCorbeille(apres)) return decrire(avant, 'supprime')
  if (aLaCorbeille(avant) && !aLaCorbeille(apres)) return decrire(apres, 'restaure')
  if (aLaCorbeille(apres)) return null

  const c0 = contenuDe(avant)
  const c1 = contenuDe(apres)
  if (JSON.stringify(horsFils(c0)) !== JSON.stringify(horsFils(c1))) {
    // Un message de plus dans une épingle est un commentaire, que ses fils disent.
    if (c1?.type === 'commentaire') {
      const connus = new Set(messagesDe(c0).map((m) => m.id))
      if (messagesDe(c1).some((m) => !connus.has(m.id))) return null
    }
    return decrire(apres, 'modifie')
  }
  const loin = Math.hypot(nombre(apres.x) - nombre(avant.x), nombre(apres.y) - nombre(avant.y)) >= DEPLACEMENT_MIN
  if (loin || chaine(apres.parent) !== chaine(avant.parent)) return decrire(apres, 'deplace')
  return null
}

/** Tout ce qu'un élément change d'un état à l'autre : lui-même (`comparer`), puis ses fils (`comparerFils`). */
export function changementsDe(id: string, avant: Stocke | undefined, apres: Stocke | undefined, aPart?: FilsLus): Changement[] {
  const c = comparer(id, avant, apres)
  return [...(c ? [c] : []), ...comparerFils(id, avant, apres, aPart)]
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
  const arbres = doc.getMap<unknown>(NOM_ARBRES)
  let attente: Changement[] = []

  elements.observe((evenement) => {
    for (const [id, cle] of evenement.changes.keys) {
      const avant = cle.oldValue as Stocke | undefined
      const apres = cle.action === 'delete' ? undefined : elements.get(id)
      // Les fils des sujets d'une carte vivent à part et ne changent pas avec elle : jetée, elle les emporte.
      const carte = [avant, apres].some((s) => !!s && contenuDe(s)?.type === 'arbre')
      attente.push(...changementsDe(id, avant, apres, carte ? filsDesSujets(arbres, id) : undefined))
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
  // Le fil d'un sujet n'est pas la carte : y écrire est un commentaire, y réagir n'est rien.
  arbres.observe((evenement) => {
    const cartes = new Set<string>()
    for (const [cle, change] of evenement.changes.keys) {
      const d = decouper(cle)
      if (!d) continue
      const [carte, champ, sujet] = d
      if (champ !== 'fils') {
        cartes.add(carte)
        continue
      }
      const s = elements.get(carte)
      // Une carte à la corbeille a déjà emporté ses fils ; partie pour de bon, elle emporte ce qui en restait.
      if (s && s.corbeille !== undefined) continue
      const un = (fil: unknown): FilsLus => new Map(fil === undefined ? [] : [[sujet, messagesDe(fil)]])
      const avant = change.action === 'add' ? undefined : change.oldValue
      const apres = change.action === 'delete' || !s ? undefined : arbres.get(cle)
      attente.push(...differenceDesFils(carte, 'arbre', un(avant), un(apres)))
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

/**
 * Un changement par élément, par fil et par genre : une rafale de frappes n'en fait qu'un. Les messages arrivés et ceux
 * qui ne disent plus la même chose s'additionnent, dans l'ordre : un message récrit deux fois l'est jusqu'à sa dernière
 * version.
 */
export function sansDoublons(changements: readonly Changement[]): Changement[] {
  const dernier = new Map<string, Changement>()
  for (const c of changements) {
    const cle = `${c.element}|${c.fil ?? ''}|${c.genre}`
    const avant = dernier.get(cle)
    const fondu = avant?.messages ? { ...c, messages: [...avant.messages, ...(c.messages ?? [])], participants: avant.participants } : c
    const perimes = [...(avant?.perimes ?? []), ...(c.perimes ?? [])]
    dernier.set(cle, perimes.length > 0 ? { ...fondu, perimes } : fondu)
  }
  return [...dernier.values()]
}

/** Où se lit un message : son fil, dans l'élément qui le porte. */
export interface Place {
  element: string
  fil: string
  typeElement: string
  auteur: string
  texte: string
}

/** Les messages de tous les fils du document, hors corbeille, et où chacun se lit. */
export function messagesDuDocument(doc: Y.Doc): Map<string, Place[]> {
  const arbres = toutLire(doc.getMap<unknown>(NOM_ARBRES))
  const places = new Map<string, Place[]>()
  doc.getMap<Stocke>('elements').forEach((s, element) => {
    if (!estDico(s)) return
    const typeElement = contenuDe(s)?.type ?? ''
    const aPart = typeElement === 'arbre' ? filsDuDico(arbres.get(element)?.fils) : undefined
    for (const [fil, messages] of filsDe(s, aPart)) {
      for (const m of messages) places.set(m.id, [...(places.get(m.id) ?? []), { element, fil, typeElement, auteur: m.auteur, texte: m.texte }])
    }
  })
  return places
}

/**
 * Un message n'est neuf qu'une fois. Passé d'un fil à un autre (une épingle lâchée sur une carte, un fil glissé d'une
 * carte à l'autre, le passage détaché sur sa note), revenu d'une suppression qu'on annule ou recopié avec sa carte, il
 * garde son identifiant : déjà vu dans ce document (`vus`, que la fonction tient à jour), il ne prévient personne.
 */
export function sansLesDejaVus(changements: readonly Changement[], vus: Set<string>): Changement[] {
  return changements.flatMap((c): Changement[] => {
    if (c.genre !== 'commente' || !c.messages) return [c]
    const neufs = c.messages.filter((m) => !vus.has(m.id))
    for (const m of neufs) vus.add(m.id)
    if (neufs.length === c.messages.length) return [c]
    if (neufs.length > 0) return [{ ...c, messages: neufs, libelle: court(neufs[neufs.length - 1]!.texte, LIBELLE_MAX) }]
    const { messages: _, participants: __, ...reste } = c
    return reste.perimes ? [{ ...reste, genre: 'fil', libelle: '' }] : []
  })
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

/**
 * Les notifications que ces changements font naître chez les autres membres du tableau. Un commentaire, où qu'il soit
 * (une épingle, le fil d'une carte, la marge d'une note ou d'un document, un sujet de carte mentale), prévient ceux qui
 * ont écrit dans son fil, ceux qui tiennent le tableau, et ceux qu'il nomme.
 */
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
    sortie.push({ destinataire, genre, tableau, element: c.element, fil: c.fil ?? '', auteur: acteur, extrait: court(extrait, EXTRAIT_MAX), instant })

  for (const c of changements) {
    if (c.genre === 'commente') {
      for (const m of c.messages ?? []) {
        const cites = new Set(mentionnes(m.texte, noms))
        for (const id of cites) notifier(id, 'mention', c, m.texte)
        // Le fil parle à ceux qui y ont écrit et à ceux qui tiennent le tableau.
        const voisins = new Set([...(c.participants ?? []).filter((id) => autres.includes(id)), ...proprietaires])
        for (const id of voisins) if (!cites.has(id)) notifier(id, 'commentaire', c, m.texte)
      }
    } else if (c.genre === 'deplace' || c.genre === 'fil') {
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
  /**
   * À appeler à chaque mise à jour reçue ; `acteur` : qui l'a envoyée. Absent (le serveur, un visiteur), rien ne
   * s'ajoute à l'activité, mais un message qu'elle a fait disparaître n'y est plus cité.
   */
  noter(tableau: string | null, doc: Y.Doc, acteur: Acteur | undefined): void
  /** Oublie ce qui a été observé et pas encore noté : un geste refusé puis annulé ne laisse pas d'activité. */
  oublier(doc: Y.Doc): void
}

export function suivreActivite(base: Base, maintenant: () => number): SuiviActivite {
  // Par document : ce qui change, et les messages qu'il a déjà portés depuis qu'il est chargé (`sansLesDejaVus`).
  const observes = new WeakMap<Y.Doc, { ramasser(): Changement[]; vus: Set<string> }>()
  return {
    suivre(doc) {
      if (!observes.has(doc)) observes.set(doc, { ramasser: observer(doc).ramasser, vus: new Set(messagesDuDocument(doc).keys()) })
    },
    oublier(doc) {
      observes.get(doc)?.ramasser()
    },
    noter(tableau, doc, acteur) {
      const suivi = observes.get(doc)
      const pris = suivi?.ramasser() ?? []
      if (!suivi || !tableau || pris.length === 0 || !base.tableau(tableau)) return
      const changements = sansLesDejaVus(sansDoublons(pris), suivi.vus)
      // Où se lit chaque message, maintenant : de quoi suivre un fil déplacé, et reconnaître un texte encore dit.
      const places = changements.some((c) => c.perimes) ? messagesDuDocument(doc) : null
      const qui = acteur && base.utilisateurParId(acteur.id) ? acteur : undefined
      if (!qui && !changements.some((c) => c.perimes)) return
      const instant = maintenant()
      base.transaction(() => {
        if (qui) {
          for (const c of changements) {
            if (c.genre === 'fil') continue
            base.noterActivite(
              { tableau, auteur: qui.id, genre: c.genre, element: c.element, typeElement: c.typeElement, libelle: c.libelle, instant },
              FENETRE_FUSION,
            )
          }
          for (const n of notificationsDe(base, tableau, qui.id, changements, instant)) {
            base.noterNotification(n, n.genre === 'modification' ? FUSION_NOTIFICATION : undefined)
          }
        }
        // Après ce qui vient d'être cité : un message écrit puis supprimé dans la même rafale ne reste pas cité.
        if (places) tenirLesCitations(base, tableau, places, changements)
      })
    },
  }
}

/**
 * Ce que l'activité et les notifications citaient de messages qui ne le disent plus là : un message parti n'y est plus
 * cité (`Base.retirerCitation`), un message récrit l'est dans sa nouvelle version, un message passé dans un autre fil
 * l'est là où il se lit maintenant. Un texte que son auteur dit encore dans cet élément, tel qu'est le document
 * maintenant, reste cité tel quel : rien ne dit laquelle des citations visait ce message, et ce qu'elle dit s'y lit.
 */
function tenirLesCitations(base: Base, tableau: string, places: ReadonlyMap<string, readonly Place[]>, changements: readonly Changement[]) {
  for (const c of changements) {
    for (const p of c.perimes ?? []) {
      // Un texte vide ne cite rien, et désignerait les lignes dont la citation est déjà partie.
      if (!net(p.texte)) continue
      const citation = { element: c.element, fil: c.fil ?? '', auteur: p.auteur, libelle: court(p.texte, LIBELLE_MAX), extrait: court(p.texte, EXTRAIT_MAX) }
      const ailleurs = p.nouveau === undefined ? places.get(p.id)?.[0] : undefined
      if (ailleurs) base.deplacerCitation(tableau, citation, ailleurs)
      else if (ditEncore(places, c.element, p.auteur, p.texte)) continue
      else if (p.nouveau === undefined) base.retirerCitation(tableau, citation)
      else base.remplacerCitation(tableau, citation, { libelle: court(p.nouveau, LIBELLE_MAX), extrait: court(p.nouveau, EXTRAIT_MAX) })
    }
  }
}

/** Cet auteur dit ce texte dans un fil de cet élément, tel qu'est le document maintenant. */
const ditEncore = (places: ReadonlyMap<string, readonly Place[]>, element: string, auteur: string, texte: string) =>
  [...places.values()].some((liste) => liste.some((p) => p.element === element && p.auteur === auteur && net(p.texte) === net(texte)))

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
