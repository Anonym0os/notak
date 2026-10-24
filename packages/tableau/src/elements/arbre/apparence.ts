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

/** Ce qu'il faut pour dessiner un sujet : ses lignes et sa taille. */
export interface Mesure extends Taille {
  lignes: string[]
}

const memo = new Map<string, Mesure>()

export function mesurer(titre: string, rang: Rang): Mesure {
  const cle = `${rang}\u0000${titre}`
  const deja = memo.get(cle)
  if (deja) return deja
  const h = HABITS[rang]
  const lignes = lignesDe(titre, h.police, h.graisse, h.largeurMax)
  const l = Math.max(...lignes.map((x) => largeurTexte(x, h.police, h.graisse)), h.police * 1.5)
  const mesure = { lignes, l: Math.ceil(l + 2 * h.marge[1]), h: Math.ceil(lignes.length * h.police * INTERLIGNE + 2 * h.marge[0]) }
  if (memo.size > 5000) memo.clear()
  memo.set(cle, mesure)
  return mesure
}
