import { type Id, type NoeudTexte, texteBrut } from '../../../coeur/tableau'
import { type Lecture, enfantsDe } from './sujets'

/**
 * Ce que le panneau de gauche et la barre du bas lisent d'une carte : les comptes, les notes, les étiquettes, les
 * marqueurs et les tâches. Des fonctions pures sur la carte lue.
 */

/** Les sujets dans l'ordre où l'on lit la carte : le central, ses branches, puis les flottants. */
export function ordreDeLecture(l: Lecture): Id[] {
  const sortie: Id[] = []
  const vus = new Set<Id>()
  const parcourir = (id: Id) => {
    if (vus.has(id)) return
    vus.add(id)
    sortie.push(id)
    for (const e of enfantsDe(l, id)) parcourir(e)
    for (const r of l.resumes) if (l.sujets.get(r)?.parent === id) parcourir(r)
  }
  if (l.central) parcourir(l.central)
  for (const f of l.flottants) parcourir(f)
  return sortie
}

const compterMots = (texte: string) => texte.split(/\s+/).filter(Boolean).length

/** Le compte du popover : les sujets, et les mots et caractères de leurs titres et de leurs notes. */
export function comptes(l: Lecture): { sujets: number; mots: number; caracteres: number } {
  let mots = 0
  let caracteres = 0
  for (const s of l.sujets.values()) {
    const texte = [s.titre, s.note ? texteBrut(s.note) : ''].filter(Boolean).join('\n')
    mots += compterMots(texte)
    caracteres += [...texte.replace(/\s/g, '')].length
  }
  return { sujets: l.sujets.size, mots, caracteres }
}

export interface NoteDeCarte {
  id: Id
  titre: string
  texte: string
}

/** Les sujets qui portent une note, avec son texte, dans l'ordre de lecture. */
export function notesDe(l: Lecture): NoteDeCarte[] {
  const sortie: NoteDeCarte[] = []
  for (const id of ordreDeLecture(l)) {
    const s = l.sujets.get(id)
    const texte = s?.note ? texteBrut(s.note as NoeudTexte).trim() : ''
    if (s && texte) sortie.push({ id, titre: s.titre.replace(/\n/g, ' '), texte })
  }
  return sortie
}

export interface OptionsRecherche {
  motsEntiers?: boolean
  casse?: boolean
}

const sansAccent = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '')

/** Le texte contient la requête. Sans accents ni capitales par défaut ; « mots entiers » et « casse » les rendent exacts. */
export function contient(texte: string, requete: string, { motsEntiers, casse }: OptionsRecherche = {}): boolean {
  const q = requete.trim()
  if (!q) return true
  const norm = (s: string) => (casse ? s : sansAccent(s).toLowerCase())
  const [t, r] = [norm(texte), norm(q)]
  if (!motsEntiers) return t.includes(r)
  const echappe = r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\p{L}\\p{N}_])${echappe}($|[^\\p{L}\\p{N}_])`, 'u').test(t)
}

/** Les notes qui répondent à la requête (dans leur titre ou leur texte). */
export const notesFiltrees = (notes: readonly NoteDeCarte[], requete: string, options?: OptionsRecherche): NoteDeCarte[] =>
  notes.filter((n) => contient(`${n.titre}\n${n.texte}`, requete, options))

export interface GroupeDeSujets {
  /** L'étiquette, l'identifiant du marqueur ou `a-faire`/`faite`. */
  cle: string
  ids: Id[]
}

export interface Reperes {
  marqueurs: GroupeDeSujets[]
  etiquettes: GroupeDeSujets[]
  taches: GroupeDeSujets[]
}

/** Les marqueurs, étiquettes et tâches de la carte, chacun avec les sujets qui le portent. */
export function reperesDe(l: Lecture): Reperes {
  const marqueurs = new Map<string, Id[]>()
  const etiquettes = new Map<string, Id[]>()
  const taches = new Map<string, Id[]>()
  const poser = (m: Map<string, Id[]>, cle: string, id: Id) => m.set(cle, [...(m.get(cle) ?? []), id])
  for (const id of ordreDeLecture(l)) {
    const s = l.sujets.get(id)!
    for (const m of s.marqueurs ?? []) poser(marqueurs, m, id)
    for (const e of new Set(s.etiquettes ?? [])) poser(etiquettes, e, id)
    if (s.tache) poser(taches, s.tache, id)
  }
  const groupes = (m: Map<string, Id[]>) => [...m].map(([cle, ids]) => ({ cle, ids }))
  return {
    marqueurs: groupes(marqueurs),
    etiquettes: groupes(etiquettes).sort((a, b) => a.cle.localeCompare(b.cle)),
    taches: groupes(taches).sort((a, b) => (a.cle === b.cle ? 0 : a.cle === 'a-faire' ? -1 : 1)),
  }
}

/** Les sujets à mettre en évidence pour ces repères cochés (une clé `marqueur:…`, `etiquette:…` ou `tache:…`). */
export function sujetsMisEnEvidence(r: Reperes, coches: ReadonlySet<string>): Set<Id> {
  const ids = new Set<Id>()
  const ajouter = (type: string, gs: GroupeDeSujets[]) => {
    for (const g of gs) if (coches.has(`${type}:${g.cle}`)) for (const id of g.ids) ids.add(id)
  }
  ajouter('marqueur', r.marqueurs)
  ajouter('etiquette', r.etiquettes)
  ajouter('tache', r.taches)
  return ids
}
