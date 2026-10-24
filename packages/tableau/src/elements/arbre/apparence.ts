import type { FormeBranche, FormeSujet, Id } from '../../coeur/tableau'
import type { Taille } from './disposition'
import { type Lecture, enfantsDe, profondeur } from './modele/sujets'
import { type Theme, THEMES } from './themes'

/**
 * L'habillage d'un sujet (docs/XMIND.md § 5) : ce que son rang lui donne dans le thème de la carte, puis ce que son
 * propre style change. Des réglages à nous.
 */
export type Rang = 'central' | 'principal' | 'sous' | 'flottant'

/** Les tailles de chaque rang, communes à tous les thèmes. */
const TAILLES: Record<Rang, { police: number; graisse: number; marge: [number, number]; largeurMax: number }> = {
  central: { police: 20, graisse: 700, marge: [14, 24], largeurMax: 320 },
  principal: { police: 15, graisse: 600, marge: [8, 14], largeurMax: 260 },
  sous: { police: 13, graisse: 400, marge: [4, 6], largeurMax: 240 },
  flottant: { police: 14, graisse: 500, marge: [7, 12], largeurMax: 260 },
}

export interface Habit {
  police: number
  graisse: number
  italique: boolean
  famille: string
  /** Marges intérieures, en px : verticale, horizontale (la forme les élargit au besoin). */
  marge: [number, number]
  forme: FormeSujet
  /** La largeur à partir de laquelle le titre passe à la ligne. */
  largeurMax: number
  /** Ce que le style ou le thème imposent ; absent : la couleur de la branche, ou celle du thème. */
  remplissage?: string
  bordure?: string
  epaisseurBordure?: number
  couleurTexte?: string
  /** Un principal plein de la couleur de sa branche (sinon en contour). */
  plein: boolean
}

export const POLICE = 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif'
/** L'interligne, en fraction de la taille de police. */
export const INTERLIGNE = 1.3

/** Le rang d'un sujet dans la carte. */
export function rangDe(l: Lecture, id: Id): Rang {
  if (id === l.central) return 'central'
  if (l.sujets.get(id)?.genre === 'detache') return 'flottant'
  return profondeur(l, id) === 1 ? 'principal' : 'sous'
}

/** Une forme soulignée : le sujet n'a pas de cadre, ses branches partent du bout du trait. */
export const souligne = (f: FormeSujet) => f === 'souligne' || f === 'double-souligne'

/** Ce que la forme ajoute aux marges : une ellipse ou un losange doivent contenir le texte rectangulaire. */
function marges(forme: FormeSujet, [v, h]: [number, number]): [number, number] {
  switch (forme) {
    case 'ellipse':
      return [v * 1.6, h * 1.5]
    case 'losange':
      return [v * 2.2, h * 2]
    case 'hexagone':
      return [v, h + 10]
    case 'capsule':
      return [v, h + 6]
    case 'parallelogramme':
      return [v, h + 8]
    default:
      return [v, h]
  }
}

/** L'habillage d'un sujet : son rang dans le thème, puis son style. */
export function habitDe(l: Lecture, id: Id, theme: Theme): Habit {
  const rang = rangDe(l, id)
  const t = TAILLES[rang]
  const s = l.sujets.get(id)?.style
  const formeTheme = rang === 'central' ? theme.central.forme : rang === 'principal' ? theme.principal.forme : rang === 'sous' ? theme.sous.forme : theme.flottant.forme
  const forme = s?.forme ?? formeTheme
  const police = s?.taille ?? t.police
  return {
    police,
    graisse: s?.gras === undefined ? t.graisse : s.gras ? 700 : 400,
    italique: !!s?.italique,
    famille: s?.police ?? theme.police ?? POLICE,
    marge: marges(forme, [t.marge[0] * (police / t.police), t.marge[1] * (police / t.police)]),
    forme,
    largeurMax: t.largeurMax,
    plein: rang === 'principal' && theme.principal.plein,
    ...(s?.remplissage ? { remplissage: s.remplissage } : rang === 'central' && theme.central.remplissage ? { remplissage: theme.central.remplissage } : {}),
    ...(s?.bordure ? { bordure: s.bordure } : {}),
    ...(s?.epaisseurBordure !== undefined ? { epaisseurBordure: s.epaisseurBordure } : {}),
    ...(s?.couleurTexte ? { couleurTexte: s.couleurTexte } : rang === 'central' && theme.central.texte ? { couleurTexte: theme.central.texte } : {}),
  }
}

/** Les couleurs des branches principales, dans l'ordre (« arc-en-ciel ») du thème classique. */
export const COULEURS_BRANCHES = THEMES[0]!.palette

/**
 * La couleur de la branche d'un sujet : celle qu'un ancêtre (ou lui-même) déclare, sinon celle de son principal dans
 * la palette du thème. Le central et un flottant : `null` (l'encre du thème). `uneCouleur` : jamais d'arc-en-ciel.
 */
export function couleurDe(l: Lecture, id: Id, theme: Theme = THEMES[0]!, uneCouleur = false): string | null {
  let x: Id | undefined = id
  while (x !== undefined) {
    const s = l.sujets.get(x)
    if (!s) return null
    if (s.style?.couleurBranche) return s.style.couleurBranche
    if (s.parent === undefined || s.genre === 'detache') return null
    if (s.parent === l.central) return uneCouleur ? null : (theme.palette[enfantsDe(l, l.central).indexOf(x) % theme.palette.length] ?? null)
    x = s.parent
  }
  return null
}

/** Comment se trace la branche qui part de `parent` : son style, ou celui du premier ancêtre qui en déclare un. */
export interface StyleDeBranche {
  forme: FormeBranche | null
  epaisseur: number | null
  effilee: boolean
  motif: 'plein' | 'tirets' | 'points'
}

export function brancheDe(l: Lecture, parent: Id): StyleDeBranche {
  const r: StyleDeBranche = { forme: null, epaisseur: null, effilee: false, motif: 'plein' }
  const vus = { forme: false, epaisseur: false, effilee: false, motif: false }
  for (let s = l.sujets.get(parent); s; s = s.parent !== undefined ? l.sujets.get(s.parent) : undefined) {
    const st = s.style
    if (!st) continue
    if (!vus.forme && st.branche) ((r.forme = st.branche), (vus.forme = true))
    if (!vus.epaisseur && st.epaisseurBranche !== undefined) ((r.epaisseur = st.epaisseurBranche), (vus.epaisseur = true))
    if (!vus.effilee && st.effilee !== undefined) ((r.effilee = st.effilee), (vus.effilee = true))
    if (!vus.motif && st.motif) ((r.motif = st.motif), (vus.motif = true))
  }
  return r
}

let contexte2d: CanvasRenderingContext2D | null | undefined

/** La largeur d'un texte dans cette police : par le canevas, ou à peu près quand il n'y en a pas (les tests). */
function largeurTexte(texte: string, police: number, graisse: number, famille = POLICE, italique = false): number {
  if (contexte2d === undefined) {
    try {
      contexte2d = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
    } catch {
      contexte2d = null
    }
  }
  if (!contexte2d) return texte.length * police * 0.55
  contexte2d.font = `${italique ? 'italic ' : ''}${graisse} ${police}px ${famille}`
  return contexte2d.measureText(texte).width
}

/** Les lignes d'un titre, coupé aux mots pour tenir dans `largeur` (un mot trop long reste seul sur sa ligne). */
export function lignesDe(titre: string, police: number, graisse: number, largeur: number, famille = POLICE, italique = false): string[] {
  const sortie: string[] = []
  for (const paragraphe of (titre || ' ').split('\n')) {
    let ligne = ''
    for (const mot of paragraphe.split(' ')) {
      const essai = ligne ? `${ligne} ${mot}` : mot
      if (ligne && largeurTexte(essai, police, graisse, famille, italique) > largeur) {
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

export function mesurer(titre: string, h: Habit, decor: Decor = {}): Mesure {
  const cle = `${titre}\u0000${h.police}|${h.graisse}|${h.italique}|${h.famille}|${h.marge}|${h.largeurMax}\u0000${JSON.stringify(decor)}`
  const deja = memo.get(cle)
  if (deja) return deja
  const lignes = lignesDe(titre, h.police, h.graisse, h.largeurMax, h.famille, h.italique)
  const lTexte = Math.max(...lignes.map((x) => largeurTexte(x, h.police, h.graisse, h.famille, h.italique)), h.police * 1.5)
  const hTexte = lignes.length * h.police * INTERLIGNE
  const prefixe = decor.prefixe ? largeurTexte(`${decor.prefixe} `, h.police, h.graisse, h.famille, h.italique) : 0
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
