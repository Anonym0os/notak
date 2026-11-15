import type { Services } from '@notak/tableau'
import { estPageServeur, estPageServeurMobile } from '../bureau'
import { ouvrirParLePartage, ouvrirSurLOrdinateur } from '../bureau/ailleurs'
import { annoncerBureau } from './annonces'

/**
 * Ce que la fenêtre donne à la toile pour ouvrir quelque chose ailleurs. Dans un navigateur : un nouvel onglet pour une
 * toile. Dans l'app de bureau, qui n'a qu'une fenêtre et n'en ouvre pas d'autre (`apps/bureau/src-tauri/src/navigation.rs`) :
 * pas d'onglet (« Ouvrir dans un onglet » disparaît du menu), mais un fichier de la toile (PDF, document, image…) qui
 * s'ouvre dans l'application que le système lui associe, que son bouton nomme (« Ouvrir dans Aperçu »), ou se propose
 * à l'enregistrement. Un refus de la coque se dit par le bandeau du bas (`annoncerBureau`), avec les mots de l'édition
 * locale (`bureau/ailleurs.ts`). Dans l'app d'un iPhone ou d'un iPad, un fichier passe par la feuille de partage
 * (« Ouvrir dans… »).
 */
export const servicesDeLaFenetre = (
  enApp: boolean = estPageServeur(),
  signaler: (texte: string) => void = annoncerBureau,
  surAppareil: boolean = estPageServeurMobile(),
): Pick<Services, 'ouvrirAilleurs' | 'applicationPour' | 'ouvrirDansOnglet'> =>
  enApp
    ? ouvrirSurLOrdinateur(signaler)
    : { ouvrirDansOnglet: (id: string) => void window.open(`/t/${encodeURIComponent(id)}`, '_blank'), ...(surAppareil ? ouvrirParLePartage() : {}) }
