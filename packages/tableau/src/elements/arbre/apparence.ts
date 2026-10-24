import { texteBrut } from '../../coeur/tableau'
import type { CasseTexte, FormeBranche, FormeLimite, FormeRelation, FormeResume, FormeSujet, Id, Limite, MotifRemplissage, MotifTrait, PointeTrait, Relation, Resume, StyleTexte, Sujet } from '../../coeur/tableau'
import { formeCarree, margesForme } from './formes'
import type { Taille } from './disposition'
import { numeroDe } from './modele/elements'
import { type Lecture, enfantsDe, profondeur } from './modele/sujets'
import { type Theme, THEMES } from './themes'

/**
 * L'habillage d'un sujet (docs/XMIND.md § 5) : ce que son rang lui donne dans le thème de la carte, puis ce que son
 * propre style change. Des réglages à nous.
 */
export type Rang = 'central' | 'principal' | 'sous' | 'flottant'

/**
 * Ce que chaque rang prend de la classe de Xmind (docs/XMIND.md § 5) : la police et la graisse, les marges
 * intérieures (verticale, horizontale), la largeur du texte avant le retour à la ligne. Ce sont des constantes du
 * moteur de Xmind, communes à tous les thèmes ; seule la carte compacte les resserre. Le central est celui d'un
 * squelette à central demi-gras de 28.
 */
const TAILLES: Record<Rang, { police: number; graisse: number; marge: [number, number]; largeurMax: number }> = {
  central: { police: 28, graisse: 600, marge: [15, 29], largeurMax: 300 },
  principal: { police: 18, graisse: 500, marge: [10, 18], largeurMax: 300 },
  sous: { police: 14, graisse: 400, marge: [6, 6], largeurMax: 300 },
  flottant: { police: 14, graisse: 500, marge: [11, 11], largeurMax: 300 },
}

/** L'épaisseur d'un souligné quand le thème n'en dit rien : épais pour un principal, fin pour un sous-sujet. */
const TRAIT_SOULIGNE: Record<Rang, number> = { central: 2, principal: 2, sous: 1, flottant: 2 }

export interface Habit {
  police: number
  graisse: number
  italique: boolean
  barre: boolean
  souligne: boolean
  casse?: CasseTexte
  /** Où se range le texte dans le sujet (et chaque ligne dans le bloc de texte). */
  alignement: 'gauche' | 'centre' | 'droite'
  /** Une largeur imposée (px) : le titre passe à la ligne pour y tenir. */
  largeur?: number
  famille: string
  /** Marges intérieures, en px : verticale, horizontale (la forme les élargit au besoin). */
  marge: [number, number]
  forme: FormeSujet
  /** La largeur à partir de laquelle le titre passe à la ligne. */
  largeurMax: number
  /** Ce que le style ou le thème imposent ; absent : la couleur de la branche, ou celle du thème. */
  remplissage?: string
  motifRemplissage?: MotifRemplissage
  bordure?: string
  motifBordure?: MotifTrait
  epaisseurBordure?: number
  couleurTexte?: string
  /** Un principal plein de la couleur de sa branche (sinon en contour). */
  plein: boolean
  /** Le sujet se remplit de la couleur de sa branche à cette opacité (un sous-sujet du premier niveau, cadré). */
  fondBranche?: number
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

/** L'épaisseur du trait d'un sujet souligné (celle du thème pour son rang, ou celle que son style fixe). */
export const epaisseurSouligne = (h: Habit): number => h.epaisseurBordure || 1.75

/** Les marges intérieures (verticale, horizontale) de chaque rang dans la carte compacte (docs/XMIND.md § 9 : « réduire la taille et l'espacement des éléments »). */
export const MARGES_COMPACTES: Record<Rang, [number, number]> = { central: [12, 22], principal: [6, 12], sous: [4, 4], flottant: [9, 9] }

/** L'habillage d'un sujet : son rang dans le thème, puis son style. `compacte` : la carte compacte, aux marges réduites. */
export function habitDe(l: Lecture, id: Id, theme: Theme, compacte = false): Habit {
  const rang = rangDe(l, id)
  const t = TAILLES[rang]
  const marge = compacte ? MARGES_COMPACTES[rang] : t.marge
  const sujet = l.sujets.get(id)
  const s = sujet?.style
  const formeTheme = rang === 'central' ? theme.central.forme : rang === 'principal' ? theme.principal.forme : rang === 'sous' ? theme.sous.forme : theme.flottant.forme
  const forme = s?.forme ?? formeTheme
  const police = s?.taille ?? t.police
  // Le souligné : l'épaisseur du thème, ou celle que le rang donne (le style, lui, l'emporte).
  const traitTheme = (rang === 'principal' ? theme.principal.trait : rang === 'sous' ? theme.sous.trait : undefined) ?? TRAIT_SOULIGNE[rang]
  const epaisseurBordure = s?.epaisseurBordure ?? (souligne(forme) ? traitTheme : undefined)
  const fondBranche = rang === 'sous' && theme.sous.fondNiveau2 && !souligne(forme) && profondeur(l, id) === 2 ? theme.sous.fondNiveau2 : undefined
  // Un central sans fond n'a plus le texte que le thème lui donne pour son fond.
  const centrePlein = rang === 'central' && s?.motifRemplissage !== 'aucun'
  const latin = s?.police ?? theme.police ?? POLICE
  return {
    police,
    graisse: s?.graisse ?? (s?.gras === undefined ? t.graisse : s.gras ? 700 : 400),
    italique: !!s?.italique,
    barre: !!s?.barre,
    souligne: !!s?.souligne,
    ...(s?.casse ? { casse: s.casse } : {}),
    alignement: s?.alignement ?? (rang === 'central' ? 'centre' : 'gauche'),
    ...(sujet?.largeur ? { largeur: sujet.largeur } : {}),
    // La police CJK vient après la latine : un caractère que la première n'a pas passe à la seconde.
    famille: theme.cjk ? `${latin}, "${theme.cjk}"` : latin,
    // Les marges tiennent à la classe du sujet, pas à la taille de son texte.
    marge: margesForme(forme, marge),
    forme,
    largeurMax: t.largeurMax,
    plein: (rang === 'principal' && theme.principal.plein) || (rang === 'flottant' && !!theme.flottantsColores),
    ...(s?.remplissage ? { remplissage: s.remplissage } : centrePlein && theme.central.remplissage ? { remplissage: theme.central.remplissage } : {}),
    ...(s?.motifRemplissage ? { motifRemplissage: s.motifRemplissage } : {}),
    ...(s?.bordure ? { bordure: s.bordure } : {}),
    ...(s?.motifBordure ? { motifBordure: s.motifBordure } : {}),
    ...(epaisseurBordure !== undefined ? { epaisseurBordure } : {}),
    ...(fondBranche ? { fondBranche } : {}),
    ...(s?.couleurTexte ? { couleurTexte: s.couleurTexte } : centrePlein && theme.central.texte ? { couleurTexte: theme.central.texte } : {}),
  }
}

/** Le texte tel qu'on le montre : sa casse appliquée. */
export function appliquerCasse(texte: string, casse: CasseTexte | undefined): string {
  switch (casse) {
    case 'majuscules':
      return texte.toLocaleUpperCase()
    case 'minuscules':
      return texte.toLocaleLowerCase()
    case 'capitales':
      return texte.replace(/(^|[\s\-'’(])(\p{L})/gu, (_, a: string, b: string) => a + b.toLocaleUpperCase())
    default:
      return texte
  }
}

/** Une couleur `#rrggbb` ou `#rrggbbaa` : la couleur, et son opacité (1 sans canal alpha). */
export function separerAlpha(c: string): { couleur: string; opacite: number } {
  const m = c.match(/^(#[0-9a-f]{6})([0-9a-f]{2})$/i)
  return m ? { couleur: m[1]!, opacite: Math.round((parseInt(m[2]!, 16) / 255) * 100) / 100 } : { couleur: c, opacite: 1 }
}

/** Une couleur `#rrggbb` en teinte (0 à 360), saturation et luminosité (0 à 1) ; `null` pour toute autre écriture. */
export function hexVersTsl(hex: string): [number, number, number] | null {
  const m = hex.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i)
  if (!m) return null
  const v = parseInt(m[1]!, 16)
  const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => c / 255) as [number, number, number]
  const [max, min] = [Math.max(r, g, b), Math.min(r, g, b)]
  const [d, lum] = [max - min, (max + min) / 2]
  if (d === 0) return [0, 0, lum]
  const sat = d / (1 - Math.abs(2 * lum - 1))
  const teinte = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(teinte * 60 + 360) % 360, sat, lum]
}

/** La couleur `#rrggbb` de cette teinte, saturation et luminosité. */
export function tslVersHex(teinte: number, sat: number, lum: number): string {
  const c = (1 - Math.abs(2 * lum - 1)) * sat
  const x = c * (1 - Math.abs(((teinte / 60) % 2) - 1))
  const m = lum - c / 2
  const [r, g, b] = teinte < 60 ? [c, x, 0] : teinte < 120 ? [x, c, 0] : teinte < 180 ? [0, c, x] : teinte < 240 ? [0, x, c] : teinte < 300 ? [x, 0, c] : [c, 0, x]
  return `#${[r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`
}

/** La même teinte et la même saturation à une autre luminosité (0 à 1). Une couleur qui n'est pas `#rrggbb` reste telle quelle. */
export function surLuminosite(couleur: string, luminosite: number): string {
  const tsl = hexVersTsl(couleur)
  return tsl ? tslVersHex(tsl[0], tsl[1], luminosite) : couleur
}

/** La teinte sombre d'une couleur de branche : sa teinte et sa saturation, à 20 % de luminosité (le texte d'un sous-sujet). */
export const teinteSombre = (couleur: string) => surLuminosite(couleur, 0.2)

/** Sa teinte claire, à 85 % : le même texte sur un fond sombre. */
export const teinteClaire = (couleur: string) => surLuminosite(couleur, 0.85)

/** Une couleur à cette opacité (0 à 1) : `#rrggbbaa` pour une couleur hexadécimale, un mélange avec le transparent sinon. */
export function avecOpacite(couleur: string, opacite: number): string {
  const m = couleur.match(/^(#[0-9a-f]{6})(?:[0-9a-f]{2})?$/i)
  return m ? `${m[1]}${Math.round(opacite * 255).toString(16).padStart(2, '0')}` : `color-mix(in srgb, ${couleur} ${Math.round(opacite * 100)}%, transparent)`
}

/**
 * Le texte d'un sous-sujet : la couleur de sa branche, assombrie sur un fond clair (éclaircie sur un fond sombre). Quand
 * le fond suit le thème clair ou sombre de Notak (une variable CSS), la couleur se mélange à l'encre du thème, qui
 * s'inverse avec lui.
 */
export function encreDeBranche(branche: string, fond: string | undefined, encreTheme: string): string {
  if (!hexVersTsl(branche)) return encreTheme
  if (fond && hexVersTsl(fond)) return sur(fond) === '#ffffff' ? teinteClaire(branche) : teinteSombre(branche)
  return `color-mix(in srgb, ${branche} 32%, ${encreTheme})`
}

/** Une encre lisible sur ce fond : blanche sur un fond soutenu, presque noire sur un fond clair. Une variable CSS : blanche. */
export function sur(fond: string): string {
  const m = fond.match(/^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i)
  if (!m) return '#ffffff'
  const v = parseInt(m[1]!, 16)
  const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255].map((c) => {
    const x = c / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  })
  const lum = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
  return lum > 0.4 ? '#1f2328' : '#ffffff'
}

/** Les couleurs d'un rang d'importance (docs/XMIND.md § 3). */
export const CLASSES = { important: '#e5534b', secondaire: '#8c939d' } as const

/** Ce qu'on voit d'un sujet : son fond, son encre, sa bordure. Des couleurs CSS (une variable du thème est permise). */
export interface Couleurs {
  teinte: string
  fond: string
  /** Le sujet a un fond (sinon son texte pose sur le fond de la carte). */
  plein: boolean
  encre: string
  bordure: string
}

/**
 * Les couleurs d'un sujet : le style d'abord, puis ce que son rang lui donne dans le thème. Le panneau Style lit ici
 * les valeurs « effectives » que le rendu montre.
 */
export function couleursDe(h: Habit, rang: Rang, theme: Theme, classe: Sujet['classe'], couleurBranche: string | null): Couleurs {
  const encreTheme = theme.encre ?? 'var(--notak-arbre-encre)'
  const fondTheme = theme.fond ?? 'var(--notak-arbre-fond)'
  const texteTheme = theme.texte ?? 'var(--notak-arbre-texte)'
  const teinte = (classe === 'important' || classe === 'secondaire' ? CLASSES[classe] : null) ?? couleurBranche ?? encreTheme
  const sansFond = h.motifRemplissage === 'aucun'
  // Un sous-sujet du premier niveau, cadré : sa branche, en filigrane.
  const fondBranche = !sansFond && h.fondBranche && h.remplissage === undefined && couleurBranche ? avecOpacite(teinte, h.fondBranche) : null
  const fond = sansFond
    ? 'none'
    : (h.remplissage ??
      fondBranche ??
      (rang === 'central' ? 'var(--notak-arbre-central)' : h.plein ? teinte : rang === 'flottant' ? (theme.fond ? fondTheme : 'var(--notak-arbre-flottant)') : rang === 'principal' ? fondTheme : 'none'))
  const plein = !sansFond && (h.remplissage !== undefined || fondBranche !== null || rang === 'central' || h.plein)
  // Sur le filigrane de la branche, le texte se lit comme sur le fond de la carte.
  const surFond = plein && fondBranche === null
  const sousSombre = rang === 'sous' && theme.sous.texteBranche && couleurBranche ? encreDeBranche(teinte, theme.fond, texteTheme) : null
  const encre = h.couleurTexte ?? (surFond ? (rang === 'central' && !h.remplissage ? 'var(--notak-arbre-sur-plein)' : sur(fond)) : classe === 'secondaire' ? CLASSES.secondaire : (sousSombre ?? texteTheme))
  const sansBordure = h.motifBordure === 'aucun' || h.epaisseurBordure === 0
  const bordure = sansBordure ? 'none' : (h.bordure ?? (rang === 'flottant' || (rang === 'principal' && !h.plein) ? teinte : 'none'))
  return { teinte, fond, plein, encre, bordure }
}

/** Le tiret d'un motif de trait (`stroke-dasharray`), `undefined` pour un trait plein. */
export function tiretsDe(m: MotifTrait | undefined): string | undefined {
  switch (m) {
    case 'tirets':
    case 'tirets-main':
      return '7 5'
    case 'points':
      return '1.5 4'
    case 'tiret-point':
      return '7 4 1.5 4'
    case 'tiret-point-point':
      return '7 4 1.5 4 1.5 4'
    default:
      return undefined
  }
}

/** Un trait à main levée : tremblé à l'affichage. */
export const mainLevee = (m: MotifTrait | undefined) => m === 'main' || m === 'tirets-main'


/** Le texte d'une relation ou d'une limite, avec ce que le thème lui donne. */
export interface TexteEffectif {
  police: string | undefined
  taille: number
  graisse: number
  italique: boolean
  barre: boolean
  souligne: boolean
  casse: CasseTexte | undefined
  alignement: 'gauche' | 'centre' | 'droite'
  couleurTexte: string | undefined
}

export function texteEffectif(s: StyleTexte | undefined, defauts: { taille: number; graisse: number; alignement: 'gauche' | 'centre' | 'droite' }): TexteEffectif {
  return {
    police: s?.police,
    taille: s?.taille ?? defauts.taille,
    graisse: s?.graisse ?? (s?.gras === undefined ? defauts.graisse : s.gras ? 700 : 400),
    italique: !!s?.italique,
    barre: !!s?.barre,
    souligne: !!s?.souligne,
    casse: s?.casse,
    alignement: s?.alignement ?? defauts.alignement,
    couleurTexte: s?.couleurTexte,
  }
}

/** Ce qu'on voit d'une relation : ses valeurs, celles du thème là où le style se tait (et l'ancien `forme` et `pointes`). */
export interface RelationEffective {
  forme: FormeRelation
  motif: MotifTrait
  epaisseur: number
  /** `undefined` : l'encre de la carte. */
  couleur: string | undefined
  pointeDepart: PointeTrait
  pointeArrivee: PointeTrait
  texte: TexteEffectif
}

export function relationEffective(r: Relation): RelationEffective {
  const s = r.style
  return {
    forme: s?.forme ?? r.forme ?? 'courbe',
    motif: s?.motif ?? 'tirets',
    epaisseur: s?.epaisseur ?? 1.5,
    couleur: s?.couleur,
    pointeDepart: s?.pointeDepart ?? (r.pointes?.depart ? 'triangle' : 'aucune'),
    pointeArrivee: s?.pointeArrivee ?? (r.pointes?.arrivee === false ? 'aucune' : 'triangle'),
    texte: texteEffectif(s, { taille: 12, graisse: 400, alignement: 'centre' }),
  }
}

export interface LimiteEffective {
  forme: FormeLimite
  motifRemplissage: MotifRemplissage
  /** `undefined` : la couleur de la branche, très pâle. */
  remplissage: string | undefined
  motif: MotifTrait
  epaisseur: number
  couleur: string | undefined
  texte: TexteEffectif
}

export function limiteEffective(x: Limite): LimiteEffective {
  const s = x.style
  return {
    forme: s?.forme ?? 'arrondi',
    motifRemplissage: s?.motifRemplissage ?? 'plein',
    remplissage: s?.remplissage,
    motif: s?.motif ?? 'tirets',
    epaisseur: s?.epaisseur ?? 1.5,
    couleur: s?.couleur,
    texte: texteEffectif(s, { taille: 12, graisse: 600, alignement: 'gauche' }),
  }
}

export interface ResumeEffectif {
  forme: FormeResume
  motif: MotifTrait
  epaisseur: number
  couleur: string | undefined
}

export function resumeEffectif(r: Resume | undefined): ResumeEffectif {
  return { forme: r?.style?.forme ?? 'accolade', motif: r?.style?.motif ?? 'plein', epaisseur: r?.style?.epaisseur ?? 1.75, couleur: r?.style?.couleur }
}

/** Les couleurs des branches principales, dans l'ordre (« arc-en-ciel ») du thème classique. */
export const COULEURS_BRANCHES = THEMES[0]!.palette

/** Ce que les réglages de la carte changent aux couleurs : la couleur unique des branches, les flottants colorés. */
export interface ReglagesCouleur {
  /** Sans branches de couleur : la couleur de toutes les branches ; absente, l'encre du thème. */
  ligne?: string | undefined
  /** Chaque sujet flottant (et sa branche) prend une couleur du thème, tour à tour. */
  flottants?: boolean
}

/**
 * La couleur de la branche d'un sujet : celle qu'un ancêtre (ou lui-même) déclare, sinon celle de son principal dans
 * la palette du thème. Le central : `null` (l'encre du thème), un flottant aussi, sauf si `flottants` les colore.
 * `uneCouleur` : jamais d'arc-en-ciel, la couleur unique `ligne` ou l'encre.
 */
export function couleurDe(l: Lecture, id: Id, theme: Theme = THEMES[0]!, uneCouleur = false, r: ReglagesCouleur = {}): string | null {
  let x: Id | undefined = id
  while (x !== undefined) {
    const s = l.sujets.get(x)
    if (!s) return null
    if (s.style?.couleurBranche) return s.style.couleurBranche
    if (s.genre === 'detache') return r.flottants ? (theme.palette[Math.max(0, l.flottants.indexOf(x)) % theme.palette.length] ?? null) : null
    if (s.parent === undefined) return null
    if (s.parent === l.central) {
      const central = l.sujets.get(l.central)?.style
      if (uneCouleur) return central?.couleurBranche ?? r.ligne ?? null
      const palette = central?.serieCouleurs?.length ? central.serieCouleurs : theme.palette
      return palette[enfantsDe(l, l.central).indexOf(x) % palette.length] ?? null
    }
    x = s.parent
  }
  return null
}

/** Comment se trace la branche qui part de `parent` : son style, ou celui du premier ancêtre qui en déclare un. */
export interface StyleDeBranche {
  forme: FormeBranche | null
  epaisseur: number | null
  effilee: boolean
  motif: MotifTrait
  pointe: PointeTrait
}

/** Ce que la carte impose à toutes ses branches, à moins qu'un sujet n'en dise autrement. */
export interface BranchesGlobales {
  /** La largeur, en points. */
  largeur?: number | undefined
  /** Les branches du central s'amincissent jusqu'en pointe. */
  effilee?: boolean | undefined
}

/** Un point (1/72 de pouce) en pixels d'écran. */
export const PX_PAR_POINT = 4 / 3

/**
 * Comment se trace la branche qui part de `parent`. Avec `theme`, l'épaisseur que le thème donne au rang de `parent`
 * (central, principal, sous-sujet) s'ajoute quand ni le sujet ni la carte n'en règlent une.
 */
export function brancheDe(l: Lecture, parent: Id, globales: BranchesGlobales = {}, theme?: Theme): StyleDeBranche {
  const r: StyleDeBranche = { forme: null, epaisseur: null, effilee: false, motif: 'plein', pointe: 'aucune' }
  const vus = { forme: false, epaisseur: false, effilee: false, motif: false, pointe: false }
  for (let s = l.sujets.get(parent); s; s = s.parent !== undefined ? l.sujets.get(s.parent) : undefined) {
    const st = s.style
    if (!st) continue
    if (!vus.forme && st.branche) ((r.forme = st.branche), (vus.forme = true))
    if (!vus.epaisseur && st.epaisseurBranche !== undefined) ((r.epaisseur = st.epaisseurBranche), (vus.epaisseur = true))
    if (!vus.effilee && st.effilee !== undefined) ((r.effilee = st.effilee), (vus.effilee = true))
    if (!vus.motif && st.motif) ((r.motif = st.motif), (vus.motif = true))
    if (!vus.pointe && st.pointeBranche) ((r.pointe = st.pointeBranche), (vus.pointe = true))
  }
  if (!vus.epaisseur && globales.largeur) r.epaisseur = Math.round(globales.largeur * PX_PAR_POINT * 10) / 10
  else if (!vus.epaisseur && theme?.branches) {
    const rang = rangDe(l, parent)
    r.epaisseur = theme.branches[rang === 'central' ? 'central' : rang === 'sous' ? 'sous' : 'principal']
  }
  if (!vus.effilee && globales.effilee && parent === l.central) r.effilee = true
  return r
}

let contexte2d: CanvasRenderingContext2D | null | undefined
let regle: HTMLSpanElement | undefined

/**
 * La largeur d'un texte dans cette police, mesurée par le moteur de texte de la page : le dessin et le champ d'édition
 * passent par lui, et le canevas en diffère de quelques pixels sous WebKit (l'app macOS), assez pour qu'un mot passe à
 * la ligne dans le champ et pas dans le sujet. Sans moteur de mise en page (les tests), une estimation.
 */
function largeurTexte(texte: string, police: number, graisse: number, famille = POLICE, italique = false): number {
  if (contexte2d === undefined) {
    try {
      contexte2d = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
    } catch {
      contexte2d = null
    }
  }
  if (!contexte2d) return texte.length * police * 0.55
  if (!regle && document.body) {
    regle = document.createElement('span')
    regle.setAttribute('aria-hidden', 'true')
    regle.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;white-space:pre;font-kerning:normal;letter-spacing:normal'
    document.body.appendChild(regle)
  }
  const fonte = `${italique ? 'italic ' : ''}${graisse} ${police}px ${famille}`
  if (!regle?.isConnected) {
    contexte2d.font = fonte
    return contexte2d.measureText(texte).width
  }
  regle.style.font = fonte
  regle.textContent = texte
  return regle.getBoundingClientRect().width
}

/**
 * Les lignes d'un titre, coupé aux mots pour tenir dans `largeur` ; un mot plus long que la ligne se coupe entre deux
 * lettres, comme le fait le champ d'édition (et Xmind).
 */
export function lignesDe(titre: string, police: number, graisse: number, largeur: number, famille = POLICE, italique = false): string[] {
  const mesure = (x: string) => largeurTexte(x, police, graisse, famille, italique)
  const sortie: string[] = []
  for (const paragraphe of (titre || ' ').split('\n')) {
    let ligne = ''
    for (const mot of paragraphe.split(' ')) {
      const essai = ligne ? `${ligne} ${mot}` : mot
      if (mesure(essai) <= largeur) {
        ligne = essai
        continue
      }
      if (ligne) sortie.push(ligne)
      ligne = mot
      // Un mot qui ne tient pas seul : on le coupe à la dernière lettre qui tient.
      while (ligne.length > 1 && mesure(ligne) > largeur) {
        let n = ligne.length - 1
        while (n > 1 && mesure(ligne.slice(0, n)) > largeur) n--
        sortie.push(ligne.slice(0, n))
        ligne = ligne.slice(n)
      }
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
  /** Ce qui se pose comme une image : l'image elle-même, un autocollant ou une illustration. */
  image?: { l: number; h: number }
  /** « Afficher toutes les notes » : le texte de la note, montré en bloc sous le titre. */
  note?: string
  /** Une équation, au-dessus du titre. */
  equation?: { l: number; h: number }
  /** La tâche planifiée, résumée en une ligne sous le titre (« 3 → 9 janv. · 7 j »). */
  planning?: string
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
  /** Où va le bloc de la note, quand toutes les notes s'affichent : sa première ligne, et ses lignes. */
  note: { y: number; lignes: string[]; l: number } | null
  /** Où va l'équation. */
  equation: { x: number; y: number } | null
  /** Où va la ligne de la tâche planifiée, et sa largeur. */
  planning: { y: number; l: number } | null
}

const TAILLE_ICONE = 16
const PAS_ICONE = 19
const HAUTEUR_ETIQUETTE = 18
/** La pastille d'une tâche planifiée : un camembert d'avancement, puis les dates. */
const POLICE_PLANNING = 11
const DISQUE_PLANNING = 12
const POLICE_ETIQUETTE = 11
/** Le bloc d'une note : sa police, sa largeur, le nombre de lignes montrées (le reste se coupe en « … »). */
export const POLICE_NOTE = 11
const LARGEUR_NOTE = 200
const LIGNES_NOTE = 8

const memo = new Map<string, Mesure>()

/** Les lignes d'une note : coupées à la largeur du bloc, les premières seulement. */
function lignesDeNote(texte: string): string[] {
  const lignes = lignesDe(texte.trim(), POLICE_NOTE, 400, LARGEUR_NOTE)
  if (lignes.length <= LIGNES_NOTE) return lignes
  return [...lignes.slice(0, LIGNES_NOTE - 1), `${lignes[LIGNES_NOTE - 1]}…`]
}

export function mesurer(titre: string, h: Habit, decor: Decor = {}): Mesure {
  const cle = `${titre}\u0000${h.police}|${h.graisse}|${h.italique}|${h.famille}|${h.marge}|${h.largeurMax}|${h.largeur ?? ''}|${h.casse ?? ''}|${h.alignement}|${h.forme}|${h.epaisseurBordure ?? ''}\u0000${JSON.stringify(decor)}`
  const deja = memo.get(cle)
  if (deja) return deja
  const prefixe = decor.prefixe ? largeurTexte(`${decor.prefixe} `, h.police, h.graisse, h.famille, h.italique) : 0
  const avant = (decor.tache ? PAS_ICONE : 0) + (decor.marqueurs ?? 0) * PAS_ICONE + prefixe
  const apres = (decor.icones ?? 0) * PAS_ICONE + (decor.icones ? 4 : 0)
  // Une largeur imposée : le titre passe à la ligne pour tenir entre les marges, devant et derrière ce qui l'entoure.
  const largeurLigne = h.largeur ? Math.max(24, h.largeur - 2 * h.marge[1] - avant - apres) : h.largeurMax
  const lignes = lignesDe(appliquerCasse(titre, h.casse), h.police, h.graisse, largeurLigne, h.famille, h.italique)
  const lTexte = Math.max(...lignes.map((x) => largeurTexte(x, h.police, h.graisse, h.famille, h.italique)), h.police * 1.5)
  const hTexte = lignes.length * h.police * INTERLIGNE
  const lRangee = avant + lTexte + apres
  const hRangee = Math.max(hTexte, decor.tache || decor.marqueurs || decor.icones ? TAILLE_ICONE : 0)
  const largeurs = (decor.etiquettes ?? []).map((e) => Math.ceil(largeurTexte(e, POLICE_ETIQUETTE, 500) + 12))
  const lEtiquettes = largeurs.reduce((s, x, i) => s + x + (i > 0 ? 4 : 0), 0)
  const lignesNote = decor.note ? lignesDeNote(decor.note) : null
  const lNote = lignesNote ? Math.max(...lignesNote.map((x) => largeurTexte(x, POLICE_NOTE, 400))) : 0
  const lPlanning = decor.planning ? Math.ceil(largeurTexte(decor.planning, POLICE_PLANNING, 500) + DISQUE_PLANNING + 14) : 0
  const interieur = Math.max(lRangee, lEtiquettes, lPlanning, decor.image?.l ?? 0, decor.equation?.l ?? 0, lNote)
  let l = h.largeur ? Math.round(h.largeur) : Math.ceil(interieur + 2 * h.marge[1])
  let y = h.marge[0]
  const image = decor.image ? { x: l / 2 - decor.image.l / 2, y } : null
  if (decor.image) y += decor.image.h + 6
  const equation = decor.equation ? { x: l / 2 - decor.equation.l / 2, y } : null
  if (decor.equation) y += decor.equation.h + 6
  // Le bloc du titre se range à gauche, au centre ou à droite de l'intérieur du sujet.
  const x0 = h.alignement === 'gauche' ? h.marge[1] : h.alignement === 'droite' ? l - h.marge[1] - lRangee : l / 2 - lRangee / 2
  const rangee = { x: x0, y, h: hRangee }
  const texte = { x: rangee.x + avant, y: y + (hRangee - hTexte) / 2, l: lTexte, h: hTexte }
  y += hRangee
  const etiquettes = largeurs.length > 0 ? { y: y + 4, largeurs } : null
  if (etiquettes) y += 4 + HAUTEUR_ETIQUETTE
  const planning = lPlanning > 0 ? { y: y + 4, l: lPlanning } : null
  if (planning) y += 4 + HAUTEUR_ETIQUETTE
  const note = lignesNote ? { y: y + 6, lignes: lignesNote, l: lNote } : null
  if (note) y += 6 + lignesNote!.length * POLICE_NOTE * INTERLIGNE
  // Un sujet souligné : le trait prend sa place sous le texte, en plus de la marge (la ligne double, deux traits).
  const dessous = souligne(h.forme) ? epaisseurSouligne(h) + (h.forme === 'double-souligne' ? 4 : 0) : 0
  let hauteur = Math.ceil(y + h.marge[0] + dessous)
  // Un cercle tient dans un carré : le texte se recentre.
  if (formeCarree(h.forme)) {
    const c = Math.max(l, hauteur)
    const [dx, dy] = [(c - l) / 2, (c - hauteur) / 2]
    rangee.x += dx
    rangee.y += dy
    texte.x += dx
    texte.y += dy
    if (image) ((image.x += dx), (image.y += dy))
    if (etiquettes) etiquettes.y += dy
    if (note) note.y += dy
    if (equation) ((equation.x += dx), (equation.y += dy))
    if (planning) planning.y += dy
    ;[l, hauteur] = [c, c]
  }
  const mesure: Mesure = { lignes, l, h: hauteur, rangee, texte, etiquettes, image, note, equation, planning }
  if (memo.size > 5000) memo.clear()
  memo.set(cle, mesure)
  return mesure
}

/**
 * « Justifier l'alignement du sujet » : les sujets d'un même niveau (les principaux ensemble, les sous-sujets de
 * même profondeur ensemble) prennent la largeur du plus large. Le central, les flottants et les résumés gardent la leur.
 */
export function uniformiser(l: Lecture, mesures: ReadonlyMap<Id, Mesure>): Map<Id, Mesure> {
  const largeurs = new Map<number, number>()
  const niveau = (id: Id) => {
    const s = l.sujets.get(id)
    return !s || s.parent === undefined || s.genre ? 0 : profondeur(l, id)
  }
  for (const [id, m] of mesures) {
    const n = niveau(id)
    if (n > 0) largeurs.set(n, Math.max(largeurs.get(n) ?? 0, m.l))
  }
  const sortie = new Map<Id, Mesure>()
  for (const [id, m] of mesures) {
    const n = niveau(id)
    const cible = n > 0 ? largeurs.get(n)! : m.l
    if (cible <= m.l) {
      sortie.set(id, m)
      continue
    }
    const d = (cible - m.l) / 2
    sortie.set(id, { ...m, l: cible, rangee: { ...m.rangee, x: m.rangee.x + d }, texte: { ...m.texte, x: m.texte.x + d }, image: m.image && { ...m.image, x: m.image.x + d } })
  }
  return sortie
}

/**
 * La mesure d'un sujet de la carte, avec tout ce qu'il porte autour de son titre. `compacte` : la carte compacte.
 * `toutesNotes` : la note s'écrit sous le titre au lieu de son icône.
 */
export function mesureDeSujet(
  l: Lecture,
  id: Id,
  theme: Theme,
  o: { compacte?: boolean; toutesNotes?: boolean; tailleEquation?: (latex: string) => Taille; planning?: (p: NonNullable<Sujet['planning']>) => string } = {},
): Mesure {
  const s = l.sujets.get(id)!
  return mesurer(s.titre, habitDe(l, id, theme, !!o.compacte), {
    tache: !!s.tache,
    marqueurs: s.marqueurs?.length ?? 0,
    prefixe: numeroDe(l, id),
    icones: (s.note && !o.toutesNotes ? 1 : 0) + (s.lien ? 1 : 0) + (s.piece ? 1 : 0),
    ...(s.etiquettes?.length ? { etiquettes: s.etiquettes } : {}),
    ...(s.image ? { image: { l: s.image.l, h: s.image.h } } : s.vignette ? { image: { l: s.vignette.l, h: s.vignette.h } } : {}),
    ...(s.equation && o.tailleEquation ? { equation: o.tailleEquation(s.equation) } : {}),
    ...(s.planning && o.planning ? { planning: o.planning(s.planning) } : {}),
    ...(s.note && o.toutesNotes ? { note: texteBrut(s.note) } : {}),
  })
}

export { DISQUE_PLANNING, HAUTEUR_ETIQUETTE, PAS_ICONE, POLICE_ETIQUETTE, POLICE_PLANNING, TAILLE_ICONE }
