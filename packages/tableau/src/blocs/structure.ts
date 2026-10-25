import type { Node as NoeudPM } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { Extension } from '@tiptap/react'
import { t } from '../langue'
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
  depart: Number(n.attrs.depart) || null,
  couleur: typeof n.attrs.couleur === 'string' ? n.attrs.couleur : null,
})

/** Le fond d'un encadré pour la bande de ses enfants : sa couleur de fond, ou le fond pâle par défaut. */
const fondEncadre = (l: Ligne | undefined) =>
  l?.couleur?.endsWith('-fond') ? `var(--notak-bloc-${l.couleur})` : 'var(--notak-page-encadre)'

/** Les attributs de page qu'une place donne à son bloc ; `lignes` donne la couleur des encadrés, `soi` est sa ligne. */
export function attributsDePlace(place: Place, places: readonly Place[], lignes?: readonly Ligne[], soi?: Ligne): Record<string, string> {
  const classes = [
    place.cache && 'notak-cache',
    place.aEnfants && 'notak-a-enfants',
    place.encadre !== null && 'notak-dans-encadre',
    place.finEncadre && 'notak-fin-encadre',
    place.finRacine && 'notak-fin-encadre-racine',
    place.citation !== null && 'notak-dans-citation',
  ].filter(Boolean)
  const style = [
    `--notak-retrait: ${place.profondeur}`,
    place.encadre !== null && `--notak-retrait-encadre: ${places[place.encadre]!.profondeur}`,
    place.encadreRacine !== null && `--notak-retrait-encadre-racine: ${places[place.encadreRacine]!.profondeur}`,
    place.encadres > 0 && `--notak-encadres: ${place.encadres}`,
    place.encadre !== null && `--notak-fond-encadre: ${fondEncadre(lignes?.[place.encadre])}`,
    place.encadreRacine !== null && `--notak-fond-encadre-racine: ${fondEncadre(lignes?.[place.encadreRacine])}`,
    place.fermes > 0 && `--notak-fermes: ${place.fermes}`,
    // Un encadré de couleur de fond prend sa couleur (la règle de l'encadré passerait sinon devant celle de la couleur).
    soi?.type === 'encadreBloc' && soi.couleur?.endsWith('-fond') && `--notak-fond-soi: ${fondEncadre(soi)}`,
    place.citation !== null && `--notak-retrait-citation: ${places[place.citation]!.profondeur}`,
  ].filter(Boolean)
  return {
    style: style.join('; '),
    ...(classes.length ? { class: classes.join(' ') } : {}),
    ...(place.numero ? { 'data-numero': place.numero } : {}),
    // La forme de la puce et du numéro suit la profondeur, par cycles de trois (NOTION.md § 2).
    'data-niveau': String(place.profondeur % 3),
  }
}

/** Les décorations de la structure : chaque conteneur (la page, chaque colonne) est rangé à part. */
function decorations(doc: NoeudPM): DecorationSet {
  const deco: Decoration[] = []
  const ranger = (conteneur: NoeudPM, debut: number) => {
    const noeuds: [NoeudPM, number][] = []
    conteneur.forEach((n, decalage) => noeuds.push([n, debut + decalage]))
    const lignes = noeuds.map(([n]) => ligneDe(n))
    const places = structurer(lignes)
    noeuds.forEach(([n, pos], i) => {
      deco.push(Decoration.node(pos, pos + n.nodeSize, attributsDePlace(places[i]!, places, lignes, lignes[i])))
      // Un dépliant ouvert sans enfant invite à en mettre un (NOTION.md § 2).
      const l = ligneDe(n)
      const depliant = l.type === 'depliant' || (l.type === 'heading' && l.depliant)
      if (depliant && l.ouvert !== false && !places[i]!.aEnfants && !places[i]!.cache) {
        deco.push(Decoration.widget(pos + n.nodeSize, (view) => depliantVide(view, pos, places[i]!.profondeur), { side: -1, key: `vide-${pos}-${places[i]!.profondeur}` }))
      }
      if (n.type.name === 'colonnes') n.forEach((colonne, d) => ranger(colonne, pos + 1 + d + 1))
    })
  }
  ranger(doc, 0)
  return DecorationSet.create(doc, deco)
}

/** L'invite d'un dépliant vide : un appui y crée son premier enfant, un paragraphe, et y met le curseur. */
function depliantVide(view: EditorView, pos: number, profondeur: number): HTMLElement {
  const el = document.createElement('div')
  el.className = 'notak-depliant-vide'
  el.contentEditable = 'false'
  el.style.setProperty('--notak-retrait', String(profondeur + 1))
  el.textContent = t('blocs.depliantVide')
  el.addEventListener('mousedown', (e) => {
    e.preventDefault()
    const n = view.state.doc.nodeAt(pos)
    if (!n || !view.editable) return
    const ou = pos + n.nodeSize
    const tr = view.state.tr.insert(ou, view.state.schema.nodes.paragraph!.create({ retrait: profondeur + 1 }))
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, ou + 1)))
    view.focus()
  })
  return el
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
      depart: Number(el.dataset.depart) || null,
      couleur: el.dataset.couleur ?? null,
    }))
    const places = structurer(lignes)
    els.forEach((el, i) => {
      const a = attributsDePlace(places[i]!, places, lignes, lignes[i])
      el.style.cssText += `; ${a.style}`
      if (a.class) el.classList.add(...a.class.split(' '))
      if (a['data-numero']) el.dataset.numero = a['data-numero']
      el.dataset.niveau = a['data-niveau'] ?? '0'
      for (const colonne of el.querySelectorAll(':scope > .notak-blocs-colonne')) ranger(colonne)
    })
  }
  ranger(racine)
}
