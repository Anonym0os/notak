import { Selection, type Transaction } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'
import type { Apercu } from '../coeur/tableau'
import { adresseSure } from '../elements/lien/adresse'
import { geste } from './annulation'
import { CONTENEURS } from './ids'
import { blocA } from './gestes'
import { blocsDe } from './modele'

/**
 * L'aperçu de lien, le signet (docs/NOTION.md § 2 et § 10.3) : une adresse montrée en carte (titre, description,
 * image). Ce fichier porte les décisions (quand proposer « coller comme », où poser la carte, quelle adresse on
 * accepte) et le geste qui pose la carte ; la vue du nœud est dans `noeuds.ts`, le menu dans `ApercuMenus.tsx`.
 */

/** Une adresse web saisie à la main : complétée en `https://` si elle n'a pas de schéma ; `null` si ce n'en est pas une. */
export function normaliserAdresse(saisie: string): string | null {
  const s = saisie.trim()
  if (!s || /\s/.test(s)) return null
  const complete = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`
  const sure = adresseSure(complete)
  if (!sure) return null
  try {
    const { hostname } = new URL(sure)
    // « bonjour » n'est pas une adresse : il faut un point (ou la machine locale).
    return hostname.includes('.') || hostname === 'localhost' ? sure : null
  } catch {
    return null
  }
}

/** Le nom du site d'une adresse, sans « www. » : ce qu'on montre quand la page n'a rien dit d'elle. */
export function hoteDe(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return url
  }
}

/** Où se trouve le curseur au moment d'un collage d'adresse. */
export interface CadreCollage {
  /** Le curseur est un point, pas une sélection. */
  curseur: boolean
  /** Maj était tenue (⌘⇧V : texte brut). */
  brut: boolean
  /** Le type du bloc qui reçoit le collage. */
  type: string
  /** Le bloc est un bloc de la page ou d'une colonne (pas une case de tableau). */
  dansLaPage: boolean
}

/** Les blocs où l'on ne propose pas « coller comme » : un titre, du code. */
const SANS_MENU = new Set(['heading', 'codeBlock'])

/** Le menu « coller comme » s'ouvre-t-il après ce collage d'adresse ? (NOTION.md § 10.3) */
export const proposerCollerComme = ({ curseur, brut, type, dansLaPage }: CadreCollage): boolean => curseur && !brut && dansLaPage && !SANS_MENU.has(type)

/** Où la carte se pose : à la place du bloc, ou juste dessous. */
export type Place = 'remplacer' | 'dessous'

/** Le bloc ne dit plus rien d'autre que l'adresse : la carte prend sa place ; sinon elle vient dessous. */
export const placeDuSignet = (texteRestant: string): Place => (texteRestant.trim() === '' ? 'remplacer' : 'dessous')

/** Les attributs d'une carte tirés de l'aperçu d'une page : à défaut de titre, le site, puis son nom. */
export function attributsDepuisApercu(url: string, a: Apercu): { titre: string; description: string; image: string | null; favicon: string | null } {
  return {
    titre: (a.titre ?? '').trim() || (a.site ?? '').trim() || hoteDe(url),
    description: (a.description ?? '').trim(),
    image: adresseSure(a.image, 'image') ?? null,
    favicon: adresseSure(a.favicon, 'image') ?? null,
  }
}

/**
 * Pose une carte pour `url` dans `tr`, sur le bloc qui commence en `pos` : à sa place (le paragraphe d'accueil suit
 * s'il n'y a rien dessous), ou après lui et ses enfants. `curseur` : après la carte, ou là où il était.
 */
export function poserSignet(tr: Transaction, pos: number, url: string, place: Place, curseur: 'apres' | 'garder'): Transaction {
  const { schema } = tr.doc.type
  const bloc = tr.doc.nodeAt(pos)
  if (!bloc) return tr
  const retrait = Number(bloc.attrs.retrait) || 0
  const signet = schema.nodes.apercuLien!.create({ url, retrait })
  const debut = place === 'remplacer' ? pos : (blocsDe(tr.doc).find((b) => b.pos === pos)?.fin ?? pos + bloc.nodeSize)
  const fin = place === 'remplacer' ? pos + bloc.nodeSize : debut
  // Rien après la carte : un paragraphe vide y reçoit le curseur, pour qu'on puisse continuer d'écrire.
  const suite = tr.doc.resolve(fin).nodeAfter
  tr.replaceWith(debut, fin, suite ? [signet] : [signet, schema.nodes.paragraph!.create({ retrait })])
  if (curseur === 'apres') tr.setSelection(Selection.near(tr.doc.resolve(debut + signet.nodeSize), 1))
  return tr
}

/**
 * Le menu « / » → « Aperçu de lien web » : la carte vient à la place du bloc vide du curseur, sinon sous le bloc. Elle
 * rejoint le geste du menu (un seul ⌘Z défait le choix et la carte).
 */
export function insererSignet(editor: Editor, url: string): boolean {
  const { $from } = editor.state.selection
  const pos = blocA($from)
  if (pos === null) return false
  const vide = $from.parent.isTextblock && $from.parent.content.size === 0 && CONTENEURS.has($from.node($from.depth - 1).type.name)
  editor.view.dispatch(poserSignet(editor.state.tr, pos, url, vide ? 'remplacer' : 'dessous', 'apres').scrollIntoView())
  editor.commands.focus()
  return true
}

/**
 * « Coller comme » → « Aperçu » : le lien collé, `[de, a)`, s'en va ; la carte vient à la place du bloc s'il n'en reste
 * rien, sinon juste sous lui. Une seule transaction, à part : ⌘Z rend le lien collé.
 */
export function convertirLienEnSignet(tr: Transaction, de: number, a: number, url: string): Transaction {
  tr.delete(de, a)
  const $de = tr.doc.resolve(de)
  const pos = blocA($de)
  if (pos === null) return tr
  const place = placeDuSignet($de.parent.textContent)
  return geste(poserSignet(tr, pos, url, place, place === 'remplacer' ? 'apres' : 'garder'))
}
