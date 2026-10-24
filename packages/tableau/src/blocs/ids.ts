import type { Node as NoeudPM } from '@tiptap/pm/model'
import { type EditorState, Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import { ySyncPluginKey } from '@tiptap/y-tiptap'
import { Extension } from '@tiptap/react'
import { ATTRIBUTS_TITRE } from './plats'

/**
 * Chaque bloc porte un id stable (docs/NOTION.md § 1) : c'est par lui qu'on désigne un bloc (le lien d'un bloc, la
 * sélection, les gestes du modèle), quelle que soit sa position. L'id est posé à la création, à la coupure (Entrée
 * ne le recopie pas), à la duplication et au collage (un id déjà vu plus haut est remplacé).
 */

/** Les nœuds qui sont des blocs, et portent donc un id et une couleur. */
export const TYPES_BLOCS = [
  'paragraph',
  'heading',
  'puce',
  'numero',
  'tache',
  'depliant',
  'citation',
  'encadreBloc',
  'codeBlock',
  'horizontalRule',
  'table',
  'colonnes',
  'colonne',
  'image',
  'apercuLien',
] as const

/** Les blocs qui se rangent sous un autre par leur retrait (NOTION.md § 1) : tous, sauf les rangées de colonnes. */
export const TYPES_RETRAIT = TYPES_BLOCS.filter((t) => t !== 'colonnes' && t !== 'colonne')

/** Le retrait le plus profond qu'on écrive. */
export const RETRAIT_MAX = 12

const AVEC_ID = new Set<string>(TYPES_BLOCS)

/** La transaction qui ne fait que poser des ids : l'élément ne la compte pas comme une écriture. */
export const CLE_IDS = new PluginKey('idsDeBlocs')

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/** Un id de bloc : dix caractères tirés au hasard (36¹⁰ possibilités : deux blocs ne se rencontrent pas). */
export function nouvelIdBloc(): string {
  const octets = crypto.getRandomValues(new Uint8Array(10))
  return Array.from(octets, (o) => ALPHABET[o % 36]).join('')
}

/** Les nœuds qui contiennent des blocs rangés par leur retrait : la page, et chaque colonne. */
export const CONTENEURS = new Set(['doc', 'colonne'])

/** Les blocs sans id, ou dont l'id est déjà pris plus haut : leur position et l'id qu'on leur donne. */
export function idsManquants(doc: NoeudPM, tirer: () => string = nouvelIdBloc): [number, string][] {
  const vus = new Set<string>()
  const manquants: [number, string][] = []
  doc.descendants((n, pos, parent) => {
    // Un paragraphe de cellule de tableau n'est pas un bloc de la page : on ne descend que dans les rangées et les colonnes.
    const dansLaPage = !!parent && (CONTENEURS.has(parent.type.name) || parent.type.name === 'colonnes')
    if (!AVEC_ID.has(n.type.name) || !dansLaPage) return false
    const id = n.attrs.id as string | null
    if (id && !vus.has(id)) vus.add(id)
    else {
      let neuf = tirer()
      while (vus.has(neuf)) neuf = tirer()
      vus.add(neuf)
      manquants.push([pos, neuf])
    }
    return n.type.name === 'colonnes' || n.type.name === 'colonne'
  })
  return manquants
}

/** La transaction qui donne leurs ids aux blocs qui n'en ont pas ; `null` s'ils en ont tous. */
export function poserIds(state: EditorState): Transaction | null {
  const manquants = idsManquants(state.doc)
  if (manquants.length === 0) return null
  const tr = state.tr
  for (const [pos, id] of manquants) tr.setNodeAttribute(pos, 'id', id)
  return tr.setMeta(CLE_IDS, true).setMeta('addToHistory', false)
}

/** Un attribut de bloc, écrit `data-<html>` dans la page, qui ne suit pas le bloc coupé par Entrée. */
const attribut = (cle: string, html: string) => ({
  default: null,
  keepOnSplit: false,
  parseHTML: (el: HTMLElement) => el.getAttribute(`data-${html}`),
  renderHTML: (attrs: Record<string, unknown>) => (attrs[cle] ? { [`data-${html}`]: attrs[cle] } : {}),
})

/**
 * Le retrait (0 au premier rang) : il suit le bloc coupé par Entrée, et se lit dans la page par `--notak-retrait`.
 * Le rendu prend le retrait corrigé par `structure.ts` (jamais plus d'un cran sous le bloc d'avant).
 */
const retrait = {
  default: 0,
  keepOnSplit: true,
  parseHTML: (el: HTMLElement) => Math.min(RETRAIT_MAX, Math.max(0, Number(el.getAttribute('data-retrait')) || 0)),
  renderHTML: (attrs: Record<string, unknown>) => {
    const n = Number(attrs.retrait) || 0
    return n ? { 'data-retrait': n, style: `--notak-retrait: ${n}` } : {}
  },
}

export const IdsDeBlocs = Extension.create({
  name: 'idsDeBlocs',
  addGlobalAttributes() {
    return [
      { types: [...TYPES_BLOCS], attributes: { id: attribut('id', 'bloc'), couleur: attribut('couleur', 'couleur') } },
      { types: [...TYPES_RETRAIT], attributes: { retrait } },
      { types: ['heading'], attributes: ATTRIBUTS_TITRE },
    ]
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: CLE_IDS,
        // Ce qui arrive des autres porte déjà ses ids, posés chez celui qui l'a écrit.
        appendTransaction: (trs, _, state) =>
          trs.some((tr) => tr.docChanged && !tr.getMeta(ySyncPluginKey)?.isChangeOrigin) ? poserIds(state) : null,
        // Un document d'avant les ids les reçoit à l'ouverture.
        view: (view) => {
          queueMicrotask(() => {
            if (view.isDestroyed) return
            const tr = poserIds(view.state)
            if (tr) view.dispatch(tr)
          })
          return {}
        },
      }),
    ]
  },
})
