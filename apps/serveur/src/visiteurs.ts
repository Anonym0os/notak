import { createHash } from 'node:crypto'
import type * as Y from 'yjs'
import { PREFIXE_VISITEUR, gesteSurElement } from '../../../packages/tableau/src/coeur/reglesDroits.ts'
import { COULEURS } from './comptes.ts'

// Ce qu'un visiteur, sans compte, écrit par un lien qui permet de commenter. Il ne touche jamais au document Yjs :
// il envoie les éléments qu'il a changés, tels qu'il les voit (`/api/public/<jeton>/commentaires`), et le serveur n'en
// retient que les fils : une épingle de commentaire (sa place, sa taille, son fil), ou le fil et les réactions
// accrochés à un élément. Le reste est relu champ par champ, borné, puis jugé par la règle du commentateur
// (`gesteSurElement`) : il ajoute ses messages, modifie et retire les siens, réagit pour lui ; rien de plus.

/** La clé qu'un navigateur de visiteur tire une fois et garde : elle seule lui rend ses messages. */
export const CLE_VISITEUR = /^[A-Za-z0-9_-]{32,128}$/
export const NOM_VISITEUR_MAX = 60
export const TEXTE_MESSAGE_MAX = 5000
/** Combien d'éléments un même envoi peut changer : un geste de commentaire n'en touche qu'un ou deux. */
export const CHANGEMENTS_MAX = 5
const ID = /^[A-Za-z0-9_-]{1,64}$/
const MESSAGES_MAX = 300
const COULEUR_FIL = /^[a-z]{1,16}$/
const POSITION_MAX = 15_000

export interface AuteurVisiteur {
  id: string
  nom: string
  couleur: string
}

/** Le visiteur de ce lien qui garde cette clé : un identifiant stable, qui ne révèle ni la clé ni le lien. */
export function auteurVisiteur(lien: string, cle: string, nom: string): AuteurVisiteur {
  const empreinte = createHash('sha256').update(`${lien}:${cle}`).digest()
  return { id: `${PREFIXE_VISITEUR}${empreinte.toString('base64url').slice(0, 22)}`, nom, couleur: COULEURS[empreinte[0]! % COULEURS.length]! }
}

/** Le nom qu'un visiteur s'est donné, propre : une ligne, sans caractère de contrôle, borné. `''` s'il n'en reste rien. */
export const nomVisiteur = (v: unknown): string =>
  typeof v === 'string' ? v.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, NOM_VISITEUR_MAX) : ''

type Brut = Record<string, unknown>
const objet = (v: unknown): Brut | undefined => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Brut) : undefined)
const nombre = (v: unknown, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined
const chaine = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.length <= max ? v : undefined)

/** Des réactions bien formées (émoji → qui), ou `undefined`. */
function reactions(v: unknown): Record<string, string[]> | undefined {
  const r = objet(v)
  if (!r) return undefined
  const cles = Object.keys(r)
  if (cles.length > 40) return undefined
  const propres: Record<string, string[]> = {}
  for (const emoji of cles) {
    const qui = r[emoji]
    if (emoji.length > 32 || !Array.isArray(qui) || qui.length > 500 || !qui.every((x) => chaine(x, 200) !== undefined)) return undefined
    propres[emoji] = qui as string[]
  }
  return propres
}

type Message = { id: string; auteur: Brut; date: number; texte: string; riche?: unknown; reactions?: Record<string, string[]> }

/** Un message bien formé, tel qu'il est stocké, ou `undefined`. Ses champs inconnus tombent. */
function message(v: unknown): Message | undefined {
  const m = objet(v)
  const a = objet(m?.auteur)
  const id = chaine(m?.id, 64)
  const date = nombre(m?.date, 0, Number.MAX_SAFE_INTEGER)
  const texte = chaine(m?.texte, TEXTE_MESSAGE_MAX * 4)
  if (!m || !a || !id || !ID.test(id) || date === undefined || texte === undefined) return undefined
  const auteur: Brut = { id: chaine(a.id, 200), nom: chaine(a.nom, 200) }
  if (auteur.id === undefined || auteur.nom === undefined) return undefined
  if (a.couleur !== undefined) auteur.couleur = chaine(a.couleur, 20)
  const propre: Message = { id, auteur, date, texte }
  if (m.riche !== undefined) propre.riche = m.riche
  if (m.reactions !== undefined) {
    const r = reactions(m.reactions)
    if (!r) return undefined
    propre.reactions = r
  }
  return propre
}

/**
 * Le fil tel que le visiteur l'a laissé, rebâti sur celui que garde le serveur (`avant`) : les messages des autres
 * restent tels quels et à leur place, il n'y change que ses propres réactions ; les siens reprennent son nom et sa
 * couleur, perdent leur mise en forme (un texte simple, dont les adresses web restent cliquables), et un message neuf
 * prend l'heure du serveur et se range à la fin. `undefined` : un fil mal formé, ou qui touche à ce qui n'est pas à lui.
 */
function fil(v: unknown, avant: Brut | undefined, auteur: AuteurVisiteur, maintenant: number): Brut | undefined {
  const f = objet(v)
  if (f?.type !== 'commentaire' || !Array.isArray(f.messages) || f.messages.length > MESSAGES_MAX) return undefined
  const vus = new Map<string, Message>()
  for (const brut of f.messages) {
    const m = message(brut)
    if (!m || vus.has(m.id)) return undefined
    vus.set(m.id, m)
  }
  const signe = (m: Message, date: number): Message | undefined => {
    const texte = m.texte.trim()
    if (!texte || texte.length > TEXTE_MESSAGE_MAX) return undefined
    const { riche: _, ...reste } = m
    return { ...reste, texte, auteur: { ...auteur }, date }
  }
  const messages: unknown[] = []
  const anciens = Array.isArray(avant?.messages) ? avant.messages : []
  for (const brut of anciens) {
    const garde = objet(brut)
    const id = garde?.id
    if (!garde || typeof id !== 'string') continue
    const vu = vus.get(id)
    vus.delete(id)
    if (objet(garde.auteur)?.id === auteur.id) {
      // Le sien : modifié, ou retiré s'il n'est plus là.
      if (!vu) continue
      if (vu.auteur.id !== auteur.id) return undefined
      const propre = signe(vu, garde.date as number)
      if (!propre) return undefined
      messages.push(propre)
      continue
    }
    if (!vu || vu.auteur.id === auteur.id) return undefined
    const { reactions: _, ...reste } = garde
    messages.push(vu.reactions ? { ...reste, reactions: vu.reactions } : reste)
  }
  for (const m of vus.values()) {
    if (m.auteur.id !== auteur.id) return undefined
    const propre = signe(m, maintenant)
    if (!propre) return undefined
    messages.push(propre)
  }
  const propre: Brut = { type: 'commentaire', messages }
  if (f.resolu === true) propre.resolu = true
  if (f.replie === true) propre.replie = true
  if (f.couleur !== undefined) {
    if (typeof f.couleur !== 'string' || !COULEUR_FIL.test(f.couleur)) return undefined
    propre.couleur = f.couleur
  }
  if (f.epingle !== undefined) {
    const e = objet(f.epingle)
    const x = nombre(e?.x, -10_000, 10_000)
    const y = nombre(e?.y, -10_000, 10_000)
    if (x === undefined || y === undefined) return undefined
    propre.epingle = { x, y }
  }
  return propre
}

/** La clé de plan juste au-dessus de tout : le dessus de l'empilement, comme `cleEntre(a, undefined)` de la toile. */
const ALPHABET_PLAN = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
function planApres(a: string): string {
  const da = a ? ALPHABET_PLAN.indexOf(a[0]!) : 0
  if (ALPHABET_PLAN.length - da > 1) return ALPHABET_PLAN[(da + ALPHABET_PLAN.length) >> 1]!
  return ALPHABET_PLAN[da]! + planApres(a.slice(1))
}

export type RefusVisiteur = 'invalide' | 'interdit'

/**
 * Ce que deviennent les éléments changés par le visiteur, une fois relus et jugés : de quoi les écrire tous d'un coup,
 * ou la raison du refus (rien ne s'écrit alors). `ouverts` : les éléments qu'il peut commenter (ceux qu'il voit, sans
 * ceux qui ont leurs propres droits).
 */
export function jugerChangements(
  stockes: { get(id: string): unknown },
  changements: unknown,
  ouverts: ReadonlySet<string>,
  auteur: AuteurVisiteur,
  maintenant: number,
): Map<string, Brut | null> | RefusVisiteur {
  if (!Array.isArray(changements) || changements.length === 0 || changements.length > CHANGEMENTS_MAX) return 'invalide'
  const ecrits = new Map<string, Brut | null>()
  for (const brut of changements) {
    const ch = objet(brut)
    const id = chaine(ch?.id, 64)
    if (!ch || !id || !ID.test(id) || ecrits.has(id) || !('apres' in ch)) return 'invalide'
    const avant = objet(stockes.get(id))
    // Un élément qu'il ne voit pas, ou qui a ses propres droits, n'est pas à lui de commenter.
    if (avant && !ouverts.has(id)) return 'interdit'
    const vu = ch.apres === null ? null : objet(ch.apres)
    if (vu === undefined) return 'invalide'
    const epingle = objet(avant?.contenu)?.type === 'commentaire' || (!avant && objet(vu?.contenu)?.type === 'commentaire')
    let apres: Brut | null
    if (epingle) {
      if (vu === null) apres = null
      else {
        const x = nombre(vu.x, -POSITION_MAX, POSITION_MAX)
        const y = nombre(vu.y, -POSITION_MAX, POSITION_MAX)
        const largeur = nombre(vu.largeur, 4, 200)
        const contenu = fil(vu.contenu, objet(avant?.contenu), auteur, maintenant)
        if (x === undefined || y === undefined || largeur === undefined || !contenu) return 'invalide'
        // Une épingle neuve dit quelque chose : un fil vide n'a rien à faire dans le document.
        if (!avant && (contenu.messages as unknown[]).length === 0) return 'invalide'
        apres = { ...(avant ?? { id }), x, y, largeur, contenu }
      }
    } else {
      if (!avant || vu === null) return 'interdit'
      apres = { ...avant }
      if (vu.commentaire === undefined) delete apres.commentaire
      else {
        const f = fil(vu.commentaire, objet(avant.commentaire), auteur, maintenant)
        if (!f) return 'invalide'
        apres.commentaire = f
      }
      if (vu.reactions === undefined) delete apres.reactions
      else {
        const r = reactions(vu.reactions)
        if (!r) return 'invalide'
        apres.reactions = r
      }
    }
    if (gesteSurElement(avant, apres ?? undefined, auteur.id) !== 'commentaire') return 'interdit'
    ecrits.set(id, apres)
  }
  return ecrits
}

/** Écrit dans le document ce que `jugerChangements` a retenu, d'une seule transaction. */
export function ecrireChangements(doc: Y.Doc, ecrits: ReadonlyMap<string, Record<string, unknown> | null>): void {
  const stockes = doc.getMap<Record<string, unknown>>('elements')
  doc.transact(() => {
    let plan = ''
    stockes.forEach((e) => {
      if (typeof e.plan === 'string' && e.plan > plan) plan = e.plan
    })
    for (const [id, e] of ecrits) {
      if (e === null) stockes.delete(id)
      else if (typeof e.plan === 'string') stockes.set(id, e)
      else {
        plan = planApres(plan)
        stockes.set(id, { ...e, plan })
      }
    }
  })
}
