import type { Element, Fichier, Operation } from '../../coeur/tableau'
import { nouvelId } from '../../coeur/tableau'
import { TYPES_ACCEPTES, nombreColonnes, placerImages } from '../image/geometrie'
import { commencerEnvoi } from '../envois'
import type { ContexteToile } from '../types'
import { t } from '../../langue'
import { LARGEUR_CARTE, LARGEUR_ICONE } from './Fichier'
import { naitEnIcone } from './genre'
import { refusDe } from './refus'
import { annoncer } from '../../avis'

export const LARGEUR_FICHIER = LARGEUR_CARTE
/** Les hauteurs, en UG, d'une feuille avec son nom et d'une carte sans aperçu : de quoi ranger plusieurs fichiers en colonnes. */
const HAUTEUR_ICONE = 12
const HAUTEUR_CARTE = 9

/** Ce que dit l'avis quand un fichier ne part pas. */
export function messageDeRefus(nom: string, refus: NonNullable<ReturnType<typeof refusDe>>): string {
  switch (refus.motif) {
    case 'taille':
      return t('envois.tropGros', { nom, max: '25' })
    case 'extension':
      return t('envois.extensionRefusee', { ext: refus.extension ?? '' })
    case 'point':
      return t('envois.fichierPoint')
    case 'nom':
      return t('envois.nomRefuse', { nom })
    default:
      return t('envois.fichierVide', { nom })
  }
}

/** Les fichiers déposés ou collés qui ne sont pas des images : chacun devient un fichier joint. */
export function recevoirFichiers(donnees: DataTransfer, ou: { x: number; y: number }, contexte: ContexteToile) {
  const tous = [...donnees.files]
  const depot = contexte.services.fichiers
  const autres = tous.filter((f) => !TYPES_ACCEPTES.includes(f.type))
  if (!depot || autres.length === 0) return null
  // Un fichier refusé le dit (taille, extension, nom) : un filtre muet laisse croire que le dépôt n'a pas pris.
  const fichiers: File[] = []
  for (const f of autres) {
    const refus = refusDe(f.name, f.size)
    if (refus) annoncer({ texte: messageDeRefus(f.name || t('type.fichier'), refus) })
    else fichiers.push(f)
  }
  if (fichiers.length === 0) return null
  // Les images du même dépôt se posent à `ou` : les fichiers se rangent à leur droite.
  const decalage = tous.some((f) => TYPES_ACCEPTES.includes(f.type)) ? LARGEUR_FICHIER + 2 : 0
  // Comme les images : seul, au point de dépôt ; plusieurs, en colonnes de 36 UG. Une icône mesure 10 UG de large, une carte 34.
  const icones = fichiers.map((f) => naitEnIcone(f.name, f.type))
  const places = placerImages(
    fichiers.map((_, i) => ({ largeur: icones[i] ? LARGEUR_ICONE : LARGEUR_CARTE, hauteur: icones[i] ? HAUTEUR_ICONE : HAUTEUR_CARTE })),
    { x: ou.x + decalage, y: ou.y },
    nombreColonnes(contexte.largeurVue()),
  )
  // L'élément naît tout de suite ; le fichier part ensuite (voir `envois.ts`).
  const elements: Element<Fichier>[] = fichiers.map((f, i) => ({
    id: nouvelId(),
    x: places[i]![0],
    y: places[i]![1],
    largeur: icones[i] ? LARGEUR_ICONE : LARGEUR_CARTE,
    contenu: {
      type: 'fichier',
      fichier: commencerEnvoi(f, depot),
      nom: f.name || t('type.fichier'),
      typeMime: f.type || 'application/octet-stream',
      taille: f.size,
      ...(icones[i] ? { icone: true as const } : {}),
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
