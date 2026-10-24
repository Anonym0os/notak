import type { Arbre, Id, StyleSujet } from '../../../coeur/tableau'
import { changerLimite, changerRelation, changerResume } from './elements'
import type { Effet, Geste } from './gestes'
import { cibleDeMiseAJour } from './style'
import { type Lecture, changerSujet, enfantsDe } from './sujets'

/** Les gestes de l'onglet Style qui ne tiennent pas dans les gestes de la carte (docs/XMIND.md § 5 bis). */
export type GesteStyle =
  /** La largeur imposée de ces sujets, en px ; `undefined` : celle de leur texte (« Adapter »). */
  | { type: 'largeur'; ids: Id[]; largeur: number | undefined }
  /** Change le style de ces relations, limites ou résumés (une valeur `undefined` le retire) ; `null` : le réinitialiser. */
  | { type: 'styleObjet'; ids: Id[]; style: Record<string, unknown> | null }
  /** « Mettre à jour » : le style de ce sujet sur tous ceux de son niveau, ou sur tous ses sous-sujets. */
  | { type: 'mettreAJourStyle'; id: Id; portee: 'niveau' | 'sous-sujets' }
  /** « Appliquer aux sujets frères » : sa numérotation, sur ses frères. */
  | { type: 'numeroterFreres'; id: Id }

/** Fusionne un correctif dans un style : `undefined` retire la clé, un style vide disparaît. */
export function fusionner<T extends object>(style: T | undefined, correctif: Record<string, unknown>): T | undefined {
  const neuf: Record<string, unknown> = { ...style }
  for (const [k, v] of Object.entries(correctif)) {
    if (v === undefined) delete neuf[k]
    else neuf[k] = v
  }
  return Object.keys(neuf).length > 0 ? (neuf as T) : undefined
}

const avecStyle = <T extends { style?: S }, S extends object>(x: T, style: S | undefined): T => {
  const { style: _s, ...reste } = x
  return (style ? { ...reste, style } : reste) as T
}

export function appliquerGesteStyle(a: Arbre, g: Geste, l: Lecture): Effet | null {
  switch (g.type) {
    case 'largeur': {
      const largeur = g.largeur === undefined ? undefined : Math.max(1, Math.round(g.largeur))
      return { arbre: g.ids.reduce((x, id) => changerSujet(x, id, ({ largeur: _l, ...s }) => (largeur ? { ...s, largeur } : s)), a) }
    }
    case 'styleObjet': {
      let arbre = a
      for (const id of g.ids) {
        if (arbre.relations?.[id])
          // Réinitialiser une relation rend aussi la main à ses anciennes valeurs (`forme`, `pointes`).
          arbre = changerRelation(arbre, id, ({ style, forme, pointes, ...r }) => (g.style === null ? r : { ...r, ...(forme ? { forme } : {}), ...(pointes ? { pointes } : {}), ...(fusionner(style, g.style) ? { style: fusionner(style, g.style)! } : {}) }))
        else if (arbre.limites?.[id]) arbre = changerLimite(arbre, id, (x) => avecStyle(x, g.style === null ? undefined : fusionner(x.style, g.style)))
        else if (arbre.resumes?.[id]) arbre = changerResume(arbre, id, (x) => avecStyle(x, g.style === null ? undefined : fusionner(x.style, g.style)))
      }
      return { arbre }
    }
    case 'mettreAJourStyle': {
      const modele = l.sujets.get(g.id)
      if (!modele) return null
      const ids = cibleDeMiseAJour(l, g.id, g.portee)
      return { arbre: ids.reduce((x, id) => changerSujet(x, id, ({ style: _s, ...reste }) => (modele.style ? { ...reste, style: modele.style as StyleSujet } : reste)), a) }
    }
    case 'numeroterFreres': {
      const s = l.sujets.get(g.id)
      if (!s || s.parent === undefined) return null
      const freres = enfantsDe(l, s.parent).filter((x) => x !== g.id)
      return { arbre: freres.reduce((x, id) => changerSujet(x, id, ({ numerotation: _n, ...reste }) => (s.numerotation ? { ...reste, numerotation: { ...s.numerotation } } : reste)), a) }
    }
    default:
      return null
  }
}
