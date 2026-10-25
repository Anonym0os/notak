import type { Magasin } from './magasin'
import { type Id, type Operation, type Tableau, appliquer } from './tableau'

// Les droits sur les éléments d'un tableau, lus des deux côtés : le serveur contrôle chaque mise à jour reçue par la
// synchro, la toile ne propose que ce que le serveur acceptera. Deux gestes seulement : écrire (tout changement) et
// commenter (un fil de discussion, ses réponses, des réactions). Un élément ne se cache pas : qui lit le tableau le lit.

export type Geste = 'ecriture' | 'commentaire'
export type RoleTableau = 'lecture' | 'commentaire' | 'edition' | 'proprietaire'

/** Ce que ce compte peut faire sur un tableau, et sur ceux de ses éléments qui ont leurs propres droits. */
export interface DroitsTableau {
  role: RoleTableau
  elements: Record<Id, { ecrire: boolean; commenter: boolean }>
}

/** Ce geste est-il permis sur cet élément (`null` : sur le tableau lui-même, son titre, son fond, ses étiquettes) ? */
export function permis(droits: DroitsTableau, element: Id | null, geste: Geste): boolean {
  const propre = element === null ? undefined : droits.elements[element]
  if (propre) return geste === 'ecriture' ? propre.ecrire : propre.commenter
  const rang = ['lecture', 'commentaire', 'edition', 'proprietaire'].indexOf(droits.role)
  return geste === 'ecriture' || element === null ? rang >= 2 : rang >= 1
}

type Brut = Record<string, unknown>
const objet = (v: unknown): Brut | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Brut) : undefined)
const egal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const estFil = (e: Brut | undefined) => objet(e?.contenu)?.type === 'commentaire'
const auteurDe = (m: unknown) => objet(objet(m)?.auteur)?.id

/** Les réactions n'ont changé que de celles de `auteur` : on réagit pour soi, pas à la place des autres. */
function reactionsDeSoi(avant: unknown, apres: unknown, auteur: string): boolean {
  const a = objet(avant) ?? {}
  const b = objet(apres) ?? {}
  for (const emoji of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const sans = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x !== auteur) : [])
    if (!egal(sans(a[emoji]), sans(b[emoji]))) return false
  }
  return true
}

/**
 * Un fil n'a changé qu'en ce qu'un commentateur peut y faire : les messages des autres restent tels quels (sauf leurs
 * réactions, pour la part de `auteur`), les nouveaux sont de lui, et ses propres messages sont à lui d'écrire.
 */
function filDeSoi(avant: unknown, apres: unknown, auteur: string): boolean {
  const messages = (f: unknown) => (Array.isArray(objet(f)?.messages) ? (objet(f)!.messages as unknown[]) : [])
  const apresParId = new Map(messages(apres).map((m) => [objet(m)?.id, m]))
  const avantParId = new Map(messages(avant).map((m) => [objet(m)?.id, m]))
  for (const [id, m] of avantParId) {
    if (auteurDe(m) === auteur) continue
    const suite = apresParId.get(id)
    if (suite === undefined) return false
    const { reactions: ra, ...ma } = objet(m) ?? {}
    const { reactions: rb, ...mb } = objet(suite) ?? {}
    if (!egal(ma, mb) || !reactionsDeSoi(ra, rb, auteur)) return false
  }
  for (const [id, m] of apresParId) if (!avantParId.has(id) && auteurDe(m) !== auteur) return false
  return true
}

/**
 * Ce que demande le passage d'un élément de `avant` à `apres` (des éléments stockés, `undefined` s'il n'existe pas),
 * fait par `auteur` : commenter suffit pour un fil (le créer, y répondre, le déplacer, le résoudre, le supprimer s'il
 * n'a que ses messages) et pour le fil ou les réactions accrochés à un autre élément ; tout le reste est écrire.
 */
export function gesteSurElement(avant: unknown, apres: unknown, auteur: string): Geste {
  const a = objet(avant)
  const b = objet(apres)
  if (!a && !b) return 'commentaire'
  if (estFil(a) || estFil(b)) {
    if (a && b && !estFil(a)) return 'ecriture'
    return filDeSoi(a?.contenu, b?.contenu, auteur) ? 'commentaire' : 'ecriture'
  }
  if (!a || !b) return 'ecriture'
  for (const cle of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (egal(a[cle], b[cle])) continue
    if (cle === 'commentaire' && filDeSoi(a[cle], b[cle], auteur)) continue
    if (cle === 'reactions' && reactionsDeSoi(a[cle], b[cle], auteur)) continue
    return 'ecriture'
  }
  return 'commentaire'
}

/** Les éléments que touchent ces pas, et si le tableau lui-même est touché (étiquettes, fond). */
function touches(pas: readonly Operation[]): { ids: Set<Id>; tableau: boolean } {
  const ids = new Set<Id>()
  let tableau = false
  for (const op of pas) {
    if (op.type === 'creer' || op.type === 'supprimer') ids.add(op.element.id)
    else if (op.type === 'etiquettes' || op.type === 'fond') tableau = true
    else ids.add(op.id)
  }
  return { ids, tableau }
}

/** Ces pas sont-ils permis, d'après l'état `t` du tableau ? */
export function pasPermis(t: Tableau, pas: readonly Operation[], droits: DroitsTableau, auteur: string): boolean {
  const { ids, tableau } = touches(pas)
  if (tableau && !permis(droits, null, 'ecriture')) return false
  const apres = pas.reduce(appliquer, t)
  for (const id of ids) {
    const avant = t.elements.find((e) => e.id === id)
    const suite = apres.elements.find((e) => e.id === id)
    if (!permis(droits, id, gesteSurElement(avant, suite, auteur))) return false
  }
  return true
}

/**
 * Le magasin tel que ce compte peut l'écrire : un geste n'y passe que s'il est permis en entier (le serveur refuserait
 * le reste, et l'annulerait chez tout le monde). `refus` est appelé quand un geste est écarté.
 */
export function filtrerMagasin(m: Magasin, droits: () => DroitsTableau, auteur: () => string, refus?: () => void): Magasin {
  const garder = (f: (pas: Operation[]) => void) => (pas: Operation[]) => {
    if (pasPermis(m.lire(), pas, droits(), auteur())) f(pas)
    else refus?.()
  }
  return {
    ...m,
    faire: garder((p) => m.faire(p)),
    appliquerSeulement: garder((p) => m.appliquerSeulement(p)),
    inscrire: garder((p) => m.inscrire(p)),
    corriger: garder((p) => m.corriger(p)),
    remplacer() {},
  }
}
