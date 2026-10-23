import type { Element, Fichier, Operation } from '../../coeur/tableau'
import { nouvelId } from '../../coeur/tableau'
import { TAILLE_MAX, TYPES_ACCEPTES } from '../image/geometrie'
import { commencerEnvoi } from '../envois'
import type { ContexteToile } from '../types'

export const LARGEUR_FICHIER = 34
/** La hauteur d'une carte de fichier sans lecteur, en UG, pour en poser plusieurs l'une sous l'autre. */
const PAS_VERTICAL = 10

/** Les fichiers déposés ou collés qui ne sont pas des images : chacun devient un fichier joint. */
export function recevoirFichiers(donnees: DataTransfer, ou: { x: number; y: number }, contexte: ContexteToile) {
  const tous = [...donnees.files]
  const fichiers = tous.filter((f) => !TYPES_ACCEPTES.includes(f.type) && f.size > 0 && f.size <= TAILLE_MAX)
  const depot = contexte.services.fichiers
  if (!depot || fichiers.length === 0) return null
  // Les images du même dépôt se posent à `ou` : les fichiers se rangent à leur droite.
  const decalage = tous.some((f) => TYPES_ACCEPTES.includes(f.type)) ? LARGEUR_FICHIER + 2 : 0
  // L'élément naît tout de suite ; le fichier part ensuite (voir `envois.ts`).
  const elements: Element<Fichier>[] = fichiers.map((f, i) => ({
    id: nouvelId(),
    x: Math.round(ou.x) + decalage,
    y: Math.round(ou.y) + i * PAS_VERTICAL,
    largeur: LARGEUR_FICHIER,
    contenu: {
      type: 'fichier',
      fichier: commencerEnvoi(f, depot),
      nom: f.name || 'Fichier',
      typeMime: f.type || 'application/octet-stream',
      taille: f.size,
    },
  }))
  return elements.map((element): Operation => ({ type: 'creer', element }))
}

/** Ouvre le sélecteur de fichiers du système, puis passe ce qu'on a choisi à la toile, comme un dépôt à `ou`. */
export function choisirFichiers(ou: { x: number; y: number }, contexte: ContexteToile, accepte?: string) {
  const champ = document.createElement('input')
  champ.type = 'file'
  champ.multiple = true
  if (accepte) champ.accept = accepte
  champ.addEventListener('change', () => {
    if (!champ.files || champ.files.length === 0) return
    const d = new DataTransfer()
    for (const f of champ.files) d.items.add(f)
    contexte.recevoir(d, ou)
  })
  champ.click()
}
