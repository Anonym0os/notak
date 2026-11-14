import type { Raccourci } from '../types'
import { annoter, etatAnnotation, terminerAnnotation } from './modeAnnotation'

/** Maj+D : dessiner sur l'image choisie (seule choisie), ou en sortir comme on enregistre. */
export const raccourciAnnoter: Raccourci = (e, contexte) => {
  if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== 'd') return false
  const { id } = etatAnnotation()
  if (id !== null) {
    terminerAnnotation()
    return true
  }
  if (contexte.selection.size !== 1) return false
  const [choisi] = contexte.selection
  const element = contexte.magasin.lire().elements.find((x) => x.id === choisi)
  if (!element || element.contenu.type !== 'image' || element.verrou) return false
  annoter(element.id)
  return true
}
