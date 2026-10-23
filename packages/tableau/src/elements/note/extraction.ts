import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { type Editor, Extension } from '@tiptap/react'
import { type Element, type Id, type NoeudTexte, docDepuisTexte, nouvelleNote } from '../../coeur/tableau'
import { cleEntre, comparerOrdre } from '../../coeur/ordre'
import { definition } from '../registre'
import type { ContexteToile } from '../types'
import { MARQUE_FIL } from './fils'

/** Le texte sans les marques de commentaire : un passage extrait n'emporte pas les fils de la note d'origine. */
export function sansMarquesDeFil(n: NoeudTexte): NoeudTexte {
  const { marks, content, ...reste } = n
  const gardees = marks?.filter((m) => m.type !== MARQUE_FIL)
  return {
    ...reste,
    ...(gardees?.length ? { marks: gardees } : {}),
    ...(content ? { content: content.map(sansMarquesDeFil) } : {}),
  }
}

/**
 * Le passage choisi, comme document d'une note neuve : les blocs qu'il touche, coupés à ses bords. Si la coupe ne
 * donne pas un document valide (le milieu d'une liste, par exemple), son texte brut, un paragraphe par ligne.
 * `null` sans passage choisi.
 */
export function docDuPassage(editeur: Editor): NoeudTexte | null {
  const { selection, doc } = editeur.state
  if (selection.empty) return null
  try {
    const neuf = editeur.schema.topNodeType.create(null, selection.content().content)
    neuf.check()
    return sansMarquesDeFil(neuf.toJSON() as NoeudTexte)
  } catch {
    const texte = doc.textBetween(selection.from, selection.to, '\n')
    return texte.trim() ? docDepuisTexte(texte) : null
  }
}

/** Un passage s'atténue (30 %) pendant qu'on le tire hors de la note. */
export const CLE_PASSAGE_EXTRAIT = new PluginKey<{ from: number; to: number } | null>('passageExtrait')

export const PassageExtrait = Extension.create({
  name: 'passageExtrait',
  addProseMirrorPlugins() {
    return [
      new Plugin<{ from: number; to: number } | null>({
        key: CLE_PASSAGE_EXTRAIT,
        state: {
          init: () => null,
          apply: (tr, avant) => {
            const meta = tr.getMeta(CLE_PASSAGE_EXTRAIT) as { from: number; to: number } | null | undefined
            return meta !== undefined ? meta : avant
          },
        },
        props: {
          decorations: (state) => {
            const p = CLE_PASSAGE_EXTRAIT.getState(state)
            return p ? DecorationSet.create(state.doc, [Decoration.inline(p.from, p.to, { class: 'notak-passage-extrait' })]) : null
          },
        },
      }),
    ]
  },
})

/**
 * Pose une note faite de ce texte là où on a lâché le passage (`ou`, sur le tableau). Lâchée sur une colonne ou sur un
 * de ses éléments, elle s'y range : au bout, ou juste après l'élément visé.
 */
export function creerNoteExtraite(contexte: ContexteToile, texte: NoeudTexte, ou: { x: number; y: number }, cible: Id | null): Element {
  const note = nouvelleNote(Math.round(ou.x), Math.round(ou.y))
  let neuve: Element = { ...note, contenu: { ...note.contenu, texte } }
  const tout = contexte.magasin.lire().elements
  const vise = cible ? tout.find((e) => e.id === cible) : undefined
  const colonne = vise && (definition(vise.contenu.type)?.accepte ? vise : vise.parent ? tout.find((e) => e.id === vise.parent) : undefined)
  if (colonne && definition(colonne.contenu.type)?.accepte?.(neuve, colonne as never)) {
    const freres = tout.filter((e) => e.parent === colonne.id).sort((a, b) => comparerOrdre(a.ordre, b.ordre))
    const apres = vise !== colonne ? vise : freres.at(-1)
    const suivant = apres ? freres[freres.findIndex((f) => f.id === apres.id) + 1] : undefined
    neuve = { ...neuve, parent: colonne.id, ordre: cleEntre(apres?.ordre, suivant?.ordre) }
  }
  contexte.magasin.faire([{ type: 'creer', element: neuve }])
  return neuve
}
