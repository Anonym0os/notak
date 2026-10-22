import type { Camera } from './camera'
import { point } from './geometrie'
import { type Magasin, creerMagasin } from './magasin'
import { COULEURS_NOTE, type CouleurNote, type Id, type Tableau, nouvelId } from './tableau'

/** Tous les tableaux, à plat. La racine est celui qu'on voit en arrivant. */
export interface Espace {
  racine: Id
  tableaux: Record<Id, Tableau>
}

export interface EspaceVivant {
  /** Le magasin d'un tableau, créé à la demande, avec son propre historique. */
  magasin(id: Id): Magasin
  /** Crée un tableau vide, sans renvoi : c'est à l'appelant de le poser quelque part. */
  creerTableau(titre: string): Id
  /** Change le titre, hors historique (le renvoi qui le demande porte le pas d'historique). */
  renommer(id: Id, titre: string): void
  lire(): Espace
  /** Prévenu à chaque changement de n'importe quel tableau. */
  ecouter(f: () => void): () => void
  /** De la racine jusqu'à ce tableau, en suivant les renvois. Un orphelin s'arrête à lui-même. */
  chemin(id: Id): Id[]
  parent(id: Id): Id | null
}

/** La couleur du n-ième tableau créé : la palette tourne. */
export const couleurSuivante = (n: number): CouleurNote => COULEURS_NOTE[n % COULEURS_NOTE.length]!

const estEspace = (x: Tableau | Espace): x is Espace => 'tableaux' in x && 'racine' in x

/** Un ancien tableau seul, celui qu'enregistrait la version précédente, devient la racine d'un espace. */
export function espaceDepuis(ancien: Tableau | Espace): Espace {
  if (estEspace(ancien)) return ancien
  const id = ancien.id ?? nouvelId()
  return { racine: id, tableaux: { [id]: { ...ancien, id } } }
}

/** Les tableaux vers lesquels un tableau a des renvois. */
const cibles = (t: Tableau) =>
  t.elements.flatMap((e) => (e.contenu.type === 'tableau' ? [e.contenu.cible] : []))

/** Parcours en largeur depuis la racine : chaque tableau atteint garde le tableau par lequel on l'a atteint. */
function parents(e: Espace): Map<Id, Id | null> {
  const vus = new Map<Id, Id | null>([[e.racine, null]])
  const file = [e.racine]
  for (let i = 0; i < file.length; i++) {
    for (const c of cibles(e.tableaux[file[i]!] ?? { titre: '', elements: [] })) {
      if (vus.has(c) || !e.tableaux[c]) continue
      vus.set(c, file[i]!)
      file.push(c)
    }
  }
  return vus
}

/** Le chemin de la racine à `id` dans cet espace ; `[id]` si aucun renvoi n'y mène. */
export function cheminDans(e: Espace, id: Id): Id[] {
  const vus = parents(e)
  if (!vus.has(id)) return [id]
  const chemin = [id]
  for (let p = vus.get(id); p; p = vus.get(p)) chemin.unshift(p)
  return chemin
}

export function creerEspace(initial: Espace): EspaceVivant {
  const base: Record<Id, Tableau> = {}
  for (const [id, t] of Object.entries(initial.tableaux)) base[id] = { ...t, id }
  const racine = initial.racine
  const magasins = new Map<Id, Magasin>()
  const ecouteurs = new Set<() => void>()
  let instantane: Espace | null = null
  const changer = () => {
    instantane = null
    for (const f of ecouteurs) f()
  }

  const magasin = (id: Id): Magasin => {
    let m = magasins.get(id)
    if (m) return m
    const t = base[id]
    if (!t) throw new Error(`Tableau inconnu : ${id}`)
    m = creerMagasin(t)
    m.ecouter(changer)
    magasins.set(id, m)
    return m
  }

  const lire = (): Espace => {
    if (!instantane) {
      const tableaux: Record<Id, Tableau> = {}
      for (const id of Object.keys(base)) tableaux[id] = magasins.get(id)?.lire() ?? base[id]!
      instantane = { racine, tableaux }
    }
    return instantane
  }

  return {
    magasin,
    creerTableau(titre) {
      const id = nouvelId()
      base[id] = { id, titre, couleur: couleurSuivante(Object.keys(base).length), elements: [] }
      changer()
      return id
    },
    renommer(id, titre) {
      const m = magasin(id)
      const t = m.lire()
      if (t.titre !== titre) m.remplacer({ ...t, titre })
    },
    lire,
    ecouter(f) {
      ecouteurs.add(f)
      return () => ecouteurs.delete(f)
    },
    chemin: (id) => cheminDans(lire(), id),
    parent(id) {
      const c = cheminDans(lire(), id)
      return c.length > 1 ? c[c.length - 2]! : null
    },
  }
}

// ---------------------------------------------------------------------------
// Le fil d'Ariane

export interface Troncature {
  /** Les indices des segments montrés, dans l'ordre. */
  visibles: number[]
  /** Les indices cachés derrière « … » (le milieu), dans l'ordre. */
  caches: number[]
}

/**
 * Quels segments montrer quand le fil ne tient pas : le premier, puis « … », puis autant de derniers
 * que la place le permet (au moins le dernier). `largeurs` sépare déjà chaque segment du suivant.
 */
export function tronquerFil(largeurs: number[], disponible: number, largeurSuspension: number): Troncature {
  const tous = largeurs.map((_, i) => i)
  const total = largeurs.reduce((a, l) => a + l, 0)
  if (largeurs.length <= 2 || total <= disponible) return { visibles: tous, caches: [] }
  let reste = disponible - largeurs[0]! - largeurSuspension
  let debutFin = largeurs.length
  while (debutFin > 1) {
    const l = largeurs[debutFin - 1]!
    if (reste < l && debutFin < largeurs.length) break
    reste -= l
    debutFin--
  }
  const caches = tous.slice(1, debutFin)
  return caches.length === 0 ? { visibles: tous, caches: [] } : { visibles: [0, ...tous.slice(debutFin)], caches }
}

// ---------------------------------------------------------------------------
// La mémoire des vues : où l'on regardait dans chaque tableau

export interface VueMemorisee {
  camera: Camera
  /** Quand elle a été notée, pour oublier les plus anciennes. */
  t: number
}
export type Vues = Record<Id, VueMemorisee>

export const VUES_MAX = 100

export function memoriserVue(vues: Vues, id: Id, camera: Camera, t: number, max = VUES_MAX): Vues {
  const suivantes = { ...vues, [id]: { camera, t } }
  const ids = Object.keys(suivantes)
  if (ids.length <= max) return suivantes
  const gardes = ids.sort((a, b) => suivantes[b]!.t - suivantes[a]!.t).slice(0, max)
  return Object.fromEntries(gardes.map((i) => [i, suivantes[i]!]))
}

const fini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Relit des vues enregistrées ; ce qui n'a pas la bonne forme est écarté. */
export function lireVues(brut: unknown): Vues {
  const vues: Vues = {}
  if (!brut || typeof brut !== 'object') return vues
  for (const [id, v] of Object.entries(brut)) {
    const { camera, t } = (v ?? {}) as Partial<VueMemorisee>
    const o = camera?.origine
    if (camera && o && fini(o.x) && fini(o.y) && fini(camera.echelle) && camera.echelle > 0 && fini(t)) {
      vues[id] = { camera: { origine: point(o.x, o.y), echelle: camera.echelle }, t }
    }
  }
  return vues
}

// ---------------------------------------------------------------------------
// L'historique de navigation (Cmd+[ et Cmd+])

export interface Parcours {
  pile: Id[]
  index: number
}

export const parcoursDepart = (id: Id): Parcours => ({ pile: [id], index: 0 })
export const courantDe = (p: Parcours): Id => p.pile[p.index]!

/** Ouvrir un tableau efface ce qui restait « en avant ». Rouvrir le même tableau ne change rien. */
export function ouvrir(p: Parcours, id: Id): Parcours {
  if (courantDe(p) === id) return p
  return { pile: [...p.pile.slice(0, p.index + 1), id], index: p.index + 1 }
}
export const reculer = (p: Parcours): Parcours => (p.index > 0 ? { ...p, index: p.index - 1 } : p)
export const avancer = (p: Parcours): Parcours => (p.index < p.pile.length - 1 ? { ...p, index: p.index + 1 } : p)
