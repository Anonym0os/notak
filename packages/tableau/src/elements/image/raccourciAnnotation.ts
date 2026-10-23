import type { Raccourci } from '../types'
import { annoter, etatAnnotation } from './modeAnnotation'

/** Maj+D : dessiner sur l'image choisie (seule choisie), ou en sortir. */
export const raccourciAnnoter: Raccourci = (e, contexte) => {
  if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== 'd') return false
  const { id } = etatAnnotation()
  if (id !== null) {
    annoter(null)
    return true
  }
  if (contexte.selection.size !== 1) return false
  const [choisi] = contexte.selection
  const element = contexte.magasin.lire().elements.find((x) => x.id === choisi)
  if (!element || element.contenu.type !== 'image' || element.verrou) return false
  annoter(element.id)
  return true
}
