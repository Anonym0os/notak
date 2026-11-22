import type * as Y from 'yjs'
import { NOM_ARBRES, ecrireDifference, sansDicos, toutLire } from '../coeur/arbresYjs.ts'
import { cleEntre } from '../coeur/ordre.ts'
import { type Arbre, type Id, LARGEUR_COLONNE, LARGEUR_NOTE, type StructureArbre, type Sujet, nouvelId } from '../coeur/tableau.ts'
import { LARGEUR_TACHES, docVide } from '../elements/taches/liste.ts'
import { ajouterEnfant, carteNeuve, changerSujet, enfantsDe, lire, rattacher, renommer, supprimerBranches } from '../elements/arbre/modele/sujets.ts'
import { type ContenuLu, type ElementLu, type NoeudTexte, type TableauLu, hauteurProbable, lignesDeTexte, lireTableau } from '../export/contenu.ts'
import { docDePage, docDeParagraphes, docDeTitre, docDepuisMarkdown, enLigne } from './texte.ts'

// Ce que la porte des agents écrit dans un tableau : les éléments neufs, faits comme l'app les fait (les constructeurs
// de `packages/tableau` quand ils se chargent sous Node, leurs valeurs sinon), leur place sans chevauchement, les
// changements et le rangement. Tout s'écrit à même le document Yjs, d'une seule transaction : le magasin de la toile ne
// se charge pas sous Node (comme `poserDansNonTries`).

/** La largeur d'une carte mentale et celle d'une table neuve sur la toile (`elements/arbre/index.ts`, `table/grille.ts`). */
export const LARGEUR_ARBRE = 40
export const LARGEUR_TABLE = 34
/** Une page sur la toile : une feuille et son titre, ou en vue carte avec le début de son texte (`document/texte.ts`). */
export const LARGEUR_PAGE = 10
export const LARGEUR_PAGE_CARTE = 34
/** L'écart entre deux éléments posés ensemble, et entre deux groupes d'un rangement. */
export const ECART = 2
export const ECART_GROUPES = 4

/** Une erreur que l'agent peut corriger : son code et la phrase qui lui dit quoi faire. */
export class ErreurAgent extends Error {
  readonly code: 'element_introuvable' | 'impossible' | 'arguments_invalides'
  constructor(code: ErreurAgent['code'], message: string) {
    super(message)
    this.code = code
  }
}

export interface Boite {
  x: number
  y: number
  l: number
  h: number
}

// ---- Les éléments neufs ----

export interface ElementDemande {
  type: 'note' | 'titre' | 'taches' | 'lien' | 'colonne' | 'table' | 'carte_mentale' | 'page'
  texte?: string
  titre?: string
  couleur?: string
  url?: string
  taches?: { texte: string; faite?: boolean }[]
  lignes?: string[][]
  elements?: ElementDemande[]
  central?: string
  branches?: BrancheDemande[]
  structure?: string
  largeur?: number
  /** page : la carte montre le début du texte. */
  apercu?: boolean
}

export interface BrancheDemande {
  titre: string
  note?: string
  enfants?: BrancheDemande[]
}

/** Un élément neuf, prêt à écrire : lui, ce qu'il range (une colonne), et sa carte mentale entière. */
export interface Neuf {
  element: ElementLu
  enfants: ElementLu[]
  arbre?: Arbre
}

const paragraphe = (t: string): NoeudTexte => {
  const c = enLigne(t)
  return c.length ? { type: 'paragraph', content: c } : { type: 'paragraph' }
}

/** Le document d'une liste de tâches (`doc > taskList > taskItem(checked) > paragraph`), vide s'il n'y en a pas. */
export function docDeTaches(taches: readonly { texte: string; faite?: boolean }[]): NoeudTexte {
  if (taches.length === 0) return docVide()
  return {
    type: 'doc',
    content: [{ type: 'taskList', content: taches.map((t) => ({ type: 'taskItem', attrs: { checked: t.faite === true }, content: [paragraphe(t.texte.trim())] })) }],
  }
}

/** Une grille rectangulaire d'au moins deux lignes, comme `normaliser` de la table. */
function grille(lignes: readonly (readonly string[])[]): string[][] {
  const colonnes = Math.max(1, ...lignes.map((l) => l.length))
  const g = lignes.map((l) => [...l, ...Array<string>(colonnes - l.length).fill('')])
  while (g.length < 2) g.push(Array<string>(colonnes).fill(''))
  return g
}

/** Le contenu d'une table : ses cellules, l'en-tête en gras sur fond gris comme une table neuve, et ses largeurs. */
export function contenuDeTable(lignes: readonly (readonly string[])[], largeur: number, titre?: string): ContenuLu {
  const cellules = grille(lignes)
  const n = cellules[0]!.length
  const part = Math.floor((largeur / n) * 10) / 10
  const largeurs = Array.from({ length: n }, (_, i) => (i < n - 1 ? part : Math.round((largeur - part * (n - 1)) * 10) / 10))
  return {
    type: 'table',
    cellules,
    formats: cellules.map((l, i) => l.map(() => (i === 0 ? { gras: true, fond: 'entete' } : null))),
    largeurs,
    ...(titre ? { titre, avecTitre: true } : {}),
  }
}

/** La largeur qu'une table de `n` colonnes prend d'elle-même : celle d'une table neuve, ou douze UG par colonne. */
export const largeurDeTable = (n: number) => (n <= 3 ? LARGEUR_TABLE : Math.min(120, n * 12))

/** Une carte mentale depuis un plan imbriqué : le central, puis chaque branche et ses sous-branches, dans l'ordre. */
export function arbreDepuisPlan(central: string, branches: readonly BrancheDemande[], structure?: string): Arbre {
  let a = carteNeuve(central.trim() || 'Sujet central')
  const racine = lire(a).central
  if (structure) a = changerSujet(a, racine, (s) => ({ ...s, structure: structure as StructureArbre }))
  a = ajouterBranches(a, racine, branches)
  return a
}

/** Ajoute ces branches sous `parent`, à `index` (à la fin sinon), avec leurs sous-branches. */
export function ajouterBranches(a: Arbre, parent: Id, branches: readonly BrancheDemande[], index?: number): Arbre {
  let carte = a
  branches.forEach((b, i) => {
    const [suite, id] = ajouterEnfant(carte, parent, b.titre.trim(), index === undefined ? undefined : index + i)
    carte = b.note?.trim() ? changerSujet(suite, id, (s) => ({ ...s, note: docDeParagraphes(b.note!.trim()) })) : suite
    if (b.enfants?.length) carte = ajouterBranches(carte, id, b.enfants)
  })
  return carte
}

/** Le contenu d'un élément neuf, par son type. */
export function construire(d: ElementDemande, maintenant: number, dansColonne = false): Neuf {
  const id = nouvelId(maintenant)
  const couleur = d.couleur ? { couleur: d.couleur } : {}
  const base = (largeur: number, contenu: ContenuLu): ElementLu => ({ id, x: 0, y: 0, largeur: d.largeur ?? largeur, contenu })
  switch (d.type) {
    case 'note':
      return { element: base(LARGEUR_NOTE, { type: 'note', texte: docDepuisMarkdown(d.texte ?? ''), ...couleur }), enfants: [] }
    case 'titre':
      // L'outil « Titre » de l'app : une note sans fond, en titre centré.
      return { element: base(LARGEUR_NOTE, { type: 'note', texte: docDeTitre(d.texte ?? d.titre ?? ''), couleur: 'transparent', variante: 'titre' }), enfants: [] }
    case 'taches':
      return {
        element: base(LARGEUR_TACHES, { type: 'taches', ...(d.titre?.trim() ? { titre: d.titre.trim() } : {}), ...couleur, texte: docDeTaches(d.taches ?? []) }),
        enfants: [],
      }
    case 'lien': {
      const url = (d.url ?? '').trim()
      if (!/^https?:\/\/\S+$/i.test(url)) throw new ErreurAgent('arguments_invalides', `lien : « url » doit être une adresse en http(s), sans espace (reçu : « ${url.slice(0, 80)} »).`)
      // L'aperçu de la page se charge comme dans l'app : la toile le cherche à l'ouverture (`statut: 'attente'`).
      return { element: base(34, { type: 'lien', url, statut: 'attente', ...(d.titre?.trim() ? { titre: d.titre.trim() } : {}), ...couleur }), enfants: [] }
    }
    case 'table': {
      if (!d.lignes?.length) throw new ErreurAgent('arguments_invalides', 'table : « lignes » manque (la première ligne est l’en-tête).')
      const n = Math.max(...d.lignes.map((l) => l.length))
      const largeur = d.largeur ?? largeurDeTable(n)
      return { element: { id, x: 0, y: 0, largeur, contenu: contenuDeTable(d.lignes, largeur, d.titre?.trim()) }, enfants: [] }
    }
    case 'colonne': {
      if (dansColonne) throw new ErreurAgent('impossible', 'Une colonne ne se range pas dans une colonne : pose-la sur la toile.')
      const element = base(LARGEUR_COLONNE, { type: 'colonne', titre: d.titre?.trim() ?? '', ...couleur })
      let ordre: string | undefined
      const enfants = (d.elements ?? []).map((sous, i) => {
        const n = construire(sous, maintenant + i + 1, true)
        ordre = cleEntre(ordre, undefined)
        return { ...n.element, parent: id, ordre }
      })
      return { element, enfants }
    }
    case 'page': {
      // Le document de l'app (`nouveauDocument`) : sa largeur est fixe, celle d'une feuille ou celle de la vue carte.
      const titre = (d.titre ?? '').replace(/\s+/g, ' ').trim()
      if (!titre) throw new ErreurAgent('arguments_invalides', 'page : « titre » manque (le titre de la page, en quelques mots).')
      const carte = d.apercu === true
      return {
        element: { id, x: 0, y: 0, largeur: carte ? LARGEUR_PAGE_CARTE : LARGEUR_PAGE, contenu: { type: 'document', titre, texte: docDePage(d.texte ?? ''), ...couleur, ...(carte ? { carte: true } : {}) } },
        enfants: [],
      }
    }
    case 'carte_mentale': {
      if (dansColonne) throw new ErreurAgent('impossible', 'Une carte mentale ne se range pas dans une colonne ici : pose-la sur la toile.')
      if (!d.central?.trim()) throw new ErreurAgent('arguments_invalides', 'carte_mentale : « central » manque (le sujet central, en quelques mots).')
      const arbre = arbreDepuisPlan(d.central, d.branches ?? [], d.structure)
      return { element: base(LARGEUR_ARBRE, arbre as unknown as ContenuLu), enfants: [], arbre }
    }
  }
}

// ---- La place ----

/** La hauteur probable d'un élément, en UG (celle qu'estime la bibliothèque, sans la toile). */
export function hauteurDe(e: ElementLu, enfants = 0): number {
  const c = e.contenu
  const lignes = c.type === 'note' || c.type === 'taches' ? lignesDeTexte(e) : c.type === 'colonne' ? enfants : 0
  return Math.max(1, Math.round(hauteurProbable(e, lignes)))
}

/** Les boîtes de ce qui est posé sur la toile : ni jeté, ni non trié, ni ligne, ni rangé dans une colonne. */
export function boitesDe(t: TableauLu, sauf: ReadonlySet<string> = new Set()): (Boite & { id: string })[] {
  const enfants = new Map<string, number>()
  for (const e of t.elements) if (e.parent && e.corbeille === undefined) enfants.set(e.parent, (enfants.get(e.parent) ?? 0) + 1)
  return t.elements
    .filter((e) => !sauf.has(e.id) && !e.parent && e.corbeille === undefined && e.nonTrie === undefined && e.contenu.type !== 'ligne' && Number.isFinite(e.x) && Number.isFinite(e.y))
    .map((e) => ({ id: e.id, x: Math.round(e.x), y: Math.round(e.y), l: Math.max(1, Math.round(e.largeur)), h: hauteurDe(e, enfants.get(e.id) ?? 0) }))
}

/** Deux boîtes se chevauchent, à `marge` près (deux bords qui se touchent ne se chevauchent pas). */
export const chevauche = (a: Boite, b: Boite, marge = 0) =>
  a.x < b.x + b.l + marge && b.x < a.x + a.l + marge && a.y < b.y + b.h + marge && b.y < a.y + a.h + marge

/**
 * La première place libre pour une boîte de `l` × `h` en partant de `depart` : tant qu'elle recouvre quelque chose,
 * elle glisse au-delà (vers le bas, ou vers la droite).
 */
export function placeLibre(occupees: readonly Boite[], l: number, h: number, depart: { x: number; y: number }, sens: 'bas' | 'droite' = 'bas'): { x: number; y: number } {
  let p = { x: Math.round(depart.x), y: Math.round(depart.y) }
  for (let i = 0; i < 1000; i++) {
    const genants = occupees.filter((o) => chevauche({ ...p, l, h }, o, ECART))
    if (genants.length === 0) return p
    p = sens === 'bas' ? { x: p.x, y: Math.max(...genants.map((o) => o.y + o.h)) + ECART } : { x: Math.max(...genants.map((o) => o.x + o.l)) + ECART, y: p.y }
  }
  return p
}

/** La place libre par défaut : à droite de ce qui est là, à hauteur du haut du contenu (comme une carte de toile neuve). */
export function placeParDefaut(occupees: readonly Boite[], l: number, h: number): { x: number; y: number } {
  if (occupees.length === 0) return { x: 0, y: 0 }
  const depart = { x: Math.max(...occupees.map((o) => o.x + o.l)) + ECART_GROUPES, y: Math.min(...occupees.map((o) => o.y)) }
  return placeLibre(occupees, l, h, depart, 'bas')
}

/** Près d'un élément, du côté voulu, puis à la première place libre en s'en éloignant. */
export function placePres(occupees: readonly Boite[], ref: Boite, cote: 'droite' | 'dessous' | 'gauche' | 'dessus', l: number, h: number) {
  switch (cote) {
    case 'droite':
      return placeLibre(occupees, l, h, { x: ref.x + ref.l + ECART, y: ref.y }, 'bas')
    case 'dessous':
      return placeLibre(occupees, l, h, { x: ref.x, y: ref.y + ref.h + ECART }, 'bas')
    case 'gauche':
      return placeLibre(occupees, l, h, { x: ref.x - l - ECART, y: ref.y }, 'bas')
    case 'dessus': {
      // Au-dessus, on remonte tant que la place est prise.
      let p = { x: ref.x, y: ref.y - h - ECART }
      for (let i = 0; i < 1000; i++) {
        const genants = occupees.filter((o) => chevauche({ ...p, l, h }, o, ECART))
        if (genants.length === 0) return p
        p = { x: p.x, y: Math.min(...genants.map((o) => o.y)) - h - ECART }
      }
      return p
    }
  }
}

/** Les places relatives d'éléments posés ensemble : côte à côte, les uns sous les autres, ou en rangées. */
export function disposer(tailles: readonly { l: number; h: number }[], disposition: 'ligne' | 'pile' | 'grille'): { places: { x: number; y: number }[]; l: number; h: number } {
  const places: { x: number; y: number }[] = []
  const parRangee = disposition === 'ligne' ? tailles.length : disposition === 'pile' ? 1 : Math.ceil(Math.sqrt(tailles.length))
  let y = 0
  let largeur = 0
  for (let i = 0; i < tailles.length; i += parRangee) {
    const rangee = tailles.slice(i, i + parRangee)
    let x = 0
    for (const t of rangee) {
      places.push({ x, y })
      x += t.l + ECART
    }
    largeur = Math.max(largeur, x - ECART)
    y += Math.max(...rangee.map((t) => t.h)) + ECART
  }
  return { places, l: Math.max(0, largeur), h: Math.max(0, y - ECART) }
}

// ---- L'écriture dans le document ----

/** Ce que la porte fait d'un document, le temps d'une transaction : lire, poser, changer, jeter. */
export class Scribe {
  private readonly doc: Y.Doc
  private readonly elements: Y.Map<Record<string, unknown>>
  private readonly arbres: Y.Map<unknown>
  private plan = ''

  constructor(doc: Y.Doc) {
    this.doc = doc
    this.elements = doc.getMap<Record<string, unknown>>('elements')
    this.arbres = doc.getMap<unknown>(NOM_ARBRES)
    this.elements.forEach((e) => {
      if (typeof e?.plan === 'string' && e.plan > this.plan) this.plan = e.plan
    })
  }

  lire(): TableauLu {
    return lireTableau(this.doc)
  }

  /** L'élément tel qu'il est gardé (sans ses sujets, pour une carte mentale), ou `undefined`. */
  brut(id: string): Record<string, unknown> | undefined {
    const e = this.elements.get(id)
    return e && typeof e === 'object' && !Array.isArray(e) ? e : undefined
  }

  /** Pose un élément neuf au-dessus de tout ; une carte mentale garde ses sujets dans `arbres`, comme le magasin. */
  poser(e: ElementLu, arbre?: Arbre): void {
    // Au-dessus de tout, comme `auDessus` du magasin (`magasinYjs.ts`).
    this.plan = cleEntre(this.plan || undefined, undefined)
    if (arbre) {
      this.elements.set(e.id, { ...e, contenu: sansDicos(arbre), plan: this.plan } as unknown as Record<string, unknown>)
      ecrireDifference(this.arbres, e.id, {}, arbre)
    } else this.elements.set(e.id, { ...e, plan: this.plan } as unknown as Record<string, unknown>)
  }

  /** Change un élément gardé : `f` reçoit ses champs (sans `plan`, qui reste) et rend les nouveaux. */
  changer(id: string, f: (e: Record<string, unknown>) => Record<string, unknown>): void {
    const avant = this.brut(id)
    if (!avant) return
    const { plan, ...reste } = avant
    this.elements.set(id, { ...f(reste), ...(plan !== undefined ? { plan } : {}) })
  }

  /** La carte mentale entière (ses sujets compris), telle que la lit la toile. */
  arbre(id: string): Arbre | null {
    const e = this.brut(id)
    const c = e?.contenu as Record<string, unknown> | undefined
    if (c?.type !== 'arbre') return null
    return { ...(c as unknown as Arbre), ...(toutLire(this.arbres).get(id) ?? {}) } as Arbre
  }

  /** Écrit ce qui change d'une carte mentale, sujet par sujet, et le reste de son contenu dans l'élément. */
  ecrireArbre(id: string, avant: Arbre, apres: Arbre): void {
    ecrireDifference(this.arbres, id, avant, apres)
    const reste = sansDicos(apres)
    const e = this.brut(id)
    if (e && JSON.stringify(sansDicos(e.contenu as object)) !== JSON.stringify(reste)) this.changer(id, (x) => ({ ...x, contenu: reste }))
  }
}

// ---- Les branches d'une carte mentale ----

export interface GesteBranche {
  action: 'ajouter' | 'renommer' | 'deplacer' | 'remplacer' | 'retirer'
  sujet?: string
  titre?: string
  note?: string
  enfants?: BrancheDemande[]
  vers?: string
  position?: number
}

/** Applique ces gestes, dans l'ordre, à une carte mentale ; un sujet inconnu arrête tout, avec ce qu'il faut faire. */
export function gestesSurArbre(a: Arbre, gestes: readonly GesteBranche[], carte: string): Arbre {
  let carteCourante = a
  for (const [i, g] of gestes.entries()) {
    const l = lire(carteCourante)
    const ou = `branches[${i}]`
    const sujet = (id: string | undefined, defaut?: string): string => {
      const s = id ?? defaut
      if (!s || !l.sujets.has(s)) {
        throw new ErreurAgent('element_introuvable', `${ou} : sujet introuvable dans la carte ${carte} (${s ?? 'absent'}). Relis la carte avec lire_tableau : son plan donne l’identifiant de chaque sujet.`)
      }
      return s
    }
    switch (g.action) {
      case 'ajouter': {
        const parent = sujet(g.sujet, l.central)
        const branches = g.titre ? [{ titre: g.titre, ...(g.note ? { note: g.note } : {}), ...(g.enfants ? { enfants: g.enfants } : {}) }] : (g.enfants ?? [])
        if (branches.length === 0) throw new ErreurAgent('arguments_invalides', `${ou} : ajouter demande « titre » (une branche) ou « enfants » (plusieurs).`)
        const nombre = enfantsDe(l, parent).length
        carteCourante = ajouterBranches(carteCourante, parent, branches, g.position === undefined ? undefined : Math.min(g.position, nombre))
        break
      }
      case 'renommer': {
        const id = sujet(g.sujet)
        if (!g.titre?.trim()) throw new ErreurAgent('arguments_invalides', `${ou} : renommer demande « titre ».`)
        carteCourante = renommer(carteCourante, id, g.titre.trim())
        if (g.note !== undefined) carteCourante = changerSujet(carteCourante, id, (s) => avecNote(s, g.note!))
        break
      }
      case 'deplacer': {
        const id = sujet(g.sujet)
        const vers = sujet(g.vers)
        if (id === l.central) throw new ErreurAgent('impossible', `${ou} : le sujet central ne se déplace pas.`)
        let x: string | undefined = vers
        while (x) {
          if (x === id) throw new ErreurAgent('impossible', `${ou} : un sujet ne se range pas sous l’une de ses propres branches.`)
          x = l.sujets.get(x)?.parent
        }
        const freres = enfantsDe(l, vers).filter((f) => f !== id)
        carteCourante = rattacher(carteCourante, id, vers, Math.min(g.position ?? freres.length, freres.length))
        break
      }
      case 'remplacer': {
        const id = sujet(g.sujet, l.central)
        carteCourante = supprimerBranches(carteCourante, enfantsDe(l, id))
        carteCourante = ajouterBranches(carteCourante, id, g.enfants ?? [])
        if (g.titre?.trim()) carteCourante = renommer(carteCourante, id, g.titre.trim())
        break
      }
      case 'retirer': {
        const id = sujet(g.sujet)
        if (id === l.central) throw new ErreurAgent('impossible', `${ou} : le sujet central ne se retire pas ; jette la carte avec jeter_elements.`)
        carteCourante = supprimerBranches(carteCourante, [id])
        break
      }
    }
  }
  return carteCourante
}

const avecNote = (s: Sujet, note: string): Sujet => {
  const { note: _n, ...reste } = s
  return note.trim() ? { ...reste, note: docDeParagraphes(note.trim()) } : reste
}
