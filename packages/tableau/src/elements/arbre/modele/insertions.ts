import { cleEntre } from '../../../coeur/ordre'
import { langue, t } from '../../../langue'
import { type Arbre, type GroupeMarqueurs, type Id, type Sujet, type Zone, nouvelId } from '../../../coeur/tableau'
import { GROUPES_MARQUEURS, estPerso } from '../marqueurs'
import { groupeDuMarqueur, porter } from './elements'
import { type Lecture, branche, changerSujet, enfantsDe, lire, profondeur } from './sujets'

/**
 * Ce que la barre d'outils et le menu « + » posent sur une carte (docs/XMIND.md § 15) : zones, tâches planifiées,
 * étiquettes, marqueurs à soi, légende, copier et coller, alignement. Fonctions pures `(Arbre) → Arbre`.
 */

export interface Rect {
  x: number
  y: number
  l: number
  h: number
}
type Point = { x: number; y: number }

const sansChamp = <T extends object>(o: T | undefined, id: Id): T | undefined => {
  if (!o || !(id in o)) return o
  const { [id]: _, ...reste } = o as Record<Id, unknown>
  return Object.keys(reste).length > 0 ? (reste as T) : undefined
}

function avecChamp<K extends 'zones' | 'groupes' | 'legende'>(a: Arbre, champ: K, valeur: Arbre[K] | undefined): Arbre {
  const { [champ]: _, ...reste } = a
  const vide = valeur === undefined || (typeof valeur === 'object' && Object.keys(valeur as object).length === 0)
  return (vide ? reste : { ...reste, [champ]: valeur }) as unknown as Arbre
}

// — Zones —

/** La marge d'une zone autour de ce qu'elle entoure, et la hauteur de son bandeau de titre. */
export const MARGE_ZONE = 24
export const TITRE_ZONE = 30

/** Le cadre d'une zone qui entoure ces boîtes : leur emprise, une marge, et la place du titre en haut. */
export function rectAutour(boites: readonly Rect[]): Rect {
  const x0 = Math.min(...boites.map((b) => b.x)) - MARGE_ZONE
  const y0 = Math.min(...boites.map((b) => b.y)) - MARGE_ZONE - TITRE_ZONE
  const x1 = Math.max(...boites.map((b) => b.x + b.l)) + MARGE_ZONE
  const y1 = Math.max(...boites.map((b) => b.y + b.h)) + MARGE_ZONE
  return { x: Math.round(x0), y: Math.round(y0), l: Math.round(x1 - x0), h: Math.round(y1 - y0) }
}

/** Les sujets flottants que cette zone contient : ceux dont le centre est dedans. Leurs branches les suivent. */
export function contenuZone(l: Lecture, boites: ReadonlyMap<Id, Rect>, z: Rect): Id[] {
  return l.flottants.filter((id) => {
    const b = boites.get(id)
    if (!b) return false
    const [cx, cy] = [b.x + b.l / 2, b.y + b.h / 2]
    return cx >= z.x && cx <= z.x + z.l && cy >= z.y && cy <= z.y + z.h
  })
}

/** Les boîtes d'un flottant et de toute sa branche (pour entourer ce qu'on voit). */
export function boitesDeBranche(l: Lecture, boites: ReadonlyMap<Id, Rect>, ids: readonly Id[]): Rect[] {
  return ids.flatMap((id) => branche(l, id).flatMap((x) => boites.get(x) ?? []))
}

export function ajouterZone(a: Arbre, rect: Rect, titre = ''): [Arbre, Id] {
  const id = nouvelId()
  const zone: Zone = { x: Math.round(rect.x), y: Math.round(rect.y), l: Math.max(60, Math.round(rect.l)), h: Math.max(60, Math.round(rect.h)), ...(titre ? { titre } : {}) }
  return [avecChamp(a, 'zones', { ...a.zones, [id]: zone }), id]
}

export function changerZone(a: Arbre, id: Id, f: (z: Zone) => Zone): Arbre {
  const z = a.zones?.[id]
  return z ? avecChamp(a, 'zones', { ...a.zones, [id]: f(z) }) : a
}

export const retirerZone = (a: Arbre, id: Id): Arbre => (a.zones?.[id] ? avecChamp(a, 'zones', sansChamp(a.zones, id)) : a)

/** Déplace la zone et ce qu'elle contient (les flottants `membres`) de `de` px. */
export function deplacerZone(a: Arbre, id: Id, de: Point, membres: readonly Id[]): Arbre {
  let sortie = changerZone(a, id, (z) => ({ ...z, x: Math.round(z.x + de.x), y: Math.round(z.y + de.y) }))
  for (const m of membres) sortie = changerSujet(sortie, m, (s) => (s.position ? { ...s, position: { x: Math.round(s.position.x + de.x), y: Math.round(s.position.y + de.y) } } : s))
  return sortie
}

/** Retire les flottants de la zone (avec leurs branches) ; la zone reste, vide. */
export function effacerContenuZone(a: Arbre, membres: readonly Id[]): Arbre {
  const l = lire(a)
  const partis = new Set(membres.flatMap((m) => branche(l, m)))
  if (partis.size === 0) return a
  const sujets = Object.fromEntries(Object.entries(a.sujets).filter(([id]) => !partis.has(id)))
  return { ...a, sujets }
}

/** Les zones qui tiennent debout : bien formées. */
export function zonesValides(a: Arbre): [Id, Zone][] {
  return Object.entries(a.zones ?? {}).filter((e): e is [Id, Zone] => {
    const z = e[1] as Zone | undefined
    return !!z && [z.x, z.y, z.l, z.h].every((v) => Number.isFinite(v)) && z.l > 0 && z.h > 0
  })
}

// — La tâche planifiée —

export interface Planning {
  debut?: string
  fin?: string
  duree?: number
  progression?: number
}

const JOUR = 86_400_000
const dateDe = (iso: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(t) ? null : t
}
const isoDe = (t: number) => new Date(t).toISOString().slice(0, 10)

/**
 * Remet d'accord les trois champs de la planification : changer le début ou la durée recalcule la fin ; changer la
 * fin recalcule la durée (en jours pleins, début et fin compris). L'avancement reste entre 0 et 100. Vide : `undefined`.
 */
export function normaliserPlanning(p: Planning, change?: 'debut' | 'fin' | 'duree'): Planning | undefined {
  const sortie: Planning = {}
  const debut = p.debut && dateDe(p.debut) !== null ? p.debut : undefined
  let fin = p.fin && dateDe(p.fin) !== null ? p.fin : undefined
  let duree = p.duree !== undefined && Number.isFinite(p.duree) && p.duree > 0 ? Math.round(p.duree) : undefined
  if (debut && fin && dateDe(fin)! < dateDe(debut)! && change !== 'debut') fin = debut
  if (debut && change === 'fin' && fin) duree = Math.round((dateDe(fin)! - dateDe(debut)!) / JOUR) + 1
  else if (debut && duree && (change === 'debut' || change === 'duree' || !fin)) fin = isoDe(dateDe(debut)! + (duree - 1) * JOUR)
  else if (debut && fin) duree = Math.round((dateDe(fin)! - dateDe(debut)!) / JOUR) + 1
  if (debut) sortie.debut = debut
  if (fin) sortie.fin = fin
  if (duree) sortie.duree = duree
  if (p.progression !== undefined && Number.isFinite(p.progression)) sortie.progression = Math.max(0, Math.min(100, Math.round(p.progression)))
  return Object.keys(sortie).length > 0 ? sortie : undefined
}

/** La tâche planifiée en une ligne : « 3 → 9 janv. · 7 j · 40 % ». */
export function resumePlanning(p: Planning): string {
  const f = new Intl.DateTimeFormat(langue(), { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const jour = (iso: string) => f.format(dateDe(iso)!)
  const morceaux: string[] = []
  if (p.debut && p.fin) morceaux.push(`${jour(p.debut)} → ${jour(p.fin)}`)
  else if (p.debut) morceaux.push(`${t('arbre.inserer.des')} ${jour(p.debut)}`)
  else if (p.fin) morceaux.push(`${t('arbre.inserer.avant')} ${jour(p.fin)}`)
  if (p.duree) morceaux.push(t('arbre.inserer.jours', { n: p.duree }))
  if (p.progression !== undefined) morceaux.push(`${p.progression} %`)
  return morceaux.join(' · ') || t('arbre.inserer.tache')
}

// — Les étiquettes —

/** Ajoute, retire ou remplace les étiquettes de ces sujets. Sans doublon, sans vide. */
export function etiqueter(a: Arbre, ids: readonly Id[], quoi: { ajouter?: readonly string[]; retirer?: readonly string[]; tout?: readonly string[] }): Arbre {
  const net = (v: readonly string[]) => [...new Set(v.map((x) => x.trim()).filter(Boolean))]
  let sortie = a
  for (const id of ids) {
    const s = a.sujets[id]
    if (!s) continue
    const actuelles = quoi.tout ? net(quoi.tout) : (s.etiquettes ?? [])
    const retirees = new Set(quoi.retirer ?? [])
    const liste = net([...actuelles.filter((e) => !retirees.has(e)), ...(quoi.ajouter ?? [])])
    sortie = porter(sortie, [id], 'etiquettes', liste)
  }
  return sortie
}

// — Les marqueurs à soi, et la légende —

/** Un marqueur à soi, par son identifiant de sujet (`perso-<id>`). */
export function marqueurPerso(a: Arbre, marqueur: string): { nom: string; fichier: Id; groupe: Id } | undefined {
  if (!estPerso(marqueur)) return undefined
  const id = marqueur.slice(6)
  for (const [groupe, g] of Object.entries(a.groupes ?? {})) {
    const m = g?.marqueurs.find((x) => x.id === id)
    if (m) return { nom: m.nom, fichier: m.fichier, groupe }
  }
  return undefined
}

/** Les groupes à soi, dans l'ordre. */
export function groupesDe(a: Arbre): [Id, GroupeMarqueurs][] {
  return Object.entries(a.groupes ?? {})
    .filter((e): e is [Id, GroupeMarqueurs] => !!e[1] && Array.isArray(e[1].marqueurs))
    .sort(([x, p], [y, q]) => (p.ordre < q.ordre ? -1 : p.ordre > q.ordre ? 1 : x < y ? -1 : 1))
}

export function creerGroupe(a: Arbre, nom: string, id: Id = nouvelId()): [Arbre, Id] {
  const derniers = groupesDe(a)
  const ordre = cleEntre(derniers.at(-1)?.[1].ordre, undefined)
  return [avecChamp(a, 'groupes', { ...a.groupes, [id]: { ordre, nom, marqueurs: [] } }), id]
}

export function renommerGroupe(a: Arbre, id: Id, nom: string): Arbre {
  const g = a.groupes?.[id]
  const propre = nom.trim()
  return g && propre ? avecChamp(a, 'groupes', { ...a.groupes, [id]: { ...g, nom: propre } }) : a
}

/** Retire le marqueur de tous les sujets qui le portent. */
function oterMarqueurs(a: Arbre, ids: ReadonlySet<string>): Arbre {
  let sortie = a
  for (const [id, s] of Object.entries(a.sujets)) {
    if (!s?.marqueurs?.some((m) => ids.has(m))) continue
    sortie = changerSujet(sortie, id, ({ marqueurs, ...reste }) => {
      const liste = (marqueurs ?? []).filter((m) => !ids.has(m))
      return liste.length > 0 ? { ...reste, marqueurs: liste } : reste
    })
  }
  return sortie
}

/** Supprime un groupe et ses marqueurs, jusque sur les sujets qui les portaient. */
export function supprimerGroupe(a: Arbre, id: Id): Arbre {
  const g = a.groupes?.[id]
  if (!g) return a
  const sortie = oterMarqueurs(a, new Set(g.marqueurs.map((m) => `perso-${m.id}`)))
  return avecChamp(sortie, 'groupes', sansChamp(sortie.groupes, id))
}

/** Pose une image comme marqueur dans un groupe. Rend le carte et l'identifiant du marqueur côté sujet. */
export function ajouterMarqueurPerso(a: Arbre, groupe: Id, marqueur: { nom: string; fichier: Id }): [Arbre, string | null] {
  const g = a.groupes?.[groupe]
  if (!g) return [a, null]
  const id = nouvelId()
  return [avecChamp(a, 'groupes', { ...a.groupes, [groupe]: { ...g, marqueurs: [...g.marqueurs, { id, ...marqueur }] } }), `perso-${id}`]
}

/** Retire des marqueurs à soi (et de tous les sujets). */
export function supprimerMarqueursPerso(a: Arbre, marqueurs: readonly string[]): Arbre {
  const ids = new Set(marqueurs.filter(estPerso).map((m) => m.slice(6)))
  if (ids.size === 0) return a
  const groupes = Object.fromEntries(Object.entries(a.groupes ?? {}).map(([id, g]) => [id, { ...g, marqueurs: g.marqueurs.filter((m) => !ids.has(m.id)) }]))
  return avecChamp(oterMarqueurs(a, new Set([...ids].map((i) => `perso-${i}`))), 'groupes', groupes)
}

/** Déplace des marqueurs à soi vers un autre groupe. */
export function deplacerMarqueursPerso(a: Arbre, marqueurs: readonly string[], vers: Id): Arbre {
  const cible = a.groupes?.[vers]
  if (!cible) return a
  const ids = new Set(marqueurs.filter(estPerso).map((m) => m.slice(6)))
  const groupes: Record<Id, GroupeMarqueurs> = {}
  const portes: GroupeMarqueurs['marqueurs'] = []
  for (const [id, g] of Object.entries(a.groupes ?? {})) {
    portes.push(...g.marqueurs.filter((m) => ids.has(m.id) && id !== vers))
    groupes[id] = { ...g, marqueurs: g.marqueurs.filter((m) => id === vers || !ids.has(m.id)) }
  }
  groupes[vers] = { ...groupes[vers]!, marqueurs: [...groupes[vers]!.marqueurs, ...portes] }
  return avecChamp(a, 'groupes', groupes)
}

/** Les marqueurs que la carte porte, dans l'ordre du panneau (les groupes de la bibliothèque, puis les marqueurs à soi). */
export function marqueursUtilises(a: Arbre, l: Lecture = lire(a)): string[] {
  const vus = new Set<string>()
  for (const s of l.sujets.values()) for (const m of s.marqueurs ?? []) vus.add(m)
  const rang = (m: string) => {
    const i = GROUPES_MARQUEURS.findIndex((g) => g.cle === groupeDuMarqueur(m))
    return i < 0 ? GROUPES_MARQUEURS.length : i
  }
  const ordre = (m: string) => GROUPES_MARQUEURS.find((g) => g.cle === groupeDuMarqueur(m))?.marqueurs.indexOf(m) ?? 99
  return [...vus].sort((x, y) => rang(x) - rang(y) || ordre(x) - ordre(y) || (x < y ? -1 : 1))
}

export function basculerLegende(a: Arbre, visible?: boolean): Arbre {
  const montrer = visible ?? !a.legende?.visible
  const { visible: _v, ...reste } = a.legende ?? {}
  const legende = { ...reste, ...(montrer ? { visible: true } : {}) }
  return avecChamp(a, 'legende', Object.keys(legende).length > 0 ? legende : undefined)
}

/** Ce que veut dire un marqueur sur la carte ; un texte vide l'efface. */
export function direMarqueur(a: Arbre, marqueur: string, texte: string): Arbre {
  const textes = { ...a.legende?.textes }
  const propre = texte.trim()
  if (propre) textes[marqueur] = propre
  else delete textes[marqueur]
  const legende = { ...a.legende }
  if (Object.keys(textes).length > 0) legende.textes = textes
  else delete legende.textes
  return avecChamp(a, 'legende', Object.keys(legende).length > 0 ? legende : undefined)
}

// — Copier, couper, coller —

/** Des branches mises de côté : leurs sujets (avec leurs identifiants d'origine) et leurs racines, dans l'ordre. */
export interface Fragment {
  racines: Id[]
  sujets: Record<Id, Sujet>
}

/** Les branches de ces sujets, hors central et résumés ; un sujet dont un ancêtre est aussi choisi n'est pas pris deux fois. */
export function extraire(a: Arbre, ids: readonly Id[]): Fragment | null {
  const l = lire(a)
  const choisis = new Set(ids.filter((x) => l.sujets.has(x) && x !== l.central && l.sujets.get(x)!.genre !== 'resume'))
  const racines = [...choisis].filter((x) => {
    for (let p = l.sujets.get(x)?.parent; p !== undefined; p = l.sujets.get(p)?.parent) if (choisis.has(p)) return false
    return true
  })
  if (racines.length === 0) return null
  const sujets: Record<Id, Sujet> = {}
  for (const r of racines) for (const x of branche(l, r)) sujets[x] = l.sujets.get(x)!
  return { racines, sujets }
}

/**
 * Colle un fragment : sous `parent` (en dernier), ou en flottants à `position`. Chaque sujet reçoit un identifiant neuf.
 * Rend la carte et les racines collées.
 */
export function coller(a: Arbre, f: Fragment, cible: { parent: Id } | { position: Point }): [Arbre, Id[]] {
  const l = lire(a)
  const ids = new Map(Object.keys(f.sujets).map((x) => [x, nouvelId()]))
  const sujets = { ...a.sujets }
  for (const [ancien, neuf] of ids) {
    const v = f.sujets[ancien]!
    sujets[neuf] = { ...v, ...(v.parent !== undefined && ids.has(v.parent) ? { parent: ids.get(v.parent)! } : {}) }
  }
  let derniere = 'parent' in cible ? enfantsDe(l, cible.parent).at(-1) : l.flottants.at(-1)
  let bas = derniere !== undefined ? l.sujets.get(derniere)?.ordre : undefined
  const collees: Id[] = []
  f.racines.forEach((r, i) => {
    const neuf = ids.get(r)!
    const { genre: _g, position: _p, ...reste } = sujets[neuf]!
    bas = cleEntre(bas, undefined)
    derniere = neuf
    if ('parent' in cible) sujets[neuf] = { ...reste, parent: cible.parent, ordre: bas }
    else sujets[neuf] = { ...reste, parent: l.central, genre: 'detache', position: { x: Math.round(cible.position.x + i * 24), y: Math.round(cible.position.y + i * 24) }, ordre: bas }
    collees.push(neuf)
  })
  return [{ ...a, sujets }, collees]
}

// — Replier —

/** Replie (ou déplie) tout ce qui descend de ce sujet, lui-même gardé tel qu'il est. */
export function replierSousBranches(a: Arbre, id: Id, replier: boolean): Arbre {
  const l = lire(a)
  let sortie = a
  for (const x of branche(l, id).slice(1)) {
    const s = l.sujets.get(x)
    if (!s || enfantsDe(l, x).length === 0 || !!s.replie === replier) continue
    sortie = changerSujet(sortie, x, ({ replie: _r, ...reste }) => (replier ? { ...reste, replie: true } : reste))
  }
  return sortie
}

// — Aligner des sujets flottants —

export type Alignement = 'gauche' | 'centre' | 'droite' | 'haut' | 'milieu' | 'bas' | 'distribuerH' | 'distribuerV'

/** Aligne ou répartit des sujets flottants (`position` : le centre de leur boîte). `tailles` : leurs boîtes. */
export function aligner(a: Arbre, ids: readonly Id[], mode: Alignement, tailles: ReadonlyMap<Id, { l: number; h: number }>): Arbre {
  const flottants = ids.filter((x) => a.sujets[x]?.genre === 'detache' && a.sujets[x]?.position && tailles.has(x))
  if (flottants.length < 2) return a
  const pos = new Map(flottants.map((x) => [x, { ...a.sujets[x]!.position! }]))
  const t = (x: Id) => tailles.get(x)!
  const [gauche, droite] = [Math.min(...flottants.map((x) => pos.get(x)!.x - t(x).l / 2)), Math.max(...flottants.map((x) => pos.get(x)!.x + t(x).l / 2))]
  const [haut, bas] = [Math.min(...flottants.map((x) => pos.get(x)!.y - t(x).h / 2)), Math.max(...flottants.map((x) => pos.get(x)!.y + t(x).h / 2))]
  const moyenne = (c: 'x' | 'y') => flottants.reduce((s, x) => s + pos.get(x)![c], 0) / flottants.length
  for (const x of flottants) {
    const p = pos.get(x)!
    if (mode === 'gauche') p.x = gauche + t(x).l / 2
    else if (mode === 'droite') p.x = droite - t(x).l / 2
    else if (mode === 'centre') p.x = moyenne('x')
    else if (mode === 'haut') p.y = haut + t(x).h / 2
    else if (mode === 'bas') p.y = bas - t(x).h / 2
    else if (mode === 'milieu') p.y = moyenne('y')
  }
  if (mode === 'distribuerH' || mode === 'distribuerV') {
    const h = mode === 'distribuerH'
    const trie = [...flottants].sort((x, y) => (h ? pos.get(x)!.x - pos.get(y)!.x : pos.get(x)!.y - pos.get(y)!.y))
    const taille = (x: Id) => (h ? t(x).l : t(x).h)
    const [debut, fin] = h ? [gauche, droite] : [haut, bas]
    const vide = fin - debut - trie.reduce((s, x) => s + taille(x), 0)
    const ecart = vide / Math.max(1, trie.length - 1)
    let curseur = debut
    for (const x of trie) {
      pos.get(x)![h ? 'x' : 'y'] = curseur + taille(x) / 2
      curseur += taille(x) + ecart
    }
  }
  let sortie = a
  for (const [x, p] of pos) sortie = changerSujet(sortie, x, (s) => ({ ...s, position: { x: Math.round(p.x), y: Math.round(p.y) } }))
  return sortie
}

// — Sélectionner —

export type Genre = 'sousSujets' | 'freres' | 'memeNiveau' | 'tout' | 'flottants' | 'resumes' | 'relations' | 'limites' | 'images' | 'equations' | 'zones'

/** Ce que choisit une entrée « Sélectionner ▸ » : les identifiants, sujets ou objets de la carte. */
export function choisirParGenre(a: Arbre, l: Lecture, depuis: Id | null, genre: Genre): Id[] {
  switch (genre) {
    case 'sousSujets':
      return depuis ? branche(l, depuis).slice(1) : []
    case 'freres': {
      const s = depuis ? l.sujets.get(depuis) : undefined
      return s?.parent !== undefined && s.genre !== 'detache' ? enfantsDe(l, s.parent).filter((x) => x !== depuis) : []
    }
    case 'memeNiveau': {
      if (!depuis || !l.sujets.has(depuis)) return []
      const n = profondeur(l, depuis)
      // Un flottant compte comme un principal pour la profondeur, mais n'est pas du même niveau : chaque genre a le sien.
      const genreDe = l.sujets.get(depuis)!.genre
      return [...l.sujets.keys()].filter((x) => x !== depuis && l.sujets.get(x)!.genre === genreDe && profondeur(l, x) === n)
    }
    case 'tout':
      return [...l.sujets.keys(), ...Object.keys(a.relations ?? {}), ...Object.keys(a.limites ?? {})]
    case 'flottants':
      return [...l.flottants]
    case 'resumes':
      return [...l.resumes]
    case 'relations':
      return Object.keys(a.relations ?? {})
    case 'limites':
      return Object.keys(a.limites ?? {})
    case 'images':
      return [...l.sujets].filter(([, s]) => s.image || s.vignette).map(([x]) => x)
    case 'equations':
      return [...l.sujets].filter(([, s]) => s.equation).map(([x]) => x)
    case 'zones':
      return zonesValides(a).map(([x]) => x)
  }
}
