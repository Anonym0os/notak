import type { PanneauOuvert } from './modele'

/**
 * Le dernier état connu du panneau des tâches d'un dossier, gardé sur l'appareil : hors ligne, ou l'outil injoignable,
 * le panneau le montre et dit de quand il date. Une entrée par compte et par dossier (un autre compte sur le même
 * navigateur ne lit pas celles d'un autre). Rien de ce qui est gardé ici ne repart vers l'outil : un geste se refait en
 * ligne. Le stockage peut manquer (navigation privée, quota) : on fait alors sans.
 */

const PREFIXE = 'notak.taches.'
/** Au-delà, l'état est trop vieux pour dire quoi que ce soit d'utile : il est oublié. */
const DUREE_MAX_MS = 30 * 24 * 3600 * 1000

const cle = (compte: string, dossier: string) => `${PREFIXE}${compte}.${dossier}`

export interface Memoire {
  panneau: PanneauOuvert
  /** Quand l'outil l'a rendu (ms). */
  quand: number
}

export function lireMemoire(compte: string, dossier: string, maintenant = Date.now()): Memoire | null {
  try {
    const brut = localStorage.getItem(cle(compte, dossier))
    if (!brut) return null
    const lu = JSON.parse(brut) as Partial<Memoire> | null
    const ok = lu && typeof lu.quand === 'number' && lu.panneau?.disponible === true && Array.isArray(lu.panneau.taches)
    if (!ok || maintenant - lu.quand! > DUREE_MAX_MS) return null
    return { panneau: lu.panneau!, quand: lu.quand! }
  } catch {
    return null
  }
}

export function ecrireMemoire(compte: string, dossier: string, panneau: PanneauOuvert, quand = Date.now()): void {
  try {
    // Seulement ce que l'outil a rendu : un geste en attente n'est pas un état connu.
    const propre = { ...panneau, taches: panneau.taches.map(({ attend: _, ...t }: PanneauOuvert['taches'][number] & { attend?: unknown }) => t) }
    localStorage.setItem(cle(compte, dossier), JSON.stringify({ panneau: propre, quand }))
  } catch {
    // Plein, ou interdit : le panneau fera sans.
  }
}

export function oublierMemoire(compte: string, dossier: string): void {
  try {
    localStorage.removeItem(cle(compte, dossier))
  } catch {
    // Rien à oublier.
  }
}
