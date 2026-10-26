import type { Node as NoeudPM } from '@tiptap/pm/model'
import { type EditorState, Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { Extension } from '@tiptap/react'
import { blocA, decaler, dupliquer, indenter, racines, supprimer } from './gestes'
import { type Ligne, ligneSelonY, sortiDuTexte } from './glisser'
import { type Bloc, blocsDe } from './modele'
import { animerCaseDuBloc } from './structure'

/**
 * La sélection de blocs (docs/NOTION.md § 7) : on est soit dans le texte, soit sur des blocs entiers. Elle va d'un bloc
 * d'ancrage à un bloc de tête, dans l'ordre de lecture ; l'état la garde par ids, donc elle survit aux gestes qui
 * déplacent les blocs. La sélection de l'éditeur couvre les mêmes blocs, pour que ⌘C, ⌘X et ⌘V fassent leur travail.
 * ⌘+clic et le rectangle choisissent aussi des blocs séparés : `ids` les nomme alors un à un.
 */

export interface Choix {
  ancre: string
  tete: string
  /** Des blocs séparés (⌘+clic, rectangle) : exactement ceux-là, ancre et tête étant les bouts de l'extension à venir. */
  ids?: readonly string[]
}

export const CLE_CHOIX = new PluginKey<Choix | null>('choixBlocs')

/** Les blocs qu'on parcourt aux flèches : ni les rangées ni les colonnes elles-mêmes, ni ce qu'un dépliant fermé cache. */
export function parcours(doc: NoeudPM): Bloc[] {
  const blocs = blocsDe(doc)
  const parId = new Map(blocs.map((b) => [b.id, b]))
  const cache = (b: Bloc) => {
    for (let p = b.parent ? parId.get(b.parent) : undefined; p; p = p.parent ? parId.get(p.parent) : undefined)
      if (p.type.startsWith('deroulant') || p.type.startsWith('titreDeroulant')) if (p.format.ouvert === false) return true
    return false
  }
  return blocs.filter((b) => b.id && b.type !== 'colonnes' && b.type !== 'colonne' && !cache(b))
}

/** Les ids des blocs choisis, dans l'ordre de lecture : d'ancre à tête, ou ceux que `ids` nomme. */
export function idsDuChoix(doc: NoeudPM, choix: Choix | null): string[] {
  if (!choix) return []
  const ordre = parcours(doc).map((b) => b.id!)
  if (choix.ids) {
    const voulus = new Set(choix.ids)
    return ordre.filter((id) => voulus.has(id))
  }
  const a = ordre.indexOf(choix.ancre)
  const t = ordre.indexOf(choix.tete)
  if (a < 0 || t < 0) return []
  return ordre.slice(Math.min(a, t), Math.max(a, t) + 1)
}

export const blocsChoisis = (state: EditorState): string[] => idsDuChoix(state.doc, CLE_CHOIX.getState(state) ?? null)

/**
 * La transaction qui choisit des blocs (ou en sort, avec `null`) ; la sélection de l'éditeur les couvre, de l'ancre vers
 * la tête : une tête au-dessus de l'ancre met le bout mobile de la sélection en haut, et la page défile vers lui
 * (`versLeHaut` force ce sens : ↑ montre le haut du bloc, ↓ son bas).
 */
export function choisir(state: EditorState, choix: Choix | null, tr: Transaction = state.tr, versLeHaut?: boolean): Transaction {
  tr.setMeta(CLE_CHOIX, choix)
  const ids = idsDuChoix(tr.doc, choix)
  const r = racines(tr.doc, ids)
  if (r.length) {
    const blocs = blocsDe(tr.doc)
    const posAncre = blocs.find((b) => b.id === choix?.ancre)?.pos ?? r[0]!.pos
    const posTete = blocs.find((b) => b.id === choix?.tete)?.pos ?? r[0]!.pos
    const arriere = versLeHaut ?? posTete < posAncre
    const debut = tr.doc.resolve(r[0]!.pos)
    const fin = tr.doc.resolve(r[r.length - 1]!.fin)
    tr.setSelection(arriere ? TextSelection.between(fin, debut) : TextSelection.between(debut, fin))
  }
  return tr
}

/** L'id du bloc qui contient la position. */
export function idA(doc: NoeudPM, pos: number): string | null {
  const ou = blocA(doc.resolve(Math.max(0, Math.min(pos, doc.content.size))))
  return ou === null ? null : ((doc.nodeAt(ou)?.attrs.id as string | null) ?? null)
}

/** Choisit le bloc qui contient la position (la poignée, Maj+clic) ; `jusqua` : jusqu'au bloc de cette autre position. */
export function choisirBlocA(view: EditorView, pos: number, etendre = false, jusqua?: number): boolean {
  const id = idA(view.state.doc, pos)
  if (!id) return false
  const avant = CLE_CHOIX.getState(view.state)
  const tete = jusqua === undefined ? id : (idA(view.state.doc, jusqua) ?? id)
  view.dispatch(choisir(view.state, etendre && avant ? { ancre: avant.ancre, tete: id } : { ancre: id, tete }))
  return true
}

/** Les ids des blocs que la sélection de texte touche, du premier au dernier. */
export function idsTouches(state: EditorState): string[] {
  const { from, to } = state.selection
  const a = idA(state.doc, from)
  const b = idA(state.doc, to)
  return a ? idsDuChoix(state.doc, { ancre: a, tete: b ?? a }) : []
}

/** Les blocs de chaque sous-arbre choisi : ce que le surlignage couvre. */
function noeudsDe(doc: NoeudPM, de: number, a: number): [number, NoeudPM][] {
  const sortie: [number, NoeudPM][] = []
  doc.nodesBetween(de, a, (n, pos) => {
    if (pos < de) return true
    sortie.push([pos, n])
    return false
  })
  return sortie
}

/** Sort de la sélection de blocs, le curseur à la fin du bloc `id` (le premier choisi). */
function revenirAuTexte(view: EditorView, id: string): boolean {
  const b = blocsDe(view.state.doc).find((x) => x.id === id)
  if (!b) return false
  const noeud = view.state.doc.nodeAt(b.pos)
  // Un bloc sans texte (une image, un séparateur) ne reprend pas la saisie.
  if (!noeud?.isTextblock) return false
  const tr = view.state.tr.setMeta(CLE_CHOIX, null)
  tr.setSelection(TextSelection.near(tr.doc.resolve(b.pos + b.taille - 1), -1))
  view.dispatch(tr.scrollIntoView())
  return true
}

/** Vide la sélection de blocs : le curseur va à la fin du dernier, et le focus quitte le texte (un Échap de plus ferme la page). */
function deselectionner(view: EditorView, ids: readonly string[]) {
  const r = racines(view.state.doc, ids)
  const tr = view.state.tr.setMeta(CLE_CHOIX, null)
  const dernier = r[r.length - 1]
  if (dernier) tr.setSelection(TextSelection.near(tr.doc.resolve(Math.max(0, dernier.fin - 1)), -1))
  view.dispatch(tr)
  const dialogue = view.dom.closest<HTMLElement>('[role="dialog"]')
  if (dialogue) dialogue.focus({ preventScroll: true })
  else view.dom.blur()
}

type Sens = -1 | 1

export interface Touche {
  sens: Sens
  maj: boolean
  alt: boolean
  mod: boolean
}

/** Le premier bloc avant `tete` qui soit son frère, avec le bloc qui le précède, s'il y en a un ; `null` s'il n'en a pas. */
function frereAvant(ordre: readonly Bloc[], i: number): Bloc | null {
  const tete = ordre[i]!
  for (let j = i - 1; j >= 0; j--) {
    const b = ordre[j]!
    if (b.profondeur === tete.profondeur && b.parent === tete.parent) return b
    if (b.profondeur < tete.profondeur) return null
  }
  return null
}

/** Le frère qui suit le sous-arbre de `tete`, ou `null`. */
function frereApres(ordre: readonly Bloc[], tete: Bloc): Bloc | null {
  const suivant = ordre.find((b) => b.pos >= tete.fin)
  return suivant && suivant.parent === tete.parent && suivant.profondeur === tete.profondeur ? suivant : null
}

const seul = (b: Bloc): Choix => ({ ancre: b.id!, tete: b.id! })

/**
 * Où vont ↑ et ↓ dans la sélection de blocs (§ 2.3), dans l'arbre des blocs : sans Maj, le bloc d'avant ou d'après
 * (celui qu'on voit), Alt le frère sans descendre ; Maj étend d'un frère (les enfants sont déjà compris), ou, sans frère
 * au-dessus, prend le parent ; ⌘ saute au premier ou au dernier bloc de la page. `null` : rien ne bouge.
 */
export function deplacerChoix(doc: NoeudPM, choix: Choix, t: Touche): Choix | null {
  const ordre = parcours(doc)
  const i = ordre.findIndex((b) => b.id === choix.tete)
  if (i < 0) return null
  const tete = ordre[i]!
  const parId = new Map(ordre.map((b) => [b.id, b]))
  const parent = tete.parent ? parId.get(tete.parent) : undefined
  if (t.mod) {
    const hauts = ordre.filter((b) => b.parent === null)
    const b = t.sens < 0 ? hauts[0] : hauts[hauts.length - 1]
    return b ? seul(b) : null
  }
  if (t.maj) {
    if (t.sens > 0) {
      const f = frereApres(ordre, tete)
      return f ? { ancre: choix.ancre, tete: f.id! } : null
    }
    const f = frereAvant(ordre, i)
    if (f) return { ancre: choix.ancre, tete: f.id! }
    return parent ? seul(parent) : null
  }
  if (t.alt) {
    if (t.sens < 0) {
      const f = frereAvant(ordre, i)
      return f ? seul(f) : parent ? seul(parent) : null
    }
    const f = ordre.find((b) => b.pos >= tete.fin)
    return f ? seul(f) : null
  }
  // Sans modificateur : depuis le bout de la sélection qui va dans le sens de la flèche.
  const ids = idsDuChoix(doc, choix)
  const bout = t.sens < 0 ? ids[0] : ids[ids.length - 1]
  const k = ordre.findIndex((b) => b.id === bout)
  const voisin = ordre[k + t.sens]
  return voisin ? seul(voisin) : null
}

/** Ce que ← et → font (§ 2.3) : fermer ou ouvrir un dépliant, sinon aller au parent ou au premier enfant. */
export function gaucheDroite(doc: NoeudPM, choix: Choix, sens: Sens): { choix?: Choix; basculer?: { pos: number; ouvert: boolean } } | null {
  const ordre = parcours(doc)
  const tete = ordre.find((b) => b.id === choix.tete)
  if (!tete) return null
  const depliant = tete.type === 'deroulant' || tete.type.startsWith('titreDeroulant')
  const ouvert = tete.format.ouvert !== false
  if (sens < 0) {
    if (depliant && ouvert) return { basculer: { pos: tete.pos, ouvert: false } }
    const parent = ordre.find((b) => b.id === tete.parent)
    return parent ? { choix: seul(parent) } : null
  }
  if (depliant && !ouvert) return { basculer: { pos: tete.pos, ouvert: true } }
  const enfant = ordre.find((b) => b.id === tete.enfants[0])
  return enfant ? { choix: seul(enfant) } : null
}

/** Des blocs de même parent : ce que ⌘D exige. */
const memeParent = (doc: NoeudPM, ids: readonly string[]) => new Set(racines(doc, ids).map((r) => r.bloc.parent)).size <= 1

/** ⌘D : duplique et choisit les copies. */
function dupliquerEtChoisir(view: EditorView, ids: readonly string[]): boolean {
  if (!ids.length || !memeParent(view.state.doc, ids)) return true
  const d = dupliquer(view.state, ids)
  if (d) view.dispatch(choisir(view.state, { ancre: d.copies[0]!, tete: d.copies[d.copies.length - 1]! }, d.tr))
  return true
}

/** ⌘↵ : coche les tâches choisies, ou ouvre et ferme les dépliants. */
function activer(view: EditorView, ids: readonly string[]): boolean {
  const r = racines(view.state.doc, ids)
  const tr = view.state.tr
  const taches = r.filter((x) => x.noeud.type.name === 'tache')
  const cocher = taches.length ? !taches[0]!.noeud.attrs.coche : false
  for (const x of r) {
    const n = x.noeud
    if (n.type.name === 'tache') tr.setNodeAttribute(x.pos, 'coche', cocher)
    else if ('ouvert' in n.attrs && (n.type.name === 'depliant' || n.attrs.depliant)) tr.setNodeAttribute(x.pos, 'ouvert', n.attrs.ouvert === false)
  }
  if (tr.docChanged) {
    view.dispatch(tr)
    for (const x of r) if (x.noeud.type.name === 'tache' && !!x.noeud.attrs.coche !== cocher) animerCaseDuBloc(view, x.pos, cocher)
  }
  return true
}

/** ⌘A en sélection de blocs : tous les blocs de la page. */
export function toutChoisir(doc: NoeudPM): Choix | null {
  const ordre = parcours(doc)
  return ordre.length ? { ancre: ordre[0]!.id!, tete: ordre[ordre.length - 1]!.id! } : null
}

/** Les touches qui passent à l'éditeur même pendant la sélection de blocs : copier, couper, coller, annuler. */
const PASSENT = new Set(['c', 'x', 'v', 'z', 'y'])

function toucheDuChoix(view: EditorView, e: KeyboardEvent, choix: Choix): boolean {
  const { state } = view
  const mod = e.metaKey || e.ctrlKey
  const ids = idsDuChoix(state.doc, choix)
  const viser = (c: Choix | null, haut?: boolean) => {
    if (c) view.dispatch(choisir(state, c, state.tr, haut).scrollIntoView())
    return true
  }
  // Après un déplacement, les mêmes blocs restent choisis.
  const garder = (tr: Transaction | null) => {
    if (tr) view.dispatch(choisir(state, choix, tr))
    return true
  }
  if (e.key === 'Escape') {
    deselectionner(view, ids)
    return true
  }
  if (e.key === 'Enter') {
    if (mod) return activer(view, ids)
    if (ids[0] && revenirAuTexte(view, ids[0])) return true
    return true
  }
  if (e.key === 'Backspace' || e.key === 'Delete') {
    const tr = supprimer(state, ids)
    if (tr) view.dispatch(tr.setMeta(CLE_CHOIX, null))
    return true
  }
  if (mod && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) return garder(decaler(state, ids, e.key === 'ArrowUp' ? -1 : 1))
  if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd') return dupliquerEtChoisir(view, ids)
  if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'a') return viser(toutChoisir(state.doc))
  if (e.key === 'Tab') return garder(indenter(state, ids, e.shiftKey ? -1 : 1, false))
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    return viser(deplacerChoix(state.doc, choix, { sens: e.key === 'ArrowUp' ? -1 : 1, maj: e.shiftKey, alt: e.altKey, mod }), e.key === 'ArrowUp')
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    if (mod || e.shiftKey || e.altKey) return true
    const action = gaucheDroite(state.doc, choix, e.key === 'ArrowLeft' ? -1 : 1)
    if (action?.basculer) view.dispatch(state.tr.setNodeAttribute(action.basculer.pos, 'ouvert', action.basculer.ouvert))
    else if (action?.choix) viser(action.choix)
    return true
  }
  if (mod && PASSENT.has(e.key.toLowerCase())) return false
  // ⌘⌥chiffre, ⌘/ : la transformation s'applique aux blocs choisis par la sélection de l'éditeur.
  if (mod) return false
  // Une lettre tapée n'écrase rien (NOTION.md § 7).
  if (e.key.length === 1) return true
  return false
}

/** ⌘A dans le texte : le texte du bloc, puis celui de la page, puis tous les blocs (§ 2.2). */
function toutDansLeTexte(view: EditorView): boolean {
  const { state } = view
  const { selection, doc } = state
  const debutPage = TextSelection.atStart(doc).from
  const finPage = TextSelection.atEnd(doc).to
  if (selection.from <= debutPage && selection.to >= finPage) {
    const tous = toutChoisir(doc)
    if (tous) view.dispatch(choisir(state, tous))
    return true
  }
  const { $from, $to } = selection
  if ($from.parent.isTextblock && $from.sameParent($to) && !(selection.from <= $from.start() && selection.to >= $from.end())) {
    view.dispatch(state.tr.setSelection(TextSelection.create(doc, $from.start(), $from.end())))
    return true
  }
  view.dispatch(state.tr.setSelection(TextSelection.create(doc, debutPage, finPage)))
  return true
}

const SENS_FLECHE: Record<string, 'up' | 'down' | 'backward' | 'forward'> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'backward', ArrowRight: 'forward' }

/**
 * Maj+flèche qui sort du bloc : plutôt que d'étendre le texte au bloc voisin, on passe à la sélection de blocs, le bloc
 * du curseur et celui d'à côté. Rend vrai si la touche a servi.
 */
function deborder(view: EditorView, e: KeyboardEvent): boolean {
  const { selection, doc } = view.state
  const { $from, $to } = selection
  if (!$from.sameParent($to) || !$from.parent.isTextblock) return false
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === 'table') return false
  const sens = SENS_FLECHE[e.key]!
  // Le bout mobile de la sélection doit être du côté de la flèche.
  if (!selection.empty && (sens === 'down' || sens === 'forward' ? selection.head !== selection.to : selection.head !== selection.from)) return false
  let dehors: boolean
  try {
    dehors = view.endOfTextblock(sens)
  } catch {
    return false
  }
  if (!dehors) return false
  const id = idA(doc, selection.from)
  const ordre = parcours(doc)
  const i = ordre.findIndex((b) => b.id === id)
  const voisin = ordre[i + (sens === 'up' || sens === 'backward' ? -1 : 1)]
  if (i < 0 || !voisin) return false
  view.dispatch(choisir(view.state, { ancre: ordre[i]!.id!, tete: voisin.id! }).scrollIntoView())
  return true
}

/** Le bloc sous un événement de souris : son id. */
function blocSous(view: EditorView, e: MouseEvent): string | null {
  const cible = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-bloc]') : null
  if (cible && view.dom.contains(cible)) {
    try {
      return idA(view.state.doc, view.posAtDOM(cible, 0))
    } catch {
      return null
    }
  }
  const ou = view.posAtCoords({ left: e.clientX, top: e.clientY })
  return ou ? idA(view.state.doc, ou.pos) : null
}

/** Les lignes du texte dans l'écran, pour savoir quel bloc est sous un point (hors de l'éditeur aussi). */
function lignesEcran(view: EditorView): Ligne[] {
  return blocsDe(view.state.doc).flatMap((b) => {
    const dom = view.nodeDOM(b.pos)
    if (!b.id || b.type === 'colonne' || !(dom instanceof HTMLElement)) return []
    const r = dom.getBoundingClientRect()
    return r.height === 0 ? [] : [{ id: b.id, type: b.type, pos: b.pos, fin: b.fin, niveau: 0, parent: b.parent, conteneur: null, cadre: { gauche: r.left, droite: r.right }, ferme: false, aEnfants: false, gauche: r.left, haut: r.top, droite: r.right, bas: r.bottom }]
  })
}

/**
 * Une sélection de texte tirée au-delà de son bloc (§ 2.2) : dès que le pointeur sort du bloc, agrandi de 20 px, ce sont
 * les blocs de celui d'où l'on est parti à celui qu'on survole qui sont choisis.
 */
function glisserLeTexte(view: EditorView, origine: string, domOrigine: HTMLElement) {
  let actif = false
  let dernier: Choix | null = null
  const bouger = (m: MouseEvent) => {
    if (!actif) {
      const r = domOrigine.getBoundingClientRect()
      if (!sortiDuTexte({ gauche: r.left, haut: r.top, droite: r.right, bas: r.bottom }, m.clientX, m.clientY)) return
      actif = true
      // Le navigateur n'étend plus de texte pendant que les blocs se choisissent.
      view.dom.classList.add('notak-blocs-glisse')
    }
    const sous = ligneSelonY(lignesEcran(view), m.clientY)
    if (!sous) return
    if (dernier?.tete === sous.id) return
    dernier = { ancre: origine, tete: sous.id }
    view.dispatch(choisir(view.state, dernier))
  }
  const lacher = () => {
    window.removeEventListener('mousemove', bouger, true)
    window.removeEventListener('mouseup', lacher, true)
    view.dom.classList.remove('notak-blocs-glisse')
    if (actif && dernier && !view.isDestroyed) {
      // Une dernière variation de la sélection du navigateur ne défait pas le choix.
      if (!CLE_CHOIX.getState(view.state)) view.dispatch(choisir(view.state, dernier))
      view.focus()
    }
  }
  window.addEventListener('mousemove', bouger, true)
  window.addEventListener('mouseup', lacher, true)
}

/** ⌘+clic : ajoute ce bloc aux blocs choisis (ou au bloc du curseur, `base`), ou l'en retire. `null` : il n'en reste aucun. */
export function basculerBloc(doc: NoeudPM, choix: Choix | null, base: string | null, id: string): Choix | null {
  const choisis = new Set(choix ? idsDuChoix(doc, choix) : base ? [base] : [])
  if (!choisis.delete(id)) choisis.add(id)
  const ids = parcours(doc)
    .map((b) => b.id!)
    .filter((x) => choisis.has(x))
  if (ids.length === 0) return null
  return { ancre: ids[0]!, tete: choisis.has(id) ? id : ids[ids.length - 1]!, ids }
}

/**
 * Ce que choisit un appui sur la poignée (§ 1.3) : le bloc seul, ou, s'il fait déjà partie de la sélection, toute la
 * sélection ; Maj étend depuis le premier bloc choisi, Maj+⌘ ajoute le bloc ou le retire.
 */
export function choixDeLaPoignee(doc: NoeudPM, choix: Choix | null, id: string, maj: boolean, mod: boolean): Choix | null {
  if (maj && mod) return basculerBloc(doc, choix, null, id)
  if (maj) return { ancre: choix?.ancre ?? id, tete: id }
  if (choix && idsDuChoix(doc, choix).includes(id)) return choix
  return { ancre: id, tete: id }
}

export const SelectionBlocs = Extension.create({
  name: 'selectionBlocs',
  // Après les menus (« / », `@`), qui gardent leurs touches tant qu'ils sont ouverts.
  priority: 1150,
  addProseMirrorPlugins() {
    return [
      new Plugin<Choix | null>({
        key: CLE_CHOIX,
        state: {
          init: () => null,
          apply: (tr, avant) => {
            const meta = tr.getMeta(CLE_CHOIX) as Choix | null | undefined
            if (meta !== undefined) return meta
            if (!avant) return null
            // Un clic dans le texte, une frappe : on revient au texte.
            if (tr.selectionSet) return null
            return idsDuChoix(tr.doc, avant).length ? avant : null
          },
        },
        props: {
          decorations(state) {
            const choix = CLE_CHOIX.getState(state)
            if (!choix) return null
            const r = racines(state.doc, idsDuChoix(state.doc, choix))
            return DecorationSet.create(
              state.doc,
              r.flatMap(({ pos, fin }) => noeudsDe(state.doc, pos, fin).map(([p, n]) => Decoration.node(p, p + n.nodeSize, { class: 'notak-bloc-choisi' }))),
            )
          },
          attributes: (state): Record<string, string> => (CLE_CHOIX.getState(state) ? { 'data-choix-blocs': '' } : {}),
          handleKeyDown(view, e) {
            if (e.isComposing) return false
            const choix = CLE_CHOIX.getState(view.state)
            if (choix) return toucheDuChoix(view, e, choix)
            const mod = e.metaKey || e.ctrlKey
            // Échap choisit tous les blocs que la sélection de texte touche (NOTION.md § 7).
            if (e.key === 'Escape' && !mod && !e.altKey) return choisirBlocA(view, view.state.selection.from, false, view.state.selection.to)
            if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'a') return toutDansLeTexte(view)
            if (e.shiftKey && !mod && !e.altKey && e.key in SENS_FLECHE) return deborder(view, e)
            if (!mod) return false
            const ids = idsTouches(view.state)
            if (!ids.length) return false
            if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
              const tr = decaler(view.state, ids, e.key === 'ArrowUp' ? -1 : 1)
              if (tr) view.dispatch(tr)
              return true
            }
            if (!e.shiftKey && !e.altKey && e.key.toLowerCase() === 'd') return dupliquerEtChoisir(view, ids)
            return false
          },
          handleDOMEvents: {
            mousedown: (view, e) => {
              if (e.button !== 0) return false
              const choix = CLE_CHOIX.getState(view.state)
              const mod = e.metaKey || e.ctrlKey
              const cible = blocSous(view, e)
              const depart = idA(view.state.doc, view.state.selection.anchor)
              // Maj+clic étend la sélection de blocs, Maj+⌘ (ou ⌘ en sélection de blocs) y ajoute ou en retire un bloc.
              if (cible && (e.shiftKey || (mod && choix))) {
                if (mod) {
                  const bascule = basculerBloc(view.state.doc, choix ?? null, depart, cible)
                  e.preventDefault()
                  view.dispatch(bascule ? choisir(view.state, bascule) : view.state.tr.setMeta(CLE_CHOIX, null))
                  return true
                }
                // Dans le texte d'un seul bloc, Maj+clic étend le texte comme partout.
                const origine = choix?.ancre ?? depart
                if (!origine || (!choix && origine === cible)) return false
                e.preventDefault()
                view.dispatch(choisir(view.state, { ancre: origine, tete: cible }))
                return true
              }
              if (choix) {
                // Un appui dans le texte quitte la sélection de blocs : l'éditeur, qui la couvre, y verrait le début d'un glisser.
                const ou = view.posAtCoords({ left: e.clientX, top: e.clientY })
                const tr = view.state.tr.setMeta(CLE_CHOIX, null)
                if (ou) tr.setSelection(TextSelection.near(view.state.doc.resolve(ou.pos)))
                view.dispatch(tr)
                return false
              }
              const domBloc = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-bloc]') : null
              if (cible && domBloc && !mod) glisserLeTexte(view, cible, domBloc)
              return false
            },
          },
          // Ce qui s'écrit sans touche (la dictée, un collage de texte brut) n'écrase pas non plus les blocs choisis.
          handleTextInput: (view) => !!CLE_CHOIX.getState(view.state),
        },
      }),
    ]
  },
})
