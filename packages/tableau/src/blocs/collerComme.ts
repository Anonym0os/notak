import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { Extension } from '@tiptap/react'
import { convertirLienEnSignet } from './apercu'

/**
 * Ce que l'aperçu de lien ouvre au-dessus du texte (docs/NOTION.md § 10.3) :
 * - `coller` : le menu « coller comme » qui suit le collage d'une adresse seule, sous la fin du lien (`de` à `a`) ;
 * - `champ` : le champ « Collez le lien… » du menu « / », sous le bloc du curseur.
 * L'état vit dans l'éditeur, le menu (`ApercuMenus.tsx`) le lit : le collage et le menu « / » n'ont rien à lui passer.
 */
export type EtatApercu =
  | {
      genre: 'coller'
      /** Le lien collé : sa place, le texte tel que collé et l'adresse qu'il porte. */
      de: number
      a: number
      texte: string
      url: string
      /** La ligne choisie : 0 « Lien » (le défaut), 1 « Aperçu ». */
      rang: number
    }
  | { genre: 'champ' }
  | null

export const CLE_APERCU = new PluginKey<EtatApercu>('apercuLienMenus')

/** Le nombre de choix du menu « coller comme ». */
export const CHOIX_COLLER_COMME = 2

/**
 * L'état du menu « coller comme » après une transaction qui n'en parle pas : il suit le lien si le texte bouge autour,
 * et se ferme dès que le curseur n'est plus tout au bout du lien, ou que le lien lui-même a changé.
 */
export function suivreCollerComme<T extends { genre: 'coller'; de: number; a: number }>(
  etat: T,
  placer: (pos: number, sens: -1 | 1) => number,
  curseur: { vide: boolean; pos: number },
): T | null {
  const de = placer(etat.de, 1)
  const a = placer(etat.a, -1)
  if (a - de !== etat.a - etat.de || !curseur.vide || curseur.pos !== a) return null
  return { ...etat, de, a }
}

/** Le rang suivant dans le menu, en boucle (↓ : 1, ↑ : -1). */
export const rangSuivant = (rang: number, sens: 1 | -1): number => (rang + sens + CHOIX_COLLER_COMME) % CHOIX_COLLER_COMME

export const ouvrirApercu = (view: EditorView, etat: EtatApercu) => view.dispatch(view.state.tr.setMeta(CLE_APERCU, etat).setMeta('addToHistory', false))
export const fermerApercu = (view: EditorView) => {
  if (!view.isDestroyed && CLE_APERCU.getState(view.state)) ouvrirApercu(view, null)
}

/** « Aperçu » : le lien collé devient une carte (une transaction, un pas d'annulation). Rend vrai si la carte est posée. */
export function choisirApercu(view: EditorView): boolean {
  const etat = CLE_APERCU.getState(view.state)
  if (etat?.genre !== 'coller') return false
  const { de, a, texte, url } = etat
  // Le texte a bougé sous le menu (un autre auteur) : on ne retire rien au hasard.
  if (a > view.state.doc.content.size || view.state.doc.textBetween(de, a, '', '￼') !== texte) {
    fermerApercu(view)
    return false
  }
  view.dispatch(convertirLienEnSignet(view.state.tr, de, a, url).setMeta(CLE_APERCU, null).scrollIntoView())
  return true
}

const TOUCHES_SEULES = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])

export const CollerComme = Extension.create({
  name: 'collerComme',
  // Avant Entrée et les flèches du moteur : tant que le menu est ouvert, ces touches sont à lui.
  priority: 1300,
  addProseMirrorPlugins() {
    return [
      new Plugin<EtatApercu>({
        key: CLE_APERCU,
        state: {
          init: () => null,
          apply: (tr, etat) => {
            const meta = tr.getMeta(CLE_APERCU) as EtatApercu | undefined
            if (meta !== undefined) return meta
            if (etat?.genre !== 'coller') return etat
            return suivreCollerComme(etat, (pos, sens) => tr.mapping.map(pos, sens), { vide: tr.selection.empty, pos: tr.selection.from })
          },
        },
        props: {
          handleKeyDown: (view, e) => {
            const etat = CLE_APERCU.getState(view.state)
            if (etat?.genre !== 'coller') return false
            if (e.isComposing || TOUCHES_SEULES.has(e.key)) return false
            if (!e.metaKey && !e.ctrlKey && !e.altKey) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                ouvrirApercu(view, { ...etat, rang: rangSuivant(etat.rang, e.key === 'ArrowDown' ? 1 : -1) })
                return true
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                if (etat.rang === 1) choisirApercu(view)
                else fermerApercu(view)
                return true
              }
              if (e.key === 'Escape') {
                fermerApercu(view)
                return true
              }
            }
            // Toute autre touche garde le lien et poursuit son chemin.
            fermerApercu(view)
            return false
          },
          // Un clic ailleurs, ou le texte qui perd le focus, garde le lien.
          handleDOMEvents: {
            mousedown: (view) => void (CLE_APERCU.getState(view.state)?.genre === 'coller' && fermerApercu(view)),
            blur: (view) => void (CLE_APERCU.getState(view.state)?.genre === 'coller' && fermerApercu(view)),
          },
        },
      }),
    ]
  },
})
