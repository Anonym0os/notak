import type { Arbre, CasseTexte, Id } from '../../../coeur/tableau'
import { en, fr } from '../../../langue'
import { INTERLIGNE, type Mesure, couleurDe, couleursDe, habitDe, rangDe } from '../apparence'
import type { Disposition } from '../disposition'
import { themeDeArbre } from '../themes'
import { courbeRelation } from '../trace/relations'
import { sujetsDePlage } from './elements'
import type { Lecture } from './sujets'

/**
 * Le champ où l'on écrit un titre (docs/XMIND.md § 4 bis) : posé exactement sur le texte du sujet, sans boîte, à sa
 * police, sa taille, sa graisse, sa couleur et son alignement. Ce module dit où il se pose et ce qu'il porte ; la fenêtre
 * le dessine dans le repère de la carte, donc juste à tous les zooms.
 */

/** Le champ déborde un peu de chaque côté du texte (en px de carte) : de la place pour le curseur, sans changer les retours à la ligne. */
export const DEBORD_CHAMP = 1

/**
 * Un texte HTML s'assoit sur sa ligne un peu plus bas qu'un texte SVG de même police (la demi-interligne d'Inter) : le
 * champ remonte d'autant (en fraction de la taille) pour que le texte ne saute pas à l'ouverture.
 */
export const RATTRAPAGE_BASE = 0.03

export interface ChampPose {
  /** Un sujet (le champ prend son texte), ou ce qui porte un titre sur la carte : une relation, une zone, une limite. */
  genre: 'sujet' | 'objet'
  /** Coin haut gauche, largeur et hauteur, en px de carte. */
  x: number
  y: number
  l: number
  h: number
  police: number
  graisse: number
  famille?: string
  /** L'interligne, en px de carte. */
  interligne: number
  italique: boolean
  alignement: 'gauche' | 'centre' | 'droite'
  casse?: CasseTexte
  decoration?: string
  /** La couleur du texte du sujet ; absent : celle de la fenêtre. */
  couleur?: string
  /** La largeur où la carte coupe les lignes du titre : le champ ne la dépasse jamais, sinon il garderait sur une ligne ce que le sujet coupe. */
  limite?: number
}

/** Où poser le champ d'un titre : sur le texte d'un sujet, au milieu d'une relation, en tête d'une limite ou d'une zone. */
export function positionDuChamp(id: Id, l: Lecture, d: Disposition, mesures: ReadonlyMap<Id, Mesure>, a: Arbre): ChampPose | null {
  const b = d.boites.get(id)
  const m = mesures.get(id)
  if (b && m) {
    const theme = themeDeArbre(a)
    const h = habitDe(l, id, theme, !!a.options?.compacte)
    const sujet = l.sujets.get(id)
    const couleurs = couleursDe(h, rangDe(l, id), theme, sujet?.classe, couleurDe(l, id, theme, !!a.options?.uneCouleur, { ligne: a.couleurLigne, flottants: !!a.options?.flottantsColores }))
    const decoration = [sujet?.classe === 'barre' || h.barre ? 'line-through' : '', h.souligne ? 'underline' : ''].filter(Boolean).join(' ')
    return {
      genre: 'sujet',
      x: b.x + m.texte.x - DEBORD_CHAMP,
      y: b.y + m.texte.y - h.police * RATTRAPAGE_BASE,
      l: m.texte.l + 2 * DEBORD_CHAMP,
      h: m.texte.h,
      police: h.police,
      graisse: h.graisse,
      famille: h.famille,
      interligne: h.police * INTERLIGNE,
      italique: h.italique,
      alignement: h.alignement,
      ...(h.casse ? { casse: h.casse } : {}),
      ...(decoration ? { decoration } : {}),
      couleur: couleurs.encre,
      ...(h.largeur ? {} : { limite: h.largeurMax }),
    }
  }
  const objet = (x: number, y: number, largeur: number, hauteur: number, police: number, graisse: number): ChampPose => ({
    genre: 'objet',
    x,
    y,
    l: largeur,
    h: hauteur,
    police,
    graisse,
    interligne: police * INTERLIGNE,
    italique: false,
    alignement: 'centre',
  })
  const r = a.relations?.[id]
  if (r) {
    const [ba, bb] = [d.boites.get(r.de), d.boites.get(r.vers)]
    if (!ba || !bb) return null
    const c = courbeRelation(ba, bb, r.controles, r.forme)
    return objet(c.milieu.x - 80, c.milieu.y - 22, 160, 22, 12, 400)
  }
  const z = a.zones?.[id]
  if (z) return { ...objet(z.x + 8, z.y + 3, 220, 24, 13, 600), alignement: 'gauche' }
  const x = a.limites?.[id]
  if (x) {
    const boites = sujetsDePlage(l, x).flatMap((s) => d.boites.get(s) ?? [])
    if (boites.length === 0) return null
    return { ...objet(Math.min(...boites.map((v) => v.x)) - 2, Math.min(...boites.map((v) => v.y)) - 36, 160, 22, 12, 600), alignement: 'gauche' }
  }
  return null
}

/** La carte avec ce texte à la place du titre de ce sujet : ce que la carte mesure et dispose pendant qu'on écrit. */
export function titreRemplace(a: Arbre, id: Id | undefined, texte: string | undefined): Arbre {
  const s = id !== undefined ? a.sujets[id] : undefined
  if (!s || texte === undefined || s.titre === texte) return a
  return { ...a, sujets: { ...a.sujets, [id!]: { ...s, titre: texte } } }
}

/** Les titres qu'un sujet reçoit à sa naissance (`titres.ts`), dans les deux langues, avec `{n}` pour le numéro. */
const CLES_TITRES_NEUFS = ['arbre.central', 'arbre.principal', 'arbre.sous', 'arbre.flottant', 'arbre.parent', 'arbre.resume']

const echapper = (texte: string) => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Ce titre est celui qu'un sujet reçoit en naissant, que personne n'a écrit (« Sujet principal 3 »). Notak ne garde pas
 * de drapeau « jamais édité » : le titre par défaut en tient lieu.
 */
export function estTitreParDefaut(titre: string): boolean {
  const t = titre.trim()
  for (const textes of [fr, en]) {
    for (const cle of CLES_TITRES_NEUFS) {
      const modele = textes[cle]
      if (modele && new RegExp(`^${echapper(modele).replace('\\{n\\}', '\\d+')}$`).test(t)) return true
    }
  }
  return false
}

export interface DebutEdition {
  id: Id
  texte: string
  /** Tout le texte est sélectionné à l'ouverture (taper le remplace) ; sinon le curseur est à la fin. */
  tout: boolean
}

/**
 * Ce que le champ montre à l'ouverture. Une frappe remplace le titre (le curseur suit le caractère tapé). Sans frappe, un
 * sujet jamais titré s'ouvre avec tout sélectionné, un sujet titré avec le curseur à la fin ; le titre d'une relation, d'une
 * zone ou d'une limite (`objet`) s'ouvre sélectionné.
 */
export function debutEdition(id: Id, titre: string, o: { frappe?: string; objet?: boolean } = {}): DebutEdition {
  if (o.frappe !== undefined) return { id, texte: o.frappe, tout: false }
  return { id, texte: titre, tout: !!o.objet || estTitreParDefaut(titre) }
}
