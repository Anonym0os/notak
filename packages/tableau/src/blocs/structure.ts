import type { Node as NoeudPM } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { Extension } from '@tiptap/react'
import { type Ligne, type Place, structurer } from './rang'

export { finDuSousArbre, numeroter, replie, structurer, type Ligne, type Place } from './rang'

/**
 * La structure des blocs à plat dans l'éditeur (docs/NOTION.md § 1) : le rangement de `rang.ts` posé en décorations
 * (numéros, blocs cachés, enveloppes), le clic sur les marqueurs, et `annoterPage` pour un rendu figé.
 */

/** La ligne d'un nœud de bloc. */
export const ligneDe = (n: NoeudPM): Ligne => ({
  type: n.type.name,
  retrait: Number(n.attrs.retrait) || 0,
  ouvert: n.attrs.ouvert !== false,
  depliant: !!n.attrs.depliant,
})

/** Les attributs de page qu'une place donne à son bloc. */
export function attributsDePlace(place: Place, places: readonly Place[]): Record<string, string> {
  const classes = [
    place.cache && 'notak-cache',
    place.aEnfants && 'notak-a-enfants',
    place.encadre !== null && 'notak-dans-encadre',
    place.finEncadre && 'notak-fin-encadre',
    place.citation !== null && 'notak-dans-citation',
  ].filter(Boolean)
  const style = [
    `--notak-retrait: ${place.profondeur}`,
    place.encadre !== null && `--notak-retrait-encadre: ${places[place.encadre]!.profondeur}`,
    place.citation !== null && `--notak-retrait-citation: ${places[place.citation]!.profondeur}`,
  ].filter(Boolean)
  return {
    style: style.join('; '),
    ...(classes.length ? { class: classes.join(' ') } : {}),
    ...(place.numero ? { 'data-numero': place.numero } : {}),
  }
}

/** Les décorations de la structure : chaque conteneur (la page, chaque colonne) est rangé à part. */
function decorations(doc: NoeudPM): DecorationSet {
  const deco: Decoration[] = []
  const ranger = (conteneur: NoeudPM, debut: number) => {
    const noeuds: [NoeudPM, number][] = []
    conteneur.forEach((n, decalage) => noeuds.push([n, debut + decalage]))
    const places = structurer(noeuds.map(([n]) => ligneDe(n)))
    noeuds.forEach(([n, pos], i) => {
      deco.push(Decoration.node(pos, pos + n.nodeSize, attributsDePlace(places[i]!, places)))
      if (n.type.name === 'colonnes') n.forEach((colonne, d) => ranger(colonne, pos + 1 + d + 1))
    })
  }
  ranger(doc, 0)
  return DecorationSet.create(doc, deco)
}

export const CLE_STRUCTURE = new PluginKey<DecorationSet>('structureBlocs')

/** Les marqueurs cliquables : la case d'une tâche, le triangle d'un dépliant. Ils sont dans la marge gauche du bloc. */
const MARQUEURS = '.notak-b-tache, .notak-b-depliant, [data-depliant]'

/** L'appui tombe-t-il dans la marge du marqueur (le retrait gauche du bloc, avant son texte) ? */
export function dansLeMarqueur(el: HTMLElement, x: number): boolean {
  const r = el.getBoundingClientRect()
  const marge = parseFloat(getComputedStyle(el).paddingLeft) || 0
  return x >= r.left - 2 && x < r.left + marge
}

export const StructureBlocs = Extension.create({
  name: 'structureBlocs',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: CLE_STRUCTURE,
        state: {
          init: (_, state) => decorations(state.doc),
          apply: (tr, avant) => (tr.docChanged ? decorations(tr.doc) : avant),
        },
        props: {
          decorations: (state) => CLE_STRUCTURE.getState(state),
          handleDOMEvents: {
            // Un appui sur la case coche la tâche ; sur le triangle, ouvre ou ferme le dépliant (NOTION.md § 2).
            mousedown: (view, e) => {
              if (e.button !== 0) return false
              const el = (e.target as HTMLElement).closest?.(MARQUEURS) as HTMLElement | null
              if (!el || !view.dom.contains(el) || !dansLeMarqueur(el, e.clientX)) return false
              const pos = view.posAtDOM(el, 0) - 1
              const n = view.state.doc.nodeAt(pos)
              if (!n) return false
              const cle = n.type.name === 'tache' ? 'coche' : 'ouvert'
              e.preventDefault()
              if (!view.editable && cle === 'coche') return true
              view.dispatch(view.state.tr.setNodeAttribute(pos, cle, cle === 'coche' ? !n.attrs.coche : n.attrs.ouvert === false))
              return true
            },
          },
        },
      }),
    ]
  },
})

/**
 * Le même rangement sur un rendu figé (la lecture, l'aperçu de la carte) : les blocs portent `data-retrait` et
 * `data-type` (ou sont des titres), on y pose numéros, blocs cachés et enveloppes.
 */
export function annoterPage(racine: HTMLElement) {
  const ranger = (conteneur: Element) => {
    const els = [...conteneur.children].filter((c): c is HTMLElement => c instanceof HTMLElement)
    const lignes = els.map<Ligne>((el) => ({
      type: el.dataset.type ?? (/^H[1-6]$/.test(el.tagName) ? 'heading' : el.tagName === 'P' ? 'paragraph' : el.tagName.toLowerCase()),
      retrait: Number(el.dataset.retrait) || 0,
      ouvert: el.dataset.ouvert !== 'non',
      depliant: el.hasAttribute('data-depliant'),
    }))
    const places = structurer(lignes)
    els.forEach((el, i) => {
      const a = attributsDePlace(places[i]!, places)
      el.style.cssText += `; ${a.style}`
      if (a.class) el.classList.add(...a.class.split(' '))
      if (a['data-numero']) el.dataset.numero = a['data-numero']
      for (const colonne of el.querySelectorAll(':scope > .notak-blocs-colonne')) ranger(colonne)
    })
  }
  ranger(racine)
}
