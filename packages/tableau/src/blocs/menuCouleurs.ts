import { COULEURS, type Couleur, couleurDeAttribut, couleurEnAttribut } from './catalogue'

/**
 * Les couleurs récemment posées (docs/NOTION.md § 7.3) : cinq au plus, la plus récente en tête, sans doublon, gardées
 * dans le navigateur. Au départ : le fond jaune. La première est « la dernière couleur utilisée » de ⌘⇧H.
 */

export const MAX_RECENTES = 5
export const CLE_RECENTES = 'notak-couleurs-recentes'
export const COULEUR_DEPART: Couleur = { nom: 'jaune', fond: true }

type Stockage = Pick<Storage, 'getItem' | 'setItem'>

const cle = (c: Couleur) => couleurEnAttribut(c) ?? 'defaut'

/** La liste avec `c` en tête : un doublon remonte, la liste ne dépasse pas cinq ; la couleur par défaut n'y entre pas. */
export function avecRecente(liste: readonly Couleur[], c: Couleur): Couleur[] {
  if (c.nom === 'defaut') return [...liste]
  return [c, ...liste.filter((x) => cle(x) !== cle(c))].slice(0, MAX_RECENTES)
}

const navigateur = (): Stockage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** Les récentes gardées ; le fond jaune quand il n'y en a pas encore. */
export function lireRecentes(stockage: Pick<Storage, 'getItem'> | null = navigateur()): Couleur[] {
  try {
    const brut = JSON.parse(stockage?.getItem(CLE_RECENTES) ?? 'null') as unknown
    if (Array.isArray(brut)) {
      const liste = brut.map(couleurDeAttribut).filter((c): c is Couleur => !!c && COULEURS.includes(c.nom) && c.nom !== 'defaut')
      if (liste.length) return liste.slice(0, MAX_RECENTES)
    }
  } catch {
    /* illisible : on repart du départ */
  }
  return [COULEUR_DEPART]
}

/** Retient `c` et rend la liste d'après. */
export function retenirCouleur(c: Couleur, stockage: Stockage | null = navigateur()): Couleur[] {
  const liste = avecRecente(lireRecentes(stockage), c)
  try {
    stockage?.setItem(CLE_RECENTES, JSON.stringify(liste.map(cle)))
  } catch {
    /* navigation privée, stockage plein : la liste vit le temps de la page */
  }
  return liste
}

/** La dernière couleur utilisée (⌘⇧H). */
export const derniereCouleur = (stockage?: Pick<Storage, 'getItem'> | null): Couleur => lireRecentes(stockage)[0] ?? COULEUR_DEPART
