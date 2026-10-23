import { Extension, Node } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Fragment, type Node as NoeudPM, Slice } from '@tiptap/pm/model'
import { type EditorState, Plugin, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import type { MutableRefObject } from 'react'
import type { NoeudTexte } from '../../coeur/tableau'
import { glisserTache } from './glisse'
import { htmlEnTaches } from './html'
import { PROFONDEUR_MAX, type Place, hauteur, lignesEnTaches, peutDescendre, peutPoserAuNiveau, placeDe } from './liste'
import { DRAPEAU, type GenrePuce, assigneDe, attrsAllumes, attrsEteints, attrsVides, echeanceDe, jourDe, puces } from './puces'
import { animerCase } from './animation'
import { ClavierTitre, NOM_TITRE, TitreListe, ajouterTitre, curseurAuTitre, titreDe } from './titre'
import { t } from '../../langue'

/** Le document : un titre facultatif, puis la liste de tâches. */
const Document = Node.create({ name: 'doc', topNode: true, content: `${NOM_TITRE}? taskList` })

/** Pose `checked` sur la tâche en `pos` et, en cascade, sur toutes ses sous-tâches. */
export function cocherDansEditeur(editor: Editor, pos: number, enCascade: boolean) {
  const { tr } = editor.state
  const tache = tr.doc.nodeAt(pos)
  if (!tache || tache.type.name !== 'taskItem') return
  const fait = !tache.attrs.checked
  tr.setNodeMarkup(pos, undefined, { ...tache.attrs, checked: fait })
  if (enCascade) {
    tache.descendants((n, p) => {
      if (n.type.name === 'taskItem') tr.setNodeMarkup(pos + 1 + p, undefined, { ...n.attrs, checked: fait })
    })
  }
  editor.view.dispatch(tr)
}

/** Qui ouvre le menu d'une puce, par éditeur : la vue du nœud est du DOM nu, le menu est en React (voir `Taches.tsx`). */
export const ouvreursPuces = new WeakMap<Editor, (genre: GenrePuce, pos: number, ancre: HTMLElement) => void>()

/** Les attributs d'une tâche qui ne se recopient pas sur la tâche née d'une scission (Entrée). */
const attributTexte = (nom: string) => ({
  default: null,
  keepOnSplit: false,
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${nom}`),
  renderHTML: (attrs: Record<string, unknown>) => (attrs[nom] ? { [`data-${nom}`]: String(attrs[nom]) } : {}),
})

/** Un drapeau : « vrai » ou rien, jamais recopié sur la tâche née d'une scission. */
const attributDrapeau = (nom: string, attribut: string) => ({
  default: null,
  keepOnSplit: false,
  parseHTML: (el: HTMLElement) => (el.getAttribute(attribut) === 'true' ? true : null),
  renderHTML: (attrs: Record<string, unknown>) => (attrs[nom] === true ? { [attribut]: 'true' } : {}),
})

/** La case : un nœud à elle, pour garder la main sur le clic (Maj+clic) et la zone de clic. */
const Tache = TaskItem.extend({
  content: 'paragraph taskList?',
  addAttributes() {
    return { ...this.parent?.(), echeance: attributTexte('echeance'),
      assigne: attributTexte('assigne'),
      heure: attributTexte('heure'),
      rappel: attributTexte('rappel'),
      montreEcheance: attributDrapeau('montreEcheance', 'data-montre-echeance'),
      montreAssigne: attributDrapeau('montreAssigne', 'data-montre-assigne'),
    }
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      const li = document.createElement('li')
      const case_ = document.createElement('span')
      const contenu = document.createElement('div')
      case_.className = 'notak-case'
      case_.contentEditable = 'false'
      case_.setAttribute('role', 'checkbox')
      case_.addEventListener('mousedown', (e) => e.preventDefault())
      case_.addEventListener('click', (e) => {
        e.preventDefault()
        const pos = getPos()
        if (typeof pos !== 'number') return
        animerCase(case_, editor.state.doc.nodeAt(pos)?.attrs.checked !== true)
        cocherDansEditeur(editor, pos, e.shiftKey)
      })
      // Sur une tâche cochée, au survol, de quoi la retirer (et ses sous-tâches).
      const suppr = document.createElement('span')
      suppr.className = 'notak-tache-suppr'
      suppr.contentEditable = 'false'
      suppr.title = t('taches.supprimer')
      suppr.addEventListener('mousedown', (e) => e.preventDefault())
      suppr.addEventListener('click', (e) => {
        e.preventDefault()
        const pos = getPos()
        if (typeof pos === 'number') retirerDansEditeur(editor, pos)
      })
      // Sous le texte : l'échéance, la personne.
      const zonePuces = document.createElement('span')
      zonePuces.className = 'notak-puces'
      zonePuces.contentEditable = 'false'
      // À droite, au survol : la poignée pour changer la tâche de place.
      const poignee = document.createElement('span')
      poignee.className = 'notak-tache-poignee'
      poignee.contentEditable = 'false'
      poignee.title = t('taches.deplacer')
      poignee.addEventListener('pointerdown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const racine = li.closest<HTMLElement>('.notak-taches')
        if (racine) glisserTache(e, racine, li, (de, vers, place, copie) => deplacerDansEditeur(editor, de, vers, place, copie))
      })
      li.append(poignee, case_, contenu, zonePuces, suppr)
      const dessinerPuces = (n: NoeudPM) => {
        zonePuces.replaceChildren(
          ...puces(n.attrs, jourDe(new Date())).map((p) => {
            const b = document.createElement('button')
            b.type = 'button'
            b.tabIndex = -1
            b.className = 'notak-puce'
            b.dataset.genre = p.genre
            if (p.vide) b.dataset.vide = ''
            b.dataset.statut = p.statut
            if (p.rappel) b.dataset.rappel = ''
            b.title = p.titre
            b.textContent = p.texte
            b.addEventListener('mousedown', (e) => e.preventDefault())
            b.addEventListener('click', (e) => {
              e.preventDefault()
              const pos = getPos()
              if (typeof pos === 'number') ouvreursPuces.get(editor)?.(p.genre, pos, b)
            })
            return b
          }),
        )
      }
      const poser = (n: NoeudPM) => {
        dessinerPuces(n)
        li.dataset.type = 'taskItem'
        li.dataset.checked = String(n.attrs.checked === true)
        case_.setAttribute('aria-checked', String(n.attrs.checked === true))
      }
      poser(node)
      return {
        dom: li,
        contentDOM: contenu,
        update(n) {
          if (n.type !== node.type) return false
          poser(n)
          return true
        },
      }
    }
  },
}).configure({ nested: true })

/** Les tâches du document avec leur position, dans l'ordre de lecture. */
function tachesAvecPosition(doc: NoeudPM) {
  const res: { pos: number; noeud: NoeudPM }[] = []
  doc.descendants((noeud, pos) => {
    if (noeud.type.name === 'taskItem') res.push({ pos, noeud })
  })
  return res
}

/**
 * Passe la tâche `de` (son rang dans l'ordre de lecture) avant, après ou dans la tâche `vers` ; ses sous-tâches la
 * suivent. Même règle que `deplacer` (liste.ts), mais en une transaction : le curseur et le texte partagé ne sont pas
 * touchés ailleurs. Avec `copie`, la tâche reste en place et une copie prend la place. Rend faux si rien n'a bougé.
 */
export function deplacerDansEditeur(editor: Editor, de: number, vers: number, place: Place | boolean, copie = false): boolean {
  const lieu = placeDe(place)
  const { state } = editor
  const taches = tachesAvecPosition(state.doc)
  const source = taches[de]
  const cible = taches[vers]
  if (!source || !cible) return false
  const finSource = source.pos + source.noeud.nodeSize
  // Sur soi ou dans ses sous-tâches : non, sauf pour doubler la tâche à côté d'elle.
  if (cible.pos >= source.pos && cible.pos < finSource && !(copie && cible.pos === source.pos && lieu !== 'dans')) return false
  const $cible = state.doc.resolve(cible.pos)
  let niveau = 1
  for (let d = $cible.depth; d > 0; d--) if ($cible.node(d).type.name === 'taskItem') niveau += 1
  if (!peutPoserAuNiveau(niveau + (lieu === 'dans' ? 1 : 0), hauteur(source.noeud.toJSON() as NoeudTexte))) return false

  const tr = state.tr
  if (!copie) {
    const $source = state.doc.resolve(source.pos)
    // Seule dans sa sous-liste, la tâche emporte la sous-liste ; la liste du haut n'est jamais vidée (la cible est ailleurs).
    if ($source.parent.childCount === 1 && $source.depth > 1) tr.delete(source.pos - 1, finSource + 1)
    else tr.delete(source.pos, finSource)
  }
  const posCible = tr.mapping.map(cible.pos)
  const noeudCible = tr.doc.nodeAt(posCible)
  if (!noeudCible) return false
  let arrivee: number
  let curseur: number
  if (lieu === 'dans') {
    const { taskList } = state.schema.nodes
    if (noeudCible.childCount > 1) {
      arrivee = posCible + noeudCible.nodeSize - 2
      tr.insert(arrivee, source.noeud)
      curseur = arrivee + 2
    } else {
      // La tâche n'avait pas de sous-liste : elle en reçoit une.
      arrivee = posCible + noeudCible.nodeSize - 1
      tr.insert(arrivee, taskList!.create(null, source.noeud))
      curseur = arrivee + 3
    }
  } else {
    arrivee = lieu === 'avant' ? posCible : posCible + noeudCible.nodeSize
    // Avant ou après une tâche, on est toujours dans une liste ; par prudence, rien ne bouge sinon.
    if (tr.doc.resolve(arrivee).parent.type.name !== 'taskList') return false
    tr.insert(arrivee, source.noeud)
    curseur = arrivee + 2
  }
  tr.setSelection(TextSelection.near(tr.doc.resolve(curseur)))
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

/** Remplace toute la liste (sous le titre) par `liste` (un nœud `taskList`), d'un seul pas, curseur au début de la première tâche. */
export function remplacerListe(editor: Editor, liste: NoeudTexte) {
  const { doc, schema } = editor.state
  const debut = titreDe(doc)?.noeud.nodeSize ?? 0
  const tr = editor.state.tr.replaceWith(debut, doc.content.size, schema.nodeFromJSON(liste))
  tr.setSelection(TextSelection.near(tr.doc.resolve(debut + 3)))
  editor.view.dispatch(tr)
}

/** Retire la tâche en `pos` ; seule dans sa liste, elle emporte la liste, ou laisse une tâche vide tout en haut. */
export function retirerDansEditeur(editor: Editor, pos: number) {
  const { state } = editor
  const tache = state.doc.nodeAt(pos)
  if (!tache) return
  const $pos = state.doc.resolve(pos)
  const liste = $pos.parent
  const tr = state.tr
  if (liste.childCount > 1) tr.delete(pos, pos + tache.nodeSize)
  else if ($pos.depth > 1) tr.delete(pos - 1, pos + tache.nodeSize + 1)
  else tr.replaceWith(pos, pos + tache.nodeSize, state.schema.nodes.taskItem!.create({ checked: false }, state.schema.nodes.paragraph!.create()))
  editor.view.dispatch(tr)
}

/** Ce que l'éditeur demande à la liste autour de lui. */
export interface GestesTaches {
  /** La liste vide part à la corbeille. */
  jeter(): void
}

/**
 * Retour arrière au début de la première tâche : avec un titre, le curseur y remonte, et la tâche vide qui a des
 * voisines est retirée ; sans titre, une première tâche vide devient le titre, ou la liste part à la corbeille
 * si elle est seule.
 */
export const clavierListe = (gestes: MutableRefObject<GestesTaches>) => {
  const retour = ({ editor }: { editor: Editor }) => {
    const { $from, empty } = editor.state.selection
    if (!empty || $from.parentOffset !== 0 || $from.depth !== 3 || $from.index(1) !== 0 || $from.index(2) !== 0) return false
    const tache = $from.node(2)
    const liste = $from.node(1)
    const aTitre = !!titreDe(editor.state.doc)
    const vide = tache.childCount === 1 && tache.textContent === ''
    if (!vide) {
      // Du texte ou des sous-tâches : seul le curseur monte, s'il y a un titre.
      if (!aTitre) return false
      curseurAuTitre(editor)
      return true
    }
    if (liste.childCount > 1) {
      const pos = $from.before(2)
      editor.view.dispatch(editor.state.tr.delete(pos, pos + tache.nodeSize))
      if (aTitre) curseurAuTitre(editor)
      else ajouterTitre(editor)
    } else if (aTitre) curseurAuTitre(editor)
    else gestes.current.jeter()
    return true
  }
  // Cmd ou Alt + retour arrière sur une tâche vide : comme le retour arrière seul (voir `ClavierTaches`).
  const retourModifie = (p: { editor: Editor }) => texteVide(p.editor.state) && retour(p)
  return Extension.create({
    name: 'clavierListe',
    priority: 300,
    addKeyboardShortcuts() {
      return { Backspace: retour, 'Mod-Backspace': retourModifie, 'Alt-Backspace': retourModifie }
    },
  })
}

/** Le curseur est dans le texte d'une tâche, et ce texte est vide. */
export function texteVide(etat: EditorState): boolean {
  const { $from, empty } = etat.selection
  return empty && $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0 && $from.node(-1).type.name === 'taskItem'
}

/** Les tâches parmi les ancêtres de la sélection : leur niveau (1 = en haut) et leur hauteur. */
function tachesAutour(etat: EditorState) {
  const { $from, $to } = etat.selection
  const vues = [$from, $to].map((p) => {
    let niveau = 0
    let derniere: NoeudPM | null = null
    for (let d = p.depth; d > 0; d--) {
      const n = p.node(d)
      if (n.type.name !== 'taskItem') continue
      niveau += 1
      derniere ??= n
    }
    return { niveau, tache: derniere }
  })
  return vues
}

/**
 * Retour arrière au début d'une tâche : son texte rejoint la tâche d'avant (la dernière sous-tâche
 * de la précédente, s'il y en a), et ses propres sous-tâches la suivent. Sans tâche d'avant dans sa liste,
 * en haut on ne fait rien, plus bas Tiptap la remonte d'un niveau (rend faux).
 */
export function fusionnerAvecPrecedente(editor: Editor): boolean {
  const { state } = editor
  const { $from, empty } = state.selection
  const profItem = $from.depth - 1
  if (!empty || $from.parentOffset !== 0 || profItem < 1 || $from.node(profItem).type.name !== 'taskItem') return false
  const indice = $from.index(profItem - 1)
  const niveau = tachesAutour(state)[0]!.niveau
  if (indice === 0) return niveau === 1

  const item = $from.node(profItem)
  const posItem = $from.before(profItem)
  let cible = $from.node(profItem - 1).child(indice - 1)
  let posCible = posItem - cible.nodeSize
  let niveauCible = niveau
  while (cible.childCount > 1) {
    const sous = cible.child(1)
    const derniere = sous.lastChild!
    posCible += 2 + cible.child(0).nodeSize + sous.content.size - derniere.nodeSize
    cible = derniere
    niveauCible += 1
  }
  // Une tâche vide juste avant : c'est elle qui disparaît, la tâche courante garde son texte, ses sous-tâches et ses puces.
  if (cible.childCount === 1 && cible.textContent === '') {
    const $cible = state.doc.resolve(posCible)
    const seule = $cible.parent.childCount === 1 && $cible.depth > 1
    const tr = state.tr.delete(seule ? posCible - 1 : posCible, posCible + cible.nodeSize + (seule ? 1 : 0))
    editor.view.dispatch(tr.scrollIntoView())
    return true
  }
  if (niveauCible + hauteur(item.toJSON() as NoeudTexte) - 1 > PROFONDEUR_MAX) return true

  const finTexte = posCible + cible.child(0).nodeSize
  const tr = state.tr.delete(posItem, posItem + item.nodeSize)
  if (item.childCount > 1) tr.insert(finTexte + 1, item.child(1))
  tr.insert(finTexte, item.child(0).content)
  tr.setSelection(TextSelection.create(tr.doc, finTexte))
  editor.view.dispatch(tr.scrollIntoView())
  return true
}

/**
 * Cmd ou Alt + retour arrière sur une tâche vide la réduit : elle se fond dans la précédente, ou, première
 * de sa sous-liste, remonte d'un niveau. Sur une tâche qui a du texte, c'est l'effacement d'un mot, comme partout.
 */
export function reduireVide(editor: Editor): boolean {
  if (!texteVide(editor.state)) return false
  if (fusionnerAvecPrecedente(editor)) return true
  editor.commands.liftListItem('taskItem')
  return true
}

/** La profondeur des nœuds ouverts au bout d'un nœud, jusqu'à son dernier bloc de texte (compris). */
function ouvertsAuBout(n: NoeudPM | null): number {
  let d = 0
  while (n && !n.isTextblock) {
    n = n.lastChild
    d++
  }
  return d + 1
}

/**
 * Des lignes ou une liste collées (d'un autre logiciel) deviennent des tâches ; ce qui vient de Notak se colle tel quel.
 * Le HTML passe en premier (puces et sous-listes de Google Docs), le texte brut sinon.
 */
const CollageEnTaches = new Plugin({
  props: {
    handlePaste(view, event) {
      const donnees = event.clipboardData
      const html = donnees?.getData('text/html') ?? ''
      if (!donnees || html.includes('data-pm-slice')) return false
      const taches = htmlEnTaches(html) ?? lignesEnTaches(donnees.getData('text/plain'))
      if (!taches) return false
      const noeuds = taches.map((t) => view.state.schema.nodeFromJSON(t))
      const tranche = new Slice(Fragment.fromArray(noeuds), 2, ouvertsAuBout(noeuds.at(-1) ?? null))
      view.dispatch(view.state.tr.replaceSelection(tranche).scrollIntoView())
      return true
    },
  },
})

/** La tâche dont la sélection couvre tout le texte, de bout en bout : c'est elle, et non son texte, qu'on copie ou qu'on coupe. */
export function tacheEntiere(etat: EditorState): { pos: number; noeud: NoeudPM } | null {
  const { $from, $to, empty } = etat.selection
  if (empty || !$from.sameParent($to) || $from.parent.type.name !== 'paragraph' || $from.node(-1).type.name !== 'taskItem') return null
  if ($from.parentOffset !== 0 || $to.parentOffset !== $to.parent.content.size) return null
  return { pos: $from.before($from.depth - 1), noeud: $from.node($from.depth - 1) }
}

/**
 * Copier (ou couper) tout le texte d'une tâche emporte la tâche : dans une liste fermée, avec ses puces mais sans ses
 * sous-tâches. Coupée, la ligne reste, vidée et remise à zéro (plus d'échéance ni de personne).
 */
function copieDeTache(couper: boolean) {
  return (view: EditorView, e: Event): boolean => {
    const donnees = (e as ClipboardEvent).clipboardData
    const tache = tacheEntiere(view.state)
    if (!donnees || !tache) return false
    const { schema } = view.state
    const seule = schema.nodes.taskItem!.create(tache.noeud.attrs, tache.noeud.child(0))
    const { dom, text } = view.serializeForClipboard(new Slice(Fragment.from(schema.nodes.taskList!.create(null, seule)), 0, 0))
    e.preventDefault()
    donnees.clearData()
    donnees.setData('text/html', dom.innerHTML)
    donnees.setData('text/plain', text)
    if (couper) {
      const tr = view.state.tr.delete(tache.pos + 2, tache.pos + 2 + tache.noeud.child(0).content.size)
      tr.setNodeMarkup(tache.pos, undefined, { ...tache.noeud.attrs, ...attrsEteints('echeance'), ...attrsEteints('assigne') })
      view.dispatch(tr)
    }
    return true
  }
}

const CopieDeTache = new Plugin({ props: { handleDOMEvents: { copy: copieDeTache(false), cut: copieDeTache(true) } } })

const tacheVierge = (editor: Editor) => editor.state.schema.nodes.taskItem!.create({ checked: false }, editor.state.schema.nodes.paragraph!.create())

/**
 * Entrée. Rend faux (Tiptap scinde la tâche) sauf dans deux cas : une tâche vide de premier niveau appelle une
 * nouvelle tâche dessous, et le curseur au début d'une tâche qui a du texte glisse une tâche vierge au-dessus.
 */
export function entree(editor: Editor): boolean {
  const { state } = editor
  const { $from, empty } = state.selection
  const [v] = tachesAutour(state)
  if (!empty || !v || !v.tache || $from.parent.type.name !== 'paragraph' || $from.node(-1).type.name !== 'taskItem') return false
  const profItem = $from.depth - 1
  if (v.tache.childCount === 1 && v.tache.textContent === '') {
    if (v.niveau !== 1) return false
    const apres = $from.after(profItem)
    const tr = state.tr.insert(apres, tacheVierge(editor))
    tr.setSelection(TextSelection.near(tr.doc.resolve(apres + 2)))
    editor.view.dispatch(tr.scrollIntoView())
    return true
  }
  if ($from.parentOffset === 0 && $from.index(profItem) === 0 && v.tache.child(0).content.size > 0) {
    // Le curseur reste dans la tâche d'origine, qui descend d'un rang avec ses sous-tâches et ses puces.
    editor.view.dispatch(state.tr.insert($from.before(profItem), tacheVierge(editor)).scrollIntoView())
    return true
  }
  return false
}

/** La tâche sous le curseur (la plus profonde), avec sa position. */
export function tacheCourante(editor: Editor): { pos: number; noeud: NoeudPM } | null {
  const { $from } = editor.state.selection
  for (let prof = $from.depth; prof > 0; prof--) {
    if ($from.node(prof).type.name === 'taskItem') return { pos: $from.before(prof), noeud: $from.node(prof) }
  }
  return null
}

/** La puce `genre` est-elle allumée sur cette tâche : demandée, ou déjà garnie ? */
export const puceActive = (attrs: Record<string, unknown> | undefined, genre: GenrePuce): boolean =>
  genre === 'echeance' ? attrs?.montreEcheance === true || echeanceDe(attrs) !== null : attrs?.montreAssigne === true || assigneDe(attrs) !== null

/** Ouvre le choix d'une puce une fois qu'elle est dessinée (au rendu qui suit). */
function ouvrirPuceApres(editor: Editor, pos: number, genre: GenrePuce) {
  requestAnimationFrame(() => {
    if (editor.isDestroyed) return
    const dom = editor.view.nodeDOM(pos) as HTMLElement | null
    const puce = dom?.querySelector<HTMLElement>(`:scope > .notak-puces > .notak-puce[data-genre="${genre}"]`)
    if (puce) ouvreursPuces.get(editor)?.(genre, pos, puce)
  })
}

/** Cmd+Maj+1, Cmd+Maj+2 : allume la puce de la tâche sous le curseur (sans toucher à ce qu'elle porte) et ouvre son choix. */
export function demanderPuce(editor: Editor, genre: GenrePuce): boolean {
  const tache = tacheCourante(editor)
  if (!tache) return true
  if (tache.noeud.attrs[DRAPEAU[genre]] !== true)
    editor.view.dispatch(editor.state.tr.setNodeMarkup(tache.pos, undefined, { ...tache.noeud.attrs, ...attrsAllumes(genre) }))
  ouvrirPuceApres(editor, tache.pos, genre)
  return true
}

/**
 * Les outils Échéance et Assigner de la barre : allument la puce de la tâche sous le curseur et ouvrent son
 * choix, ou l'éteignent (avec ce qu'elle porte) si elle est allumée. À l'allumage, l'assigné est vidé.
 */
export function basculerPuce(editor: Editor, genre: GenrePuce): boolean {
  const tache = tacheCourante(editor)
  if (!tache) return false
  const apres = puceActive(tache.noeud.attrs, genre)
    ? attrsEteints(genre)
    : { ...(genre === 'assigne' ? attrsVides('assigne') : {}), ...attrsAllumes(genre) }
  editor.view.dispatch(editor.state.tr.setNodeMarkup(tache.pos, undefined, { ...tache.noeud.attrs, ...apres }))
  if (!puceActive(tache.noeud.attrs, genre)) ouvrirPuceApres(editor, tache.pos, genre)
  return true
}

/** Peut-on descendre (`1`) ou remonter (`-1`) les tâches de la sélection d'un niveau ? */
export function peutRetrait(editor: Editor, sens: 1 | -1): boolean {
  const autour = tachesAutour(editor.state)
  if (sens === -1) return autour.every((v) => v.niveau >= 2)
  return autour.every((v) => v.tache && peutDescendre(v.niveau, hauteur(v.tache.toJSON() as NoeudTexte))) && editor.can().sinkListItem('taskItem')
}

/** Descend (`1`, Tab) ou remonte (`-1`, Maj+Tab) les tâches de la sélection d'un niveau, quand c'est permis. */
export function retrait(editor: Editor, sens: 1 | -1): boolean {
  if (!peutRetrait(editor, sens)) return false
  return sens === 1 ? editor.commands.sinkListItem('taskItem') : editor.commands.liftListItem('taskItem')
}

/** Tab et Maj+Tab restent dans la note, même quand il n'y a rien à faire. */
const ClavierTaches = Extension.create({
  name: 'clavierTaches',
  priority: 200,
  addProseMirrorPlugins() {
    return [CollageEnTaches, CopieDeTache]
  },
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const ok = tachesAutour(editor.state).every(
          (v) => v.tache && peutDescendre(v.niveau, hauteur(v.tache.toJSON() as NoeudTexte)),
        )
        if (ok) editor.commands.sinkListItem('taskItem')
        return true
      },
      'Shift-Tab': ({ editor }) => {
        retrait(editor, -1)
        return true
      },
      Backspace: ({ editor }) => fusionnerAvecPrecedente(editor),
      'Mod-Backspace': ({ editor }) => reduireVide(editor),
      'Alt-Backspace': ({ editor }) => reduireVide(editor),
      // Une tâche vide tout en haut n'a pas de niveau où remonter : elle en appelle une nouvelle dessous ;
      // au début d'une tâche qui a du texte, la nouvelle se glisse au-dessus et la tâche garde tout.
      Enter: ({ editor }) => entree(editor),
      // Cmd+Maj+1 : l'échéance de la tâche ; Cmd+Maj+2 : la personne.
      'Mod-Shift-1': ({ editor }) => demanderPuce(editor, 'echeance'),
      'Mod-Shift-2': ({ editor }) => demanderPuce(editor, 'assigne'),
    }
  },
})

const KIT_TACHES = {
  document: false,
  heading: false,
  codeBlock: false,
  blockquote: false,
  bulletList: false,
  orderedList: false,
  listItem: false,
  horizontalRule: false,
} as const

export const EXTENSIONS_TACHES = [
  StarterKit.configure(KIT_TACHES),
  Document,
  TitreListe,
  TaskList,
  Tache,
  ClavierTitre,
  ClavierTaches,
]

/** Les mêmes, quand la liste s'écrit à plusieurs : l'annulation est alors celle du partage (voir `partage.ts`). */
export const EXTENSIONS_TACHES_PARTAGEE = [StarterKit.configure({ ...KIT_TACHES, undoRedo: false }), ...EXTENSIONS_TACHES.slice(1)]
