import { type Ajuste, type Mesure, PLANCHER, type Palier, type Police, ajuster, hauteurDe, interligne, plusGrandeTaille, tailleSansCoupe, tronquer } from '../modele/dimensions'

/**
 * Le choix des tailles de texte des gabarits (relevé 11 § 0.3 et chapitres) : une fourchette, des plafonds de lignes,
 * un texte plus petit plutôt que coupé (`PLANCHER`), la troncature « ... » en dernier recours, la dernière ligne courte.
 * `ajuster` (le modèle) cherche la taille d'un texte seul ; une liste cherche une taille commune à tous ses éléments.
 */

/** Le texte d'un ajustement, tel qu'il s'affiche (coupé et suivi de « ... » s'il a fallu). */
export const texteDe = (a: Ajuste): string => a.lignes.map((l) => l.texte).join(' ')

/** La largeur de la plus longue ligne. */
export const largeurDe = (a: Ajuste): number => Math.max(0, ...a.lignes.map((l) => l.largeur))

/**
 * Un titre dans sa fourchette : d'abord en `lignesPreferees` lignes, puis en `lignesMax`, enfin à la taille mini tronqué
 * à `lignesMax`. `hauteur` borne en plus la hauteur du texte ; sans plafond de lignes, c'est elle qui décide.
 */
export function ajusterPolice(texte: string, p: Police, largeur: number, police: string, mesurer: Mesure, o: { hauteur?: number; derniereLigne?: boolean } = {}): Ajuste {
  const borne = o.hauteur !== undefined ? { hauteur: o.hauteur } : {}
  const paliers: Palier[] = []
  if (p.lignesPreferees !== undefined) paliers.push({ max: p.max, min: p.min, lignes: p.lignesPreferees, ...borne })
  if (p.lignesMax !== undefined && p.lignesMax !== p.lignesPreferees) paliers.push({ max: p.max, min: p.min, lignes: p.lignesMax, ...borne })
  if (paliers.length === 0) paliers.push({ max: p.max, min: p.min, ...borne })
  return ajuster({
    texte,
    police,
    largeur,
    paliers,
    repli: { taille: p.min, ...(p.lignesMax !== undefined ? { lignesMax: p.lignesMax } : {}) },
    ...(o.derniereLigne !== undefined ? { derniereLigne: o.derniereLigne } : {}),
    mesurer,
  })
}

/**
 * Un texte à une taille fixe ; s'il dépasse `lignesMax`, plus petit (jusqu'au plancher), et coupé seulement si le plancher
 * n'y suffit pas.
 */
export function aTaille(texte: string, taille: number, largeur: number, police: string, mesurer: Mesure, lignesMax?: number): Ajuste {
  if (lignesMax === undefined) return figee(texte, taille, largeur, police, mesurer)
  const sans = tailleSansCoupe(texte, taille, police, largeur, lignesMax, mesurer)
  return figee(texte, sans ?? taille * PLANCHER, largeur, police, mesurer, lignesMax)
}

/** Un texte à cette taille exactement, tronqué à `lignesMax` s'il est donné. */
function figee(texte: string, taille: number, largeur: number, police: string, mesurer: Mesure, lignesMax?: number): Ajuste {
  const t = lignesMax !== undefined ? tronquer(texte, taille, police, largeur, lignesMax, mesurer) : { lignes: mesurer(texte, taille, police, largeur), tronque: false }
  return { taille, interligne: interligne(taille), lignes: t.lignes, hauteur: hauteurDe(t.lignes.length, taille), tronque: t.tronque }
}

export interface TailleCommune {
  taille: number
  ajustes: Ajuste[]
  /** Même à la taille mini, la liste dépasse sa hauteur : elle défile. */
  defile: boolean
}

/**
 * La taille commune d'une liste : la plus grande où tous les éléments tiennent en `lignesPreferees` lignes (la taille mini
 * sinon, ou plus bas jusqu'au plancher si un élément y dépasse `lignesMax`), chacun tronqué à `lignesMax` en dernier recours ; puis, si la liste dépasse `dispo` (sa hauteur selon `hauteur`), la plus grande
 * plus petite qui tienne ; si rien ne tient, la taille mini, et la liste défile.
 */
export function tailleCommune(textes: readonly string[], p: Police, largeur: number, police: string, mesurer: Mesure, hauteur?: (ajustes: readonly Ajuste[]) => number, dispo?: number): TailleCommune {
  const preferees = p.lignesPreferees ?? p.lignesMax
  // À la taille commune, sans réduire un élément seul : `min` est déjà assez bas pour qu'aucun ne soit coupé, sauf au plancher.
  const a = (t: number) => textes.map((x) => figee(x, t, largeur, police, mesurer, p.lignesMax))
  // La taille mini de la liste : plus bas que celle de la police (jusqu'au plancher) si un élément y dépasse `lignesMax`.
  const lignesMax = p.lignesMax
  const min =
    lignesMax === undefined ? p.min : Math.min(p.min, ...textes.map((x) => tailleSansCoupe(x, p.min, police, largeur, lignesMax, mesurer) ?? p.min * PLANCHER))
  const t1 = preferees === undefined ? p.max : (plusGrandeTaille(p.min, p.max, (t) => textes.every((x) => mesurer(x, t, police, largeur).length <= preferees)) ?? min)
  let ajustes = a(t1)
  if (!hauteur || dispo === undefined || hauteur(ajustes) <= dispo) return { taille: t1, ajustes, defile: false }
  const t2 = plusGrandeTaille(min, t1, (t) => hauteur(a(t)) <= dispo)
  if (t2 !== null) return { taille: t2, ajustes: a(t2), defile: false }
  ajustes = a(min)
  return { taille: min, ajustes, defile: true }
}

/** La hauteur d'une pile de blocs séparés d'un écart. */
export const hauteurPile = (hauteurs: readonly number[], ecart: number): number => (hauteurs.length ? hauteurs.reduce((s, h) => s + h, 0) + (hauteurs.length - 1) * ecart : 0)
