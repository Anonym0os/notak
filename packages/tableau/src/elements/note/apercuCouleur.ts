import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as NoeudPM } from '@tiptap/pm/model'
import { Extension } from '@tiptap/react'
import { codeAffiche } from '../nuancier/couleur'
import { type CouleurLue, lireCouleur } from './conversion'

/** Au-delà, le texte n'est plus lu : une note de ce poids n'a pas à payer cet aperçu. */
export const TEXTE_MAX_APERCU = 50_000

/** Un code couleur : en début de texte ou après une espace, suivi d'une espace ou de la fin. */
const CODE = /(^|\s)(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([^)\n]*\))(?=\s|$)/gi

export interface CodeTrouve extends CouleurLue {
  /** Où le code commence et finit dans le texte lu. */
  debut: number
  fin: number
}

/** Les codes couleur d'un texte (`#abc`, `#aabbcc`, avec transparence, `rgb()`, `hsl()`), dans l'ordre. */
export function codesCouleur(texte: string): CodeTrouve[] {
  const trouves: CodeTrouve[] = []
  for (const m of texte.matchAll(CODE)) {
    const lue = lireCouleur(m[2]!)
    if (!lue) continue
    const debut = m.index + m[1]!.length
    trouves.push({ ...lue, debut, fin: debut + m[2]!.length })
  }
  return trouves
}

const pastille = (couleur: string) => {
  const el = document.createElement('span')
  el.className = 'notak-apercu-couleur'
  el.contentEditable = 'false'
  el.style.background = couleur
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', couleur)
  return el
}

/** Les pastilles à poser : une devant chaque code, sauf celui où le curseur se trouve. */
function pastilles(doc: NoeudPM, curseur: { from: number; to: number }): DecorationSet {
  if (doc.textContent.length > TEXTE_MAX_APERCU) return DecorationSet.empty
  const deco: Decoration[] = []
  doc.descendants((n, pos, parent) => {
    if (!n.isText || parent?.type.spec.code || n.marks.some((m) => m.type.name === 'code')) return
    for (const c of codesCouleur(n.text!)) {
      const de = pos + c.debut
      const a = pos + c.fin
      if (curseur.from <= a && curseur.to >= de) continue
      deco.push(
        Decoration.widget(de, () => {
          const el = pastille(c.couleur)
          el.dataset.de = String(de)
          el.dataset.a = String(a)
          el.dataset.format = c.format
          return el
        }, { side: -1, key: `${de}:${c.couleur}:${a - de}` }),
      )
    }
  })
  return DecorationSet.create(doc, deco)
}

/** Ouvre le sélecteur de couleur du navigateur ; chaque teinte choisie réécrit le code, dans son format. */
function choisirCouleur(vue: import('@tiptap/pm/view').EditorView, de: number, a: number, depart: string, format: CouleurLue['format']) {
  const champ = document.createElement('input')
  champ.type = 'color'
  champ.value = depart
  champ.style.cssText = 'position:fixed;opacity:0;pointer-events:none;left:0;top:0'
  document.body.append(champ)
  let fin = a
  champ.addEventListener('input', () => {
    const code = codeAffiche(champ.value, format)
    vue.dispatch(vue.state.tr.insertText(code, de, fin))
    fin = de + code.length
  })
  champ.addEventListener('change', () => champ.remove())
  champ.click()
}

/**
 * L'aperçu des codes couleur : une pastille devant `#3a76df`, `rgb(…)` ou `hsl(…)` écrits dans le texte. Un clic sur
 * la pastille ouvre le sélecteur de couleur, qui réécrit le code en gardant son format ; la pastille se cache tant
 * que le curseur est dans le code.
 */
export const ApercuCouleurs = Extension.create({
  name: 'apercuCouleurs',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('apercuCouleurs'),
        props: {
          decorations: (state) => pastilles(state.doc, state.selection),
          handleDOMEvents: {
            mousedown: (vue, e) => {
              const p = (e.target as HTMLElement).closest?.<HTMLElement>('.notak-apercu-couleur')
              if (!p || !vue.editable) return false
              e.preventDefault()
              const de = Number(p.dataset.de)
              const a = Number(p.dataset.a)
              const lue = lireCouleur(vue.state.doc.textBetween(de, a))
              if (lue) choisirCouleur(vue, de, a, lue.couleur, lue.format)
              return true
            },
          },
        },
      }),
    ]
  },
})
