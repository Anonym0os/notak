import type { Ligne, Mesure } from '../modele/dimensions'

/**
 * La mesure du texte des diapositives (relevé 11 § 0.3) : comment un texte se coupe, à une taille et dans une police
 * données, sur une largeur. Xmind mesure dans un élément caché ; Notak mesure au canevas 2D, police chargée, ce qui
 * donne les mêmes largeurs sans toucher au document. La coupe est la nôtre : aux espaces, entre deux idéogrammes, et un
 * mot plus large que la ligne se coupe où il déborde (`break-word`). Le modèle (`ajuster`) reçoit cette mesure.
 */

/** Le caractère qui tient la place d'un marqueur devant un titre : un carré de la taille du texte, plus sa marge. */
export const MARQUEUR = ''

/** La place d'un marqueur, en em : le carré, et sa marge (2 vmin devant un grand titre, 1 vmin en liste, ≈ 0,2 em). */
export const PLACE_MARQUEUR = 1.2

/**
 * Une police telle que la mesure la reçoit : la graisse, l'italique, puis la famille, séparées de `|`. La taille
 * s'ajoute à la mesure.
 */
export const police = (famille: string, graisse: number | string = 400, italique = false): string => `${italique ? 'italic ' : ''}${graisse}|${famille}`

/** La propriété `font` du canevas pour cette police à cette taille. */
export function fonte(p: string, taille: number): string {
  const [avant, famille] = p.split('|') as [string, string | undefined]
  return `${avant} ${taille}px ${famille ?? 'sans-serif'}`
}

const IDEOGRAMME = /[⺀-鿿가-힯豈-﫿＀-￯]/

/** Les morceaux insécables d'un texte : un mot avec les espaces qui le suivent, ou un idéogramme seul. */
export function morceaux(texte: string): string[] {
  const sortie: string[] = []
  let courant = ''
  for (const c of texte) {
    if (IDEOGRAMME.test(c) || c === MARQUEUR) {
      if (courant) sortie.push(courant)
      sortie.push(c)
      courant = ''
    } else if (c === ' ' || c === '\t') courant += c
    else {
      // Un mot commence après des espaces : le morceau d'avant s'arrête là.
      if (courant && /\s$/.test(courant)) {
        sortie.push(courant)
        courant = ''
      }
      courant += c
    }
  }
  if (courant) sortie.push(courant)
  return sortie
}

/**
 * La coupe en lignes, gloutonne comme celle du navigateur : on ajoute les morceaux tant que la ligne tient (ses espaces
 * de fin ne comptent pas) ; un morceau plus large que toute la ligne se coupe caractère par caractère. Un saut de ligne
 * force une ligne.
 */
export function couper(texte: string, largeur: number, largeurDe: (s: string) => number): Ligne[] {
  const lignes: Ligne[] = []
  const pousser = (s: string) => {
    const t = s.trimEnd()
    lignes.push({ texte: t, largeur: largeurDe(t) })
  }
  // Un morceau plus large que toute la ligne : il se coupe où il déborde, et sa fin commence la ligne suivante.
  const casser = (m: string) => {
    let bout = ''
    for (const c of m.trimEnd()) {
      if (bout && largeurDe(bout + c) > largeur) {
        pousser(bout)
        bout = ''
      }
      bout += c
    }
    return bout + m.slice(m.trimEnd().length)
  }
  for (const paragraphe of texte.split('\n')) {
    let ligne = ''
    for (const m of morceaux(paragraphe)) {
      if (ligne && largeurDe((ligne + m).trimEnd()) > largeur) {
        pousser(ligne)
        ligne = ''
      }
      ligne = !ligne && largeurDe(m.trimEnd()) > largeur ? casser(m) : ligne + m
    }
    pousser(ligne)
  }
  return lignes
}

/** Une estimation sans canevas (les tests, le rendu serveur) : 0,55 em par caractère, 0,6 en gras, l'idéogramme 1 em. */
export function largeurEstimee(s: string, taille: number, p: string): number {
  const gras = /^(italic )?(bold|[6-9]00)/.test(p)
  let n = 0
  for (const c of s) n += c === MARQUEUR ? PLACE_MARQUEUR : IDEOGRAMME.test(c) ? 1 : c === ' ' ? 0.28 : gras ? 0.6 : 0.55
  return n * taille
}

let contexte: CanvasRenderingContext2D | null | undefined
const sansCanevas = () => typeof document === 'undefined' || (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent))

function canevas(): CanvasRenderingContext2D | null {
  if (contexte !== undefined) return contexte
  try {
    contexte = sansCanevas() ? null : document.createElement('canvas').getContext('2d')
  } catch {
    contexte = null
  }
  return contexte
}

const largeurs = new Map<string, number>()
const coupes = new Map<string, readonly Ligne[]>()
const PLAFOND = 20000

/** Oublie les mesures faites : une police vient d'arriver, les largeurs changent. */
export function oublierMesures() {
  largeurs.clear()
  coupes.clear()
}

/** La largeur d'un texte d'une ligne, en px de base, au canevas si on l'a. */
export function largeurTexte(s: string, taille: number, p: string): number {
  const cle = `${p}\u0001${taille}\u0001${s}`
  const deja = largeurs.get(cle)
  if (deja !== undefined) return deja
  const ctx = canevas()
  let l: number
  if (!ctx) l = largeurEstimee(s, taille, p)
  else {
    ctx.font = fonte(p, taille)
    // Le marqueur n'est pas un glyphe : sa place est fixe.
    const marqueurs = [...s].filter((c) => c === MARQUEUR).length
    l = ctx.measureText(marqueurs ? s.replaceAll(MARQUEUR, '') : s).width + marqueurs * PLACE_MARQUEUR * taille
  }
  if (largeurs.size > PLAFOND) largeurs.clear()
  largeurs.set(cle, l)
  return l
}

/** La mesure branchée sur le modèle : coupe et largeurs réelles, gardées en mémoire. */
export const mesurer: Mesure = (texte, taille, p, largeur) => {
  const cle = `${p}\u0001${taille}\u0001${largeur}\u0001${texte}`
  const deja = coupes.get(cle)
  if (deja) return deja
  const lignes = couper(texte, largeur, (s) => largeurTexte(s, taille, p))
  if (coupes.size > PLAFOND) coupes.clear()
  coupes.set(cle, lignes)
  return lignes
}

/**
 * L'interlettrage (em) qui rend la version normale d'un texte aussi large que sa version grasse, par pas de 0,005 em,
 * jusqu'à 0,1 em (les paroles, relevé 11 § 5).
 */
export function interlettrage(normale: number, grasse: number, caracteres: number, taille: number, pas = 0.005, max = 0.1): number {
  if (caracteres <= 0 || grasse <= normale) return 0
  const brut = (grasse - normale) / (caracteres * taille)
  return Math.min(max, Math.round(brut / pas) * pas)
}
