import type { PanneauTaches, TacheDeLOutil } from '../api'

/**
 * Le panneau des tâches d'un dossier de fiche (serveur : `tachesOutil.ts`), en fonctions pures : comment il range, comment
 * il nomme, comment une tâche rendue par l'outil y prend sa place. Sans React, sans horloge, sans réseau.
 */

/** Le panneau quand il paraît. */
export type PanneauOuvert = Extract<PanneauTaches, { disponible: true }>

/** Une tâche du panneau : celle de l'outil, et le geste qui l'attend encore (une coche, un ajout) s'il y en a un. */
export type LigneTache = TacheDeLOutil & { attend?: 'cocher' | 'ajouter' }

/** Le panneau tel que l'écran le tient : ce que l'outil a rendu, et les gestes qui attendent sa réponse. */
export type EtatPanneau = Omit<PanneauOuvert, 'taches'> & { taches: LigneTache[] }

/**
 * Comme la fiche de l'outil les range : les tâches datées d'abord (les retards en tête), puis celles sans date. Une
 * tâche en retard sans jour (une limite dépassée) reste avec les datées, en tête : c'est un retard. L'ordre que l'outil
 * a rendu est gardé dans chaque groupe.
 */
export function grouper<T extends TacheDeLOutil>(taches: readonly T[]): { datees: T[]; sansDate: T[] } {
  const datee = (x: T) => x.echeance !== null || x.enRetard
  return { datees: taches.filter(datee), sansDate: taches.filter((x) => !datee(x)) }
}

/** Les initiales d'un nom, deux au plus : « Samy Agher » → « SA », « Fram » → « F ». */
export function initiales(nom: string): string {
  const mots = nom.trim().split(/[\s-]+/u).filter(Boolean)
  const gardes = mots.length > 1 ? [mots[0]!, mots[mots.length - 1]!] : mots
  return gardes.map((m) => [...m][0]?.toLocaleUpperCase('fr') ?? '').join('') || '?'
}

/** Combien de tâches ouvertes sont en retard : ce que l'en-tête dit à côté du compte. */
export const enRetard = (taches: readonly TacheDeLOutil[]) => taches.filter((x) => x.enRetard && !x.fait).length

/**
 * Où une tâche neuve se range parmi les autres, comme l'outil la rangerait : une tâche datée parmi les datées, à son jour
 * (après les retards et celles du même jour) ; sans date, à la fin, comme le dernier ajout d'une liste faite à la main.
 */
export function placer<T extends TacheDeLOutil>(taches: readonly T[], neuve: T): T[] {
  const { datees, sansDate } = grouper(taches)
  if (neuve.echeance === null && !neuve.enRetard) return [...datees, ...sansDate, neuve]
  const apres = datees.findIndex((x) => !x.enRetard && x.echeance !== null && neuve.echeance !== null && x.echeance > neuve.echeance)
  const i = neuve.enRetard ? datees.filter((x) => x.enRetard).length : apres < 0 ? datees.length : apres
  return [...datees.slice(0, i), neuve, ...datees.slice(i), ...sansDate]
}

/**
 * Le panneau après qu'une tâche a changé : remplacée à sa place (cochée, remise, ou rendue par l'outil après un ajout,
 * sous l'identifiant `remplace` du geste), ou rangée là où l'outil la mettrait si elle est neuve.
 */
export function avecTache(p: EtatPanneau, tache: LigneTache, remplace: string = tache.id): EtatPanneau {
  const i = p.taches.findIndex((x) => x.id === remplace)
  if (i < 0) return { ...p, taches: placer(p.taches, tache), total: p.total + 1 }
  const taches = [...p.taches]
  taches[i] = tache
  return { ...p, taches }
}

/** Le panneau sans une tâche (un ajout que l'outil a refusé). */
export function sansTache(p: EtatPanneau, id: string): EtatPanneau {
  return p.taches.some((x) => x.id === id) ? { ...p, taches: p.taches.filter((x) => x.id !== id), total: Math.max(0, p.total - 1) } : p
}
