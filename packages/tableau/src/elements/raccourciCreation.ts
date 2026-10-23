import { point } from '../coeur/geometrie'
import { definition } from './registre'
import type { ContexteToile, Outil } from './types'

const surMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

/** Les touches qui créent un élément au clavier, pour l'infobulle de l'outil : ⌃⌘ + lettre sur Mac, Ctrl+Alt+ ailleurs. */
export const touchesCreation = (lettre: string) => (surMac() ? `⌃⌘${lettre}` : `Ctrl+Alt+${lettre}`)

/** Cet évènement est-il le raccourci de création de la lettre `lettre` ? */
export function estCreation(e: KeyboardEvent, lettre: string): boolean {
  if (e.code !== `Key${lettre}` || e.shiftKey) return false
  return surMac() ? e.ctrlKey && e.metaKey && !e.altKey : e.ctrlKey && e.altKey && !e.metaKey
}

/**
 * Crée ce que fait l'outil, au centre de la vue (`moitie` : la demi-taille de l'élément, en UG), le choisit, et ouvre
 * son édition si le type en a une.
 */
export function creerAuCentre(outil: Outil, contexte: ContexteToile, moitie: { x: number; y: number }): boolean {
  if (contexte.services.lectureSeule) return false
  const centre = contexte.centreVue()
  const operations = outil.creer(point(Math.round(centre.x - moitie.x), Math.round(centre.y - moitie.y)), contexte)
  const neufs = operations.flatMap((o) => (o.type === 'creer' ? [o.element] : []))
  if (neufs.length === 0) return false
  contexte.magasin.faire(operations)
  contexte.choisir(neufs.map((e) => e.id))
  if (neufs.length === 1 && definition(neufs[0]!.contenu.type)?.editable) contexte.commencerEdition(neufs[0]!.id)
  return true
}
