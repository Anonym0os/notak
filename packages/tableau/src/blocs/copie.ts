import { Fragment, type Node as NoeudPM, Slice } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { Extension } from '@tiptap/react'
import type { NoeudTexte } from '../coeur/tableau'
import { racines, sousArbre, supprimer } from './gestes'
import { structurer } from './rang'
import { CLE_CHOIX, idsDuChoix } from './selection'

/**
 * La copie (docs/NOTION.md § 4, relevé 1 § 10.1). Une sélection de plusieurs blocs pose trois choses :
 * - `text/plain` en Markdown lisible : titres en `#`, listes indentées, tâches `- [x]`, citations `>`, code entre
 *   clôtures, séparateurs `---` ; le gras, l'italique, le barré, le code et les liens y sont écrits en Markdown ;
 * - `text/html` propre : `h1`…, `ul`/`ol` imbriquées, `blockquote`, `pre`, `details` (collable dans un mail, Google
 *   Docs, Word) ;
 * - un type à nous, `application/x-notak-blocs` : les blocs tels quels, avec leur type, leur retrait, leurs cases, leurs
 *   couleurs ; `collage.ts` les recolle à l'identique, avec des ids neufs.
 * Un seul bloc, un tableau, des colonnes ou une image : la copie de ProseMirror, qui les connaît.
 */

/** Le type du presse-papiers où Notak range ses blocs. */
export const MIME_NOTAK = 'application/x-notak-blocs'

/** Les nœuds dont la copie reste à ProseMirror. */
const A_PART = new Set(['table', 'colonnes', 'colonne', 'image', 'apercuLien'])

// ———— Arbre ————

interface Branche {
  n: NoeudTexte
  enfants: Branche[]
}

/** Les blocs à plat en arbre, par leur retrait. */
export function arbre(blocs: readonly NoeudTexte[]): Branche[] {
  const places = structurer(blocs.map((n) => ({ type: n.type, retrait: Number(n.attrs?.retrait) || 0, ouvert: n.attrs?.ouvert !== false, depliant: !!n.attrs?.depliant })))
  const branches = blocs.map((n): Branche => ({ n, enfants: [] }))
  const racine: Branche[] = []
  places.forEach((p, i) => (p.parent === null ? racine : branches[p.parent]!.enfants).push(branches[i]!))
  return racine
}

// ———— Markdown ————

/** Le texte en ligne d'un bloc, en Markdown. */
export function inlineMarkdown(contenu: readonly NoeudTexte[] = []): string {
  return contenu
    .map((n) => {
      if (n.type === 'hardBreak') return '\n'
      if (n.text === undefined) return n.attrs?.label ? String(n.attrs.label) : ''
      const marques = n.marks?.map((m) => m.type) ?? []
      const lien = n.marks?.find((m) => m.type === 'link')
      if (marques.includes('code')) return `\`${n.text}\``
      let t = n.text
      if (lien) t = n.text === lien.attrs?.href ? n.text : `[${n.text}](${lien.attrs?.href ?? ''})`
      else {
        if (marques.includes('strike')) t = `~~${t}~~`
        if (marques.includes('italic')) t = `*${t}*`
        if (marques.includes('bold')) t = `**${t}**`
      }
      return t
    })
    .join('')
}

/** Un bloc de code, entre clôtures. */
const code = (b: NoeudTexte) => `\`\`\`${b.attrs?.language ?? ''}\n${(b.content ?? []).map((x) => x.text ?? '').join('')}\n\`\`\``

const LISTE = new Set(['puce', 'numero', 'tache', 'depliant'])

/** Le genre de liste de Markdown d'un bloc : les puces, les tâches et les dépliants s'écrivent `- `, les numérotées `1. `. */
const genre = (type: string): 'ul' | 'ol' | null => (type === 'numero' ? 'ol' : LISTE.has(type) ? 'ul' : null)

/** Le Markdown d'une suite de frères ; `niveau` : le nombre de listes dans lesquelles ils sont. Rend des lignes, et leur genre. */
function lignesMarkdown(freres: readonly Branche[], niveau: number): { texte: string; genre: 'ul' | 'ol' | null }[] {
  const sortie: { texte: string; genre: 'ul' | 'ol' | null }[] = []
  const indentation = '    '.repeat(niveau)
  let numero = 0
  for (const { n, enfants } of freres) {
    numero = n.type === 'numero' ? numero + 1 : 0
    const texte = inlineMarkdown(n.content).replace(/\n/g, `\n${indentation}`)
    let ligne: string
    switch (n.type) {
      case 'heading':
        ligne = `${'#'.repeat(Math.min(3, Number(n.attrs?.level) || 1))} ${texte}`
        break
      case 'puce':
      case 'depliant':
        ligne = `${indentation}- ${texte}`
        break
      case 'numero':
        ligne = `${indentation}${numero}. ${texte}`
        break
      case 'tache':
        ligne = `${indentation}- [${n.attrs?.coche ? 'x' : ' '}] ${texte}`
        break
      case 'citation':
      case 'encadreBloc':
        ligne = `> ${texte.replace(/\n/g, '\n> ')}`
        break
      case 'codeBlock':
        ligne = code(n)
        break
      case 'horizontalRule':
        ligne = '---'
        break
      default:
        ligne = `${indentation}${texte}`
    }
    sortie.push({ texte: ligne, genre: genre(n.type) })
    sortie.push(...lignesMarkdown(enfants, LISTE.has(n.type) ? niveau + 1 : niveau))
  }
  return sortie
}

/** Les blocs à plat en Markdown lisible : une ligne vide entre deux blocs, sauf entre deux éléments d'une même sorte de liste. */
export function versMarkdown(blocs: readonly NoeudTexte[]): string {
  const lignes = lignesMarkdown(arbre(blocs), 0)
  return lignes.map((l, i) => (i === 0 ? l.texte : `${l.genre && l.genre === lignes[i - 1]!.genre ? '\n' : '\n\n'}${l.texte}`)).join('')
}

// ———— HTML ————

const echapper = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Le texte en ligne d'un bloc, en HTML. */
export function inlineHtml(contenu: readonly NoeudTexte[] = []): string {
  return contenu
    .map((n) => {
      if (n.type === 'hardBreak') return '<br>'
      if (n.text === undefined) return echapper(n.attrs?.label ? String(n.attrs.label) : '')
      let h = echapper(n.text)
      for (const m of n.marks ?? []) {
        if (m.type === 'bold') h = `<strong>${h}</strong>`
        else if (m.type === 'italic') h = `<em>${h}</em>`
        else if (m.type === 'underline') h = `<u>${h}</u>`
        else if (m.type === 'strike') h = `<s>${h}</s>`
        else if (m.type === 'code') h = `<code>${h}</code>`
        else if (m.type === 'link') h = `<a href="${echapper(String(m.attrs?.href ?? ''))}">${h}</a>`
      }
      return h
    })
    .join('')
}

/** Le HTML d'une suite de frères : les éléments de liste voisins forment une seule liste. */
function htmlDe(freres: readonly Branche[]): string {
  let h = ''
  for (let i = 0; i < freres.length; i++) {
    const { n, enfants } = freres[i]!
    if (n.type === 'puce' || n.type === 'numero' || n.type === 'tache') {
      const ordonnee = n.type === 'numero'
      let j = i
      let items = ''
      for (; j < freres.length && (freres[j]!.n.type === 'puce' || freres[j]!.n.type === 'numero' || freres[j]!.n.type === 'tache') && (freres[j]!.n.type === 'numero') === ordonnee; j++) {
        const f = freres[j]!
        const case_ = f.n.type === 'tache' ? `<input type="checkbox" disabled${f.n.attrs?.coche ? ' checked' : ''}> ` : ''
        items += `<li>${case_}${inlineHtml(f.n.content)}${htmlDe(f.enfants)}</li>`
      }
      h += ordonnee ? `<ol>${items}</ol>` : `<ul>${items}</ul>`
      i = j - 1
      continue
    }
    const contenu = inlineHtml(n.content)
    switch (n.type) {
      case 'heading':
        h += `<h${Math.min(3, Number(n.attrs?.level) || 1)}>${contenu}</h${Math.min(3, Number(n.attrs?.level) || 1)}>`
        break
      case 'citation':
      case 'encadreBloc':
        h += `<blockquote><p>${contenu}</p>${htmlDe(enfants)}</blockquote>`
        continue
      case 'depliant':
        h += `<details${n.attrs?.ouvert === false ? '' : ' open'}><summary>${contenu}</summary>${htmlDe(enfants)}</details>`
        continue
      case 'codeBlock':
        h += `<pre><code${n.attrs?.language ? ` class="language-${echapper(String(n.attrs.language))}"` : ''}>${echapper((n.content ?? []).map((x) => x.text ?? '').join(''))}</code></pre>`
        break
      case 'horizontalRule':
        h += '<hr>'
        break
      default:
        h += `<p>${contenu}</p>`
    }
    h += htmlDe(enfants)
  }
  return h
}

export const versHtml = (blocs: readonly NoeudTexte[]): string => htmlDe(arbre(blocs))

// ———— Copier, couper ————

/** Ce que la sélection pose dans le presse-papiers, ou `null` quand la copie reste à ProseMirror. */
export function copiable(view: EditorView): { texte: string; html: string; notak: string; slice: Slice } | null {
  const { state } = view
  if (state.selection.empty) return null
  const choix = CLE_CHOIX.getState(state)
  // Des blocs choisis : les blocs entiers, avec leurs enfants. Sinon, ce que la sélection de texte recouvre.
  const slice = choix
    ? new Slice(Fragment.from(racines(state.doc, idsDuChoix(state.doc, choix)).flatMap((r) => sousArbre(state.doc, r, Number(r.noeud.attrs.retrait) || 0, false))), 0, 0)
    : state.selection.content()
  if (!choix && slice.content.childCount < 2) return null
  let ecarte = false
  slice.content.descendants((n: NoeudPM) => {
    if (A_PART.has(n.type.name)) ecarte = true
    return !ecarte
  })
  if (ecarte) return null
  const blocs = (slice.content.toJSON() as NoeudTexte[]) ?? []
  return { texte: versMarkdown(blocs), html: versHtml(blocs), notak: JSON.stringify(slice.toJSON()), slice }
}

export const CopieBlocs = Extension.create({
  name: 'copieBlocs',
  priority: 1000,
  addProseMirrorPlugins() {
    const poser = (view: EditorView, e: Event) => {
      const c = (e as ClipboardEvent).clipboardData
      if (view.composing || !c) return false
      const copie = copiable(view)
      if (!copie) return false
      e.preventDefault()
      c.clearData()
      c.setData('text/plain', copie.texte)
      c.setData('text/html', copie.html)
      c.setData(MIME_NOTAK, copie.notak)
      if (e.type === 'cut') {
        const choix = CLE_CHOIX.getState(view.state)
        const tr = choix ? supprimer(view.state, idsDuChoix(view.state.doc, choix)) : view.state.tr.deleteSelection()
        if (tr) view.dispatch(tr.setMeta('uiEvent', 'cut').setMeta(CLE_CHOIX, null).scrollIntoView())
      }
      return true
    }
    return [
      new Plugin({
        key: new PluginKey('copieBlocs'),
        props: { handleDOMEvents: { copy: poser, cut: poser } },
      }),
    ]
  },
})
