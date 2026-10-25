import { DOMParser as AnalyseurPM, Fragment, type Node as NoeudPM, type Schema, Slice } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { Extension } from '@tiptap/react'
import { decouperAdresses } from '../elements/note/conversion'
import { proposerCollerComme } from './apercu'
import { CLE_APERCU } from './collerComme'
import { MIME_NOTAK } from './copie'
import { CONTENEURS, RETRAIT_MAX } from './ids'
import { aDuMarkdownEnLigne, blocsDepuisMarkdown, enLigne } from './collageMarkdown'
import { blocsDe } from './modele'

/**
 * Le collage (docs/NOTION.md § 4, relevé 1 § 10), dans l'ordre où Notion décide :
 * 1. dans un bloc de code, le texte entre tel quel ;
 * 2. ⌘⇧V : texte brut, sans conversion ;
 * 3. ce que Notak a copié (blocs avec leur structure) se recolle à l'identique, avec des ids neufs ;
 * 4. du code venu d'un éditeur de code (VS Code) sur plusieurs lignes devient un bloc de code ;
 * 5. du HTML riche (titres, listes, citations, tableaux — Google Docs, Notion, une page web) devient des blocs à plat,
 *    les listes imbriquées en blocs rangés par leur retrait ;
 * 6. du texte brut sur plusieurs lignes se lit comme du Markdown et devient des blocs ;
 * 7. une adresse seule : un lien sur le passage choisi, ou un lien à son propre texte, suivi — à un curseur — du menu
 *    « coller comme » (« Lien » ou « Aperçu », voir `collerComme.ts`) ; sinon le Markdown en ligne.
 * Le reste (un texte simple, un HTML qui n'est qu'un paragraphe) passe par le collage de ProseMirror. La mention et
 * l'intégration du menu « coller comme » restent à faire.
 */

/** Ce que le presse-papiers porte, des types qui nous intéressent. */
export interface Presse {
  texte: string
  html: string
  notak: string
  vscode: string
}

/** Le HTML retenu pour devenir des blocs : il porte de la mise en forme riche, pas seulement des `div` et des `span` de style. */
export const htmlRiche = (html: string): boolean => /<(h[1-6]|ul|ol|li|table|blockquote|pre|b|strong|i|em|u|s|strike|del|a|code|img)[\s>]/i.test(html)

/** Un nœud de bloc à plat, ou rien de bon à en tirer. */
function depuisJson(schema: Schema, json: unknown): NoeudPM | null {
  try {
    return schema.nodeFromJSON(json)
  } catch {
    return null
  }
}

// ———— HTML ————

/** Une liste de HTML en blocs à plat (`div` à `data-type`), ses sous-listes aussi, un cran plus bas. */
function convertirListe(liste: Element, niveau: number, doc: Document): Element[] {
  const sortie: Element[] = []
  const ordonnee = liste.tagName === 'OL'
  for (const li of Array.from(liste.children)) {
    if (li.tagName !== 'LI') continue
    // Google Docs écrit des listes à plat, le rang dans `aria-level`.
    const rang = Number(li.getAttribute('aria-level'))
    const n = rang > 0 ? Math.min(rang - 1, RETRAIT_MAX) : Math.min(niveau, RETRAIT_MAX)
    const sous = Array.from(li.children).filter((c) => c.tagName === 'UL' || c.tagName === 'OL')
    const case_ = li.querySelector('input[type="checkbox"]') as HTMLInputElement | null
    const tache = !!case_ || li.getAttribute('data-type') === 'taskItem' || li.hasAttribute('data-checked') || li.classList.contains('task-list-item')
    const coche = case_ ? case_.checked || case_.hasAttribute('checked') : li.getAttribute('data-checked') === 'true'
    const bloc = doc.createElement('div')
    bloc.setAttribute('data-type', tache ? 'tache' : ordonnee ? 'numero' : 'puce')
    if (n > 0) bloc.setAttribute('data-retrait', String(n))
    if (tache && coche) bloc.setAttribute('data-coche', '')
    const suite: Element[] = []
    let texte = false
    for (const c of Array.from(li.childNodes)) {
      if (sous.includes(c as Element)) continue
      if (c.nodeType === 1 && (c as Element).tagName === 'INPUT') continue
      if (c.nodeType === 1 && (c as Element).tagName === 'P') {
        const p = c as Element
        if (!texte) {
          bloc.append(...Array.from(p.childNodes))
          texte = true
        } else {
          p.setAttribute('data-retrait', String(n + 1))
          suite.push(p)
        }
      } else bloc.append(c.cloneNode(true))
    }
    sortie.push(bloc, ...suite)
    for (const s of sous) sortie.push(...convertirListe(s, n + 1, doc))
  }
  return sortie
}

/** Une citation de HTML en bloc à plat : ses paragraphes séparés par des retours à la ligne. */
function convertirCitation(q: Element, doc: Document): Element {
  const bloc = doc.createElement('div')
  bloc.setAttribute('data-type', 'citation')
  const ps = Array.from(q.children).filter((c) => c.tagName === 'P')
  if (ps.length === 0) bloc.append(...Array.from(q.childNodes))
  ps.forEach((p, i) => {
    if (i) bloc.append(doc.createElement('br'))
    bloc.append(...Array.from(p.childNodes))
  })
  return bloc
}

/** Les listes et les citations de la page, de la plus haute à la plus basse, en blocs à plat. */
export function aplatirHtml(racine: Element): void {
  const doc = racine.ownerDocument
  for (const l of Array.from(racine.querySelectorAll('ul, ol')).filter((x) => !x.parentElement?.closest('ul, ol'))) l.replaceWith(...convertirListe(l, 0, doc))
  for (const q of Array.from(racine.querySelectorAll('blockquote')).filter((x) => !x.parentElement?.closest('blockquote'))) q.replaceWith(convertirCitation(q, doc))
}

/** Le nœud sans les couleurs d'ailleurs : une page web ne choisit pas celles du document. */
function nettoyer(n: NoeudPM): NoeudPM {
  const marques = n.marks.filter((m) => m.type.name !== 'textStyle' && m.type.name !== 'highlight')
  if (n.isText) return marques.length === n.marks.length ? n : n.mark(marques)
  const enfants: NoeudPM[] = []
  n.forEach((c) => enfants.push(nettoyer(c)))
  return n.copy(Fragment.from(enfants))
}

/**
 * Le HTML en blocs à plat du schéma. `null` s'il n'en sort qu'un paragraphe : c'est du texte en ligne, que
 * ProseMirror colle déjà bien.
 */
export function blocsDepuisHtml(html: string, schema: Schema): NoeudPM[] | null {
  const page = new window.DOMParser().parseFromString(html, 'text/html')
  page.querySelectorAll('meta, style, script, link, title').forEach((e) => e.remove())
  aplatirHtml(page.body)
  const doc = AnalyseurPM.fromSchema(schema).parse(page.body)
  const blocs: NoeudPM[] = []
  doc.forEach((n) => blocs.push(nettoyer(n)))
  if (blocs.length === 0) return null
  if (blocs.length === 1 && blocs[0]!.type.name === 'paragraph' && !blocs[0]!.attrs.retrait) return null
  return blocs
}

// ———— Poser des blocs ————

/** Les blocs avec un autre retrait de départ : le plus bas d'entre eux prend `base`, les autres suivent. */
export function rebaser(blocs: readonly NoeudPM[], base: number): NoeudPM[] {
  const retraits = blocs.filter((b) => 'retrait' in b.attrs).map((b) => Number(b.attrs.retrait) || 0)
  const plus_bas = retraits.length ? Math.min(...retraits) : 0
  return blocs.map((b) => ('retrait' in b.attrs ? b.type.create({ ...b.attrs, retrait: Math.max(0, Math.min(RETRAIT_MAX, base + (Number(b.attrs.retrait) || 0) - plus_bas)) }, b.content, b.marks) : b))
}

/** Les mêmes blocs sans id : le collage leur en donne de neufs (`ids.ts`). */
export function sansIds(f: Fragment): Fragment {
  const enfants: NoeudPM[] = []
  f.forEach((n) => enfants.push(n.isText ? n : n.type.create('id' in n.attrs ? { ...n.attrs, id: null } : n.attrs, sansIds(n.content), n.marks)))
  return Fragment.from(enfants)
}

/**
 * Pose des blocs sous le bloc du curseur (et ses enfants), ou à la place d'un texte vide ; le curseur va à la fin du
 * dernier. Rend faux hors de la page ou d'une colonne (une cellule de tableau).
 */
export function insererBlocs(view: EditorView, blocs: readonly NoeudPM[]): boolean {
  if (blocs.length === 0) return false
  const tr = view.state.tr
  if (!tr.selection.empty) tr.deleteSelection()
  const { $from } = tr.selection
  if (!$from.parent.isTextblock || $from.depth < 1 || !CONTENEURS.has($from.node($from.depth - 1).type.name)) return false
  const debut = $from.before()
  const bloc = $from.parent
  const neufs = rebaser(blocs, Number(bloc.attrs.retrait) || 0)
  const vide = bloc.type.name === 'paragraph' && bloc.content.size === 0
  let ou = debut
  if (vide) tr.replaceWith(debut, debut + bloc.nodeSize, neufs)
  else {
    ou = blocsDe(tr.doc).find((b) => b.pos === debut)?.fin ?? debut + bloc.nodeSize
    tr.insert(ou, neufs)
  }
  const fin = ou + neufs.reduce((s, n) => s + n.nodeSize, 0)
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(fin, tr.doc.content.size)), -1))
  view.dispatch(tr.scrollIntoView().setMeta('paste', true).setMeta('uiEvent', 'paste'))
  return true
}

/** Colle ce que Notak a copié : des blocs entiers se posent comme des blocs, un passage de blocs prend la place du choix. */
function collerSlice(view: EditorView, slice: Slice): boolean {
  const propre = new Slice(sansIds(slice.content), slice.openStart, slice.openEnd)
  if (slice.openStart === 0 && slice.openEnd === 0) {
    const blocs: NoeudPM[] = []
    propre.content.forEach((n) => blocs.push(n))
    if (insererBlocs(view, blocs)) return true
  }
  view.dispatch(view.state.tr.replaceSelection(propre).scrollIntoView().setMeta('paste', true).setMeta('uiEvent', 'paste'))
  return true
}

/** L'adresse que le texte est tout entier, avec le texte tel que collé ; `null` sinon. */
function adresseSeule(texte: string): string | null {
  const m = decouperAdresses(texte)
  return m.length === 1 && m[0]!.url && m[0]!.texte === texte ? m[0]!.url : null
}

/** Colle ce qui a été copié ; rend vrai si le collage a servi (sinon ProseMirror colle comme il sait). */
export function coller(view: EditorView, d: Presse, brut: boolean): boolean {
  const { state } = view
  const { schema } = state
  const texte = d.texte.replace(/\r\n?/g, '\n')
  if (state.selection.$from.parent.type.name === 'codeBlock') {
    if (!texte) return false
    view.dispatch(state.tr.insertText(texte).scrollIntoView().setMeta('paste', true).setMeta('uiEvent', 'paste'))
    return true
  }
  if (brut) return false
  if (d.notak) {
    try {
      return collerSlice(view, Slice.fromJSON(schema, JSON.parse(d.notak)))
    } catch {
      // Un presse-papiers d'une autre version : on retombe sur le reste.
    }
  }
  const lignes = texte.replace(/\s+$/, '')
  if (d.vscode && lignes.includes('\n')) {
    let langage: string | null = null
    try {
      const mode = (JSON.parse(d.vscode) as { mode?: string }).mode
      langage = mode && mode !== 'plaintext' ? mode : null
    } catch {
      // Sans langage lisible, un code sans langage.
    }
    const code = depuisJson(schema, { type: 'codeBlock', attrs: { language: langage }, content: [{ type: 'text', text: lignes }] })
    return !!code && insererBlocs(view, [code])
  }
  if (d.html && htmlRiche(d.html)) {
    const blocs = blocsDepuisHtml(d.html, schema)
    if (blocs) return insererBlocs(view, blocs)
  }
  if (!lignes.trim()) return false
  if (lignes.includes('\n')) {
    const noeuds = blocsDepuisMarkdown(lignes).map((b) => depuisJson(schema, b))
    return noeuds.every(Boolean) && insererBlocs(view, noeuds as NoeudPM[])
  }
  const { from, to, empty } = state.selection
  const lien = schema.marks.link
  const adresse = lien && adresseSeule(lignes.trim())
  if (lien && adresse) {
    const tr = state.tr
    if (empty) tr.replaceSelectionWith(schema.text(lignes.trim(), [lien.create({ href: adresse })]), false)
    else tr.addMark(from, to, lien.create({ href: adresse }))
    // À un curseur, le menu « coller comme » s'ouvre sous la fin du lien (NOTION.md § 10.3).
    const { $from } = state.selection
    const cadre = { curseur: empty, brut, type: $from.parent.type.name, dansLaPage: $from.depth >= 1 && CONTENEURS.has($from.node($from.depth - 1).type.name) }
    if (proposerCollerComme(cadre)) tr.setMeta(CLE_APERCU, { genre: 'coller', de: from, a: tr.selection.from, texte: lignes.trim(), url: adresse, rang: 0 })
    view.dispatch(tr.scrollIntoView().setMeta('paste', true).setMeta('uiEvent', 'paste'))
    return true
  }
  if (aDuMarkdownEnLigne(lignes)) {
    const noeuds = enLigne(lignes).map((n) => depuisJson(schema, n))
    if (!noeuds.every(Boolean)) return false
    const tr = state.tr.replaceSelection(new Slice(Fragment.from(noeuds as NoeudPM[]), 0, 0))
    view.dispatch(tr.scrollIntoView().setMeta('paste', true).setMeta('uiEvent', 'paste'))
    return true
  }
  return false
}

const CLE = new PluginKey('collageBlocs')

export const CollageBlocs = Extension.create({
  name: 'collageBlocs',
  priority: 1000,
  addProseMirrorPlugins() {
    // ⌘⇧V : le collage qui suit est du texte brut.
    let brutJusqua = 0
    return [
      new Plugin({
        key: CLE,
        props: {
          handleKeyDown: (_, e) => {
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'v') brutJusqua = Date.now() + 2000
            return false
          },
          handlePaste: (view, event) => {
            const c = (event as ClipboardEvent).clipboardData
            if (!c || !view.editable || view.composing) return false
            // Des fichiers sans texte riche (une image copiée) : ils ne sont pas à nous.
            if (c.files?.length && !c.getData('text/html')) return false
            const brut = Date.now() < brutJusqua
            brutJusqua = 0
            return coller(
              view,
              { texte: c.getData('text/plain'), html: c.getData('text/html'), notak: c.getData(MIME_NOTAK), vscode: c.getData('vscode-editor-data') },
              brut,
            )
          },
        },
      }),
    ]
  },
})
