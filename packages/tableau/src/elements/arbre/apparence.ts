import type { Id } from '../../coeur/tableau'
import type { Taille } from './disposition'
import { type Lecture, enfantsDe, profondeur } from './modele/sujets'

/**
 * L'habillage par défaut d'un sujet, selon son rang (docs/XMIND.md § 5) : le central est le plus gros et plein, un
 * principal est une pastille de la couleur de sa branche, un sous-sujet un texte nu. Des réglages à nous.
 */
export type Rang = 'central' | 'principal' | 'sous' | 'flottant'

export interface Habit {
  police: number
  graisse: number
  /** Marges intérieures, en px : verticale, horizontale. */
  marge: [number, number]
  /** Arrondi du cadre ; `null` : pas de cadre (un sous-sujet). */
  arrondi: number | null
  /** La largeur à partir de laquelle le titre passe à la ligne. */
  largeurMax: number
}

export const HABITS: Record<Rang, Habit> = {
  central: { police: 20, graisse: 700, marge: [14, 24], arrondi: 10, largeurMax: 320 },
  principal: { police: 15, graisse: 600, marge: [8, 14], arrondi: 7, largeurMax: 260 },
  sous: { police: 13, graisse: 400, marge: [4, 6], arrondi: null, largeurMax: 240 },
  flottant: { police: 14, graisse: 500, marge: [7, 12], arrondi: 7, largeurMax: 260 },
}

/** Le rang d'un sujet dans la carte. */
export function rangDe(l: Lecture, id: Id): Rang {
  if (id === l.central) return 'central'
  if (l.sujets.get(id)?.genre === 'detache') return 'flottant'
  return profondeur(l, id) === 1 ? 'principal' : 'sous'
}

/** Les couleurs des branches principales, dans l'ordre (« arc-en-ciel ») : à nous, lisibles de jour comme de nuit. */
export const COULEURS_BRANCHES = ['#e5534b', '#e69138', '#c9a227', '#3fa66b', '#3a86d4', '#8b5cd6'] as const

/** La couleur de la branche d'un sujet : celle de son ancêtre principal. Le central et un flottant : l'encre. */
export function couleurDe(l: Lecture, id: Id): string | null {
  let x: Id | undefined = id
  while (x !== undefined) {
    const s = l.sujets.get(x)
    if (!s || s.parent === undefined || s.genre === 'detache') return null
    if (s.parent === l.central) return COULEURS_BRANCHES[enfantsDe(l, l.central).indexOf(x) % COULEURS_BRANCHES.length] ?? null
    x = s.parent
  }
  return null
}

export const POLICE = 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif'
/** L'interligne, en fraction de la taille de police. */
export const INTERLIGNE = 1.3

let contexte2d: CanvasRenderingContext2D | null | undefined

/** La largeur d'un texte dans cette police : par le canevas, ou à peu près quand il n'y en a pas (les tests). */
function largeurTexte(texte: string, police: number, graisse: number): number {
  if (contexte2d === undefined) {
    try {
      contexte2d = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
    } catch {
      contexte2d = null
    }
  }
  if (!contexte2d) return texte.length * police * 0.55
  contexte2d.font = `${graisse} ${police}px ${POLICE}`
  return contexte2d.measureText(texte).width
}

/** Les lignes d'un titre, coupé aux mots pour tenir dans `largeur` (un mot trop long reste seul sur sa ligne). */
export function lignesDe(titre: string, police: number, graisse: number, largeur: number): string[] {
  const sortie: string[] = []
  for (const paragraphe of (titre || ' ').split('\n')) {
    let ligne = ''
    for (const mot of paragraphe.split(' ')) {
      const essai = ligne ? `${ligne} ${mot}` : mot
      if (ligne && largeurTexte(essai, police, graisse) > largeur) {
        sortie.push(ligne)
        ligne = mot
      } else ligne = essai
    }
    sortie.push(ligne)
  }
  return sortie
}

/** Ce qu'un sujet porte autour de son titre, et qui prend de la place. */
export interface Decor {
  tache?: boolean
  marqueurs?: number
  /** Le numéro devant le titre (« 1.2 »). */
  prefixe?: string | null
  /** Les petites icônes après le titre : note, lien. */
  icones?: number
  etiquettes?: readonly string[]
  image?: { l: number; h: number }
}

/** La géométrie d'un sujet dessiné, relative à son coin haut gauche. */
export interface Mesure extends Taille {
  lignes: string[]
  /** Où commence la rangée du titre (case, marqueurs, numéro, texte, icônes), et sa hauteur. */
  rangee: { x: number; y: number; h: number }
  /** Où va le texte du titre : la zone du champ de saisie. */
  texte: { x: number; y: number; l: number; h: number }
  /** Où vont les étiquettes (une rangée sous le titre). */
  etiquettes: { y: number; largeurs: number[] } | null
  /** Où va l'image. */
  image: { x: number; y: number } | null
}

const TAILLE_ICONE = 16
const PAS_ICONE = 19
const HAUTEUR_ETIQUETTE = 18
const POLICE_ETIQUETTE = 11

const memo = new Map<string, Mesure>()

export function mesurer(titre: string, rang: Rang, decor: Decor = {}): Mesure {
  const cle = `${rang}\u0000${titre}\u0000${JSON.stringify(decor)}`
  const deja = memo.get(cle)
  if (deja) return deja
  const h = HABITS[rang]
  const lignes = lignesDe(titre, h.police, h.graisse, h.largeurMax)
  const lTexte = Math.max(...lignes.map((x) => largeurTexte(x, h.police, h.graisse)), h.police * 1.5)
  const hTexte = lignes.length * h.police * INTERLIGNE
  const prefixe = decor.prefixe ? largeurTexte(`${decor.prefixe} `, h.police, h.graisse) : 0
  const avant = (decor.tache ? PAS_ICONE : 0) + (decor.marqueurs ?? 0) * PAS_ICONE + prefixe
  const apres = (decor.icones ?? 0) * PAS_ICONE + (decor.icones ? 4 : 0)
  const lRangee = avant + lTexte + apres
  const hRangee = Math.max(hTexte, decor.tache || decor.marqueurs || decor.icones ? TAILLE_ICONE : 0)
  const largeurs = (decor.etiquettes ?? []).map((e) => Math.ceil(largeurTexte(e, POLICE_ETIQUETTE, 500) + 12))
  const lEtiquettes = largeurs.reduce((s, x, i) => s + x + (i > 0 ? 4 : 0), 0)
  const interieur = Math.max(lRangee, lEtiquettes, decor.image?.l ?? 0)
  const l = Math.ceil(interieur + 2 * h.marge[1])
  let y = h.marge[0]
  const image = decor.image ? { x: l / 2 - decor.image.l / 2, y } : null
  if (decor.image) y += decor.image.h + 6
  const rangee = { x: l / 2 - lRangee / 2, y, h: hRangee }
  const texte = { x: rangee.x + avant, y: y + (hRangee - hTexte) / 2, l: lTexte, h: hTexte }
  y += hRangee
  const etiquettes = largeurs.length > 0 ? { y: y + 4, largeurs } : null
  if (etiquettes) y += 4 + HAUTEUR_ETIQUETTE
  const mesure: Mesure = { lignes, l, h: Math.ceil(y + h.marge[0]), rangee, texte, etiquettes, image }
  if (memo.size > 5000) memo.clear()
  memo.set(cle, mesure)
  return mesure
}

export { HAUTEUR_ETIQUETTE, PAS_ICONE, POLICE_ETIQUETTE, TAILLE_ICONE }
