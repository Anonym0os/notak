import type { Arbre, Id, StructureArbre, StyleSujet } from '../../../coeur/tableau'
import { squeletteDe } from '../carte/squelettes'
import { changerSujet, enfantsDe, lire } from './sujets'

/**
 * Les gestes de l'onglet Carte (docs/XMIND.md § 9) : ce qu'on règle sur la carte entière. Des fonctions pures
 * `(Arbre) → Arbre`, que `appliquerGeste` appelle : chacune passe donc par l'historique comme tout geste.
 *
 * Ce que Xmind efface en passant (« l'utilisateur le découvre au résultat, sans confirmation ») est repris :
 * choisir une police ou une largeur retire celles posées sujet par sujet ; choisir un thème de couleur retire les
 * couleurs posées à la main ; choisir un squelette retire les structures posées sur les sujets principaux, les
 * réglages globaux de ligne et de police, et les largeurs de sujets.
 */

/** Les familles « carte » : celles où « Carte équilibrée » et « Branches libres » ont un sens. */
export const STRUCTURES_CARTE: readonly StructureArbre[] = ['carte', 'carte-libre', 'carte-horaire', 'carte-antihoraire']
export const estEquilibree = (s: StructureArbre | undefined) => s === 'carte' || s === 'carte-horaire' || s === 'carte-antihoraire'

/** Les largeurs de ligne qu'on propose, en points : très fin, mince, moyen, gras, très gras. */
export const LARGEURS_BRANCHE = [1, 2, 3, 5, 8] as const

/** Les réglages booléens de la carte, ceux de `Arbre['options']`. */
export type CleOption = keyof NonNullable<Arbre['options']>

/** Un thème de couleur choisi : son identifiant, la couleur d'accent de sa variante (aucune : branches de couleur). */
export interface ChoixTheme {
  theme: string
  accent?: string | undefined
  /** Un thème de couleur à soi : son nom et ses six couleurs, que la carte garde. */
  perso?: { nom: string; palette: string[] } | undefined
}

/**
 * Tout ce qui fait le « style » d'une carte, hors son contenu : de quoi faire un thème personnalisé (« créer un
 * thème d'après le style actuel »), et le rendre à une carte.
 */
export interface StyleCarte {
  theme?: string
  themePerso?: { nom: string; palette: string[] }
  fond?: string
  police?: string
  policeCjk?: string
  largeurBranche?: number
  effile?: boolean
  jeuCouleurs?: string[]
  couleurLigne?: string
  options?: NonNullable<Arbre['options']>
}

export type GesteCarte =
  | { type: 'squelette'; squelette: string }
  | { type: 'themeCouleur'; choix: ChoixTheme }
  | { type: 'fond'; couleur: string | null }
  | { type: 'policeGlobale'; police: string | null }
  | { type: 'policeCjk'; police: string | null }
  | { type: 'largeurBranche'; pt: number | null; effile?: boolean }
  | { type: 'jeuCouleurs'; couleurs: string[] | null }
  | { type: 'couleurLigne'; couleur: string | null }
  | { type: 'equilibrer'; actif: boolean }
  | { type: 'reglage'; cle: CleOption; actif: boolean }
  | { type: 'styleCarte'; style: StyleCarte }

export const GESTES_CARTE: ReadonlySet<string> = new Set(['squelette', 'themeCouleur', 'fond', 'policeGlobale', 'policeCjk', 'largeurBranche', 'jeuCouleurs', 'couleurLigne', 'equilibrer', 'reglage', 'styleCarte'])

/** Une carte sans le champ `cle` (un champ absent, pas `undefined` : c'est ce qu'écrit la carte Yjs). */
function sans<K extends keyof Arbre>(a: Arbre, ...cles: K[]): Arbre {
  const r: Arbre = { ...a }
  for (const k of cles) delete r[k]
  return r
}

/** La carte, avec ce champ posé, ou retiré si la valeur est vide. */
function avec<K extends keyof Arbre>(a: Arbre, cle: K, valeur: Arbre[K] | null | undefined | ''): Arbre {
  return valeur === null || valeur === undefined || valeur === '' ? sans(a, cle) : { ...a, [cle]: valeur }
}

/** Retire une clé de style de tous les sujets (ceux qui n'en ont pas ne bougent pas). */
function effacerStyle(a: Arbre, champs: readonly (keyof StyleSujet)[], garde: (id: Id) => boolean = () => true): Arbre {
  const l = lire(a)
  let arbre = a
  for (const [id, s] of l.sujets) {
    if (!s.style || !garde(id) || !champs.some((c) => s.style![c] !== undefined)) continue
    arbre = changerSujet(arbre, id, ({ style, ...reste }) => {
      const neuf = { ...style }
      for (const c of champs) delete neuf[c]
      return Object.keys(neuf).length > 0 ? { ...reste, style: neuf } : reste
    })
  }
  return arbre
}

/** Les options, sans celles qui sont éteintes ; sans option du tout, le champ disparaît. */
function avecOptions(a: Arbre, options: NonNullable<Arbre['options']>): Arbre {
  const gardees = Object.fromEntries(Object.entries(options).filter(([, v]) => v)) as Arbre['options']
  return gardees && Object.keys(gardees).length > 0 ? { ...a, options: gardees } : sans(a, 'options')
}

/**
 * Un squelette : sa structure sur le central, son style pour tous les rangs. Comme chez Xmind, il efface en passant les
 * structures posées sur les sujets principaux, la police et la largeur de ligne de toute la carte (celles de l'onglet
 * Carte) et les largeurs imposées aux sujets ; l'effilé de la carte suit le sien. Les couleurs restent : un squelette
 * n'en porte pas. Un style posé à la main sur un sujet reste, et passe toujours avant le squelette. Un identifiant
 * inconnu ne change rien.
 */
export function appliquerSquelette(a: Arbre, id: string): Arbre {
  const def = squeletteDe(id)
  if (!def) return a
  const l = lire(a)
  let arbre = changerSujet(a, l.central, ({ structure: _s, ...reste }) => ({ ...reste, structure: def.structure }))
  for (const p of enfantsDe(l, l.central)) if (l.sujets.get(p)?.structure) arbre = changerSujet(arbre, p, ({ structure: _s, ...reste }) => reste)
  for (const [sid, s] of l.sujets) if (s.largeur !== undefined) arbre = changerSujet(arbre, sid, ({ largeur: _l, ...reste }) => reste)
  arbre = sans(arbre, 'police', 'largeurBranche', 'effile')
  return { ...arbre, squelette: def.id, ...(def.effile ? { effile: true } : {}) }
}

/** « Carte équilibrée » : allumée, le central rayonne des deux côtés (sens horaire) ; éteinte, tout va d'un côté. */
export function equilibrer(a: Arbre, actif: boolean): Arbre {
  const l = lire(a)
  const s = l.sujets.get(l.central)?.structure
  if (actif === estEquilibree(s)) return a
  return changerSujet(a, l.central, ({ structure: _s, ...reste }) => ({ ...reste, structure: actif ? 'carte-horaire' : 'carte-libre' }))
}

/**
 * Un thème de couleur : il remplace le thème, efface les couleurs posées à la main, le fond choisi et le jeu de
 * couleurs de branches. Une variante à une couleur : branches d'une seule couleur, celle de l'accent.
 */
export function appliquerThemeCouleur(a: Arbre, choix: ChoixTheme): Arbre {
  let arbre = effacerStyle(a, ['remplissage', 'bordure', 'couleurTexte', 'couleurBranche'])
  arbre = sans(arbre, 'fond', 'jeuCouleurs', 'couleurLigne', 'themePerso')
  arbre = choix.theme === 'classique' ? sans(arbre, 'theme') : { ...arbre, theme: choix.theme }
  if (choix.perso) arbre = { ...arbre, themePerso: { nom: choix.perso.nom, palette: [...choix.perso.palette] } }
  const options = { ...arbre.options }
  if (choix.accent) {
    options.uneCouleur = true
    arbre = { ...arbre, couleurLigne: choix.accent }
  } else delete options.uneCouleur
  return avecOptions(arbre, options)
}

/** La police de toute la carte : elle retire celles posées sujet par sujet. `null` : celle du thème. */
export function appliquerPoliceGlobale(a: Arbre, police: string | null): Arbre {
  return avec(effacerStyle(a, ['police']), 'police', police)
}

/** La largeur des branches, en points, et leur effilement : ils retirent ceux posés sujet par sujet. */
export function appliquerLargeurBranche(a: Arbre, pt: number | null, effile = false): Arbre {
  let arbre = effacerStyle(a, ['epaisseurBranche', 'effilee'])
  arbre = avec(arbre, 'largeurBranche', pt)
  return effile ? { ...arbre, effile: true } : sans(arbre, 'effile')
}

/** Un réglage tout ou rien, avec ce qu'il entraîne : éteindre les branches libres les remet en place, allumer les flottants colorés retire leur remplissage choisi. */
export function appliquerReglage(a: Arbre, cle: CleOption, actif: boolean): Arbre {
  let arbre = a
  if (cle === 'libre' && !actif) {
    const l = lire(a)
    for (const [id, s] of l.sujets) if (s.decalage) arbre = changerSujet(arbre, id, ({ decalage: _d, ...reste }) => reste)
  }
  if (cle === 'flottantsColores' && actif) {
    const l = lire(a)
    arbre = effacerStyle(arbre, ['remplissage'], (id) => l.sujets.get(id)?.genre === 'detache')
  }
  return avecOptions(arbre, { ...a.options, [cle]: actif })
}

/** Le style d'une carte, tel qu'il est : de quoi le garder comme thème personnalisé. */
export function styleDeCarte(a: Arbre): StyleCarte {
  const s: StyleCarte = {}
  if (a.theme) s.theme = a.theme
  if (a.themePerso) s.themePerso = { nom: a.themePerso.nom, palette: [...a.themePerso.palette] }
  if (a.fond) s.fond = a.fond
  if (a.police) s.police = a.police
  if (a.policeCjk) s.policeCjk = a.policeCjk
  if (a.largeurBranche) s.largeurBranche = a.largeurBranche
  if (a.effile) s.effile = true
  if (a.jeuCouleurs?.length) s.jeuCouleurs = [...a.jeuCouleurs]
  if (a.couleurLigne) s.couleurLigne = a.couleurLigne
  if (a.options && Object.keys(a.options).length > 0) s.options = { ...a.options }
  return s
}

/** Ce qu'un thème personnalisé règle : l'aspect (couleurs, polices, largeurs, densité), pas le comportement (branches libres, chevauchement…). */
const OPTIONS_DE_STYLE = ['uneCouleur', 'compacte', 'uniforme', 'toutesNotes', 'flottantsColores', 'relationsColorees'] as const

/** Le style, réduit à ce qu'un thème règle, dans un ordre fixe : deux styles qui ne diffèrent que par le reste sont les mêmes. */
export function styleVisuel(s: StyleCarte): StyleCarte {
  const options: NonNullable<Arbre['options']> = {}
  for (const cle of OPTIONS_DE_STYLE) if (s.options?.[cle]) options[cle] = true
  return {
    ...(s.theme ? { theme: s.theme } : {}),
    ...(s.themePerso ? { themePerso: s.themePerso } : {}),
    ...(s.fond ? { fond: s.fond.toLowerCase() } : {}),
    ...(s.police ? { police: s.police } : {}),
    ...(s.policeCjk ? { policeCjk: s.policeCjk } : {}),
    ...(s.largeurBranche ? { largeurBranche: s.largeurBranche } : {}),
    ...(s.effile ? { effile: true } : {}),
    ...(s.jeuCouleurs?.length ? { jeuCouleurs: s.jeuCouleurs } : {}),
    ...(s.couleurLigne ? { couleurLigne: s.couleurLigne } : {}),
    ...(Object.keys(options).length ? { options } : {}),
  }
}

export const memeStyle = (a: StyleCarte, b: StyleCarte): boolean => JSON.stringify(styleVisuel(a)) === JSON.stringify(styleVisuel(b))

/** Rend à la carte un style gardé : ses réglages remplacent ceux de la carte, qui garde son contenu. */
export function appliquerStyleCarte(a: Arbre, style: StyleCarte): Arbre {
  let arbre = effacerStyle(a, ['remplissage', 'bordure', 'couleurTexte', 'couleurBranche', 'police', 'epaisseurBranche', 'effilee'])
  arbre = sans(arbre, 'theme', 'themePerso', 'fond', 'police', 'policeCjk', 'largeurBranche', 'effile', 'jeuCouleurs', 'couleurLigne', 'options')
  const neuf: Arbre = { ...arbre }
  if (style.theme) neuf.theme = style.theme
  if (style.themePerso) neuf.themePerso = { nom: style.themePerso.nom, palette: [...style.themePerso.palette] }
  if (style.fond) neuf.fond = style.fond
  if (style.police) neuf.police = style.police
  if (style.policeCjk) neuf.policeCjk = style.policeCjk
  if (style.largeurBranche) neuf.largeurBranche = style.largeurBranche
  if (style.effile) neuf.effile = true
  if (style.jeuCouleurs?.length) neuf.jeuCouleurs = [...style.jeuCouleurs]
  if (style.couleurLigne) neuf.couleurLigne = style.couleurLigne
  // Ce qui est géométrique (libre, chevauchement…) reste à la carte : un thème règle l'aspect, pas le comportement.
  const garde = a.options ?? {}
  const options: NonNullable<Arbre['options']> = { ...garde }
  for (const cle of OPTIONS_DE_STYLE) {
    if (style.options?.[cle]) options[cle] = true
    else delete options[cle]
  }
  return avecOptions(neuf, options)
}

/** Applique un geste de l'onglet Carte. */
export function appliquerGesteCarte(a: Arbre, g: GesteCarte): Arbre {
  switch (g.type) {
    case 'squelette':
      return appliquerSquelette(a, g.squelette)
    case 'themeCouleur':
      return appliquerThemeCouleur(a, g.choix)
    case 'fond':
      return avec(a, 'fond', g.couleur)
    case 'policeGlobale':
      return appliquerPoliceGlobale(a, g.police)
    case 'policeCjk':
      return avec(a, 'policeCjk', g.police)
    case 'largeurBranche':
      return appliquerLargeurBranche(a, g.pt, g.effile)
    case 'jeuCouleurs':
      return avec(a, 'jeuCouleurs', g.couleurs?.length ? g.couleurs : null)
    case 'couleurLigne':
      return avec(a, 'couleurLigne', g.couleur)
    case 'equilibrer':
      return equilibrer(a, g.actif)
    case 'reglage':
      return appliquerReglage(a, g.cle, g.actif)
    case 'styleCarte':
      return appliquerStyleCarte(a, g.style)
  }
}
