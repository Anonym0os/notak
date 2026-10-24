import { useSyncExternalStore } from 'react'
import { nouvelId } from '../../../coeur/tableau'
import type { StyleCarte } from '../modele/reglages'

/**
 * Ce que l'onglet Carte retient de chacun, hors de la carte : les variantes en favori, les thèmes de couleur et les
 * thèmes personnalisés qu'on s'est faits, les couleurs et les polices récentes. Dans le navigateur (`localStorage`),
 * comme Xmind les garde dans ses préférences : ils suivent la personne, pas la carte. Une carte garde de son côté ce
 * qu'elle utilise (`themePerso`, le style appliqué), pour voyager seule.
 */

/** Un thème de couleur à soi : six couleurs et un nom. */
export interface ThemeCouleurPerso {
  id: string
  nom: string
  palette: string[]
}

/** Un thème personnalisé : le style d'une carte, mis de côté. */
export interface ThemePersonnalise {
  id: string
  nom: string
  style: StyleCarte
}

export interface Preferences {
  /** Les variantes en favori : `<thème>|<accent>` (l'accent est vide pour la variante à branches de couleur). */
  favoris: string[]
  couleursPerso: ThemeCouleurPerso[]
  themesPerso: ThemePersonnalise[]
  couleursRecentes: string[]
  policesRecentes: string[]
  policesCjkRecentes: string[]
  /** L'onglet de la liste des thèmes de couleur, tel qu'on l'a quitté. */
  ongletThemes?: 'favoris' | 'perso' | 'colore' | 'classique'
}

const CLE = 'notak.arbre.carte'
const VIDE: Preferences = { favoris: [], couleursPerso: [], themesPerso: [], couleursRecentes: [], policesRecentes: [], policesCjkRecentes: [] }

let courantes: Preferences = lire()
const abonnes = new Set<() => void>()

const liste = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

function lire(): Preferences {
  try {
    const brut = typeof localStorage === 'undefined' ? null : localStorage.getItem(CLE)
    if (!brut) return VIDE
    const v = JSON.parse(brut) as Partial<Preferences>
    return {
      favoris: liste(v.favoris),
      couleursPerso: Array.isArray(v.couleursPerso) ? v.couleursPerso.filter((x) => x && typeof x.id === 'string' && typeof x.nom === 'string' && Array.isArray(x.palette)) : [],
      themesPerso: Array.isArray(v.themesPerso) ? v.themesPerso.filter((x) => x && typeof x.id === 'string' && typeof x.nom === 'string' && typeof x.style === 'object') : [],
      couleursRecentes: liste(v.couleursRecentes),
      policesRecentes: liste(v.policesRecentes),
      policesCjkRecentes: liste(v.policesCjkRecentes),
      ...(v.ongletThemes ? { ongletThemes: v.ongletThemes } : {}),
    }
  } catch {
    return VIDE
  }
}

export const preferences = (): Preferences => courantes

/** Change les préférences et prévient ceux qui les suivent ; le navigateur qui refuse d'écrire ne les perd pas pour la session. */
export function modifierPreferences(f: (p: Preferences) => Preferences) {
  courantes = f(courantes)
  try {
    localStorage.setItem(CLE, JSON.stringify(courantes))
  } catch {
    // Un stockage fermé (navigation privée) : les préférences vivent le temps de la page.
  }
  abonnes.forEach((a) => a())
}

/** Pour les tests : repart de ce que le stockage contient. */
export function relirePreferences() {
  courantes = lire()
  abonnes.forEach((a) => a())
}

const suivre = (a: () => void) => {
  abonnes.add(a)
  return () => abonnes.delete(a)
}

export const usePreferences = (): Preferences => useSyncExternalStore(suivre, preferences, () => VIDE)

/** La clé d'un favori. */
export const cleFavori = (theme: string, accent?: string) => `${theme}|${accent ?? ''}`

export function basculerFavori(theme: string, accent?: string) {
  const cle = cleFavori(theme, accent)
  modifierPreferences((p) => ({ ...p, favoris: p.favoris.includes(cle) ? p.favoris.filter((x) => x !== cle) : [...p.favoris, cle] }))
}

/** Le nom d'un thème neuf : « Personnalisé », puis « Personnalisé 2 »… le numéro suivant le plus grand déjà pris. */
export function nomSuivant(base: string, existants: readonly string[]): string {
  let plus = 0
  for (const nom of existants) {
    if (nom === base) plus = Math.max(plus, 1)
    const m = nom.startsWith(`${base} `) ? Number(nom.slice(base.length + 1)) : NaN
    if (Number.isInteger(m)) plus = Math.max(plus, m)
  }
  return plus === 0 ? base : `${base} ${plus + 1}`
}

export const idCouleurPerso = () => `perso:${nouvelId()}`

/** La dernière variante qu'on a prise dans chaque groupe de thèmes, pour y revenir (le temps de la session). */
export const dernieresVariantes = new Map<string, string | undefined>()
