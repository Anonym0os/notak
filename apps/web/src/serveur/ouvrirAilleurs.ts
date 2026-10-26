import type { Services } from '@notak/tableau'
import { estPageServeur } from '../bureau'
import { ouvrirAilleursAvecAvis } from '../bureau/ailleurs'
import { annoncerBureau } from './annonces'

/**
 * Ce que la fenêtre donne à la toile pour ouvrir quelque chose ailleurs. Dans un navigateur : un nouvel onglet pour une
 * toile. Dans l'app de bureau, qui n'a qu'une fenêtre et n'en ouvre pas d'autre (`apps/bureau/src-tauri/src/navigation.rs`) :
 * pas d'onglet (« Ouvrir dans un onglet » disparaît du menu), mais un fichier de la toile (PDF, document, image…) qui
 * s'ouvre dans l'application que le système lui associe, ou se propose à l'enregistrement. Un refus de la coque se dit
 * par le bandeau du bas (`annoncerBureau`), avec les mots de l'édition locale (`bureau/ailleurs.ts`).
 */
export const servicesDeLaFenetre = (enApp: boolean = estPageServeur(), signaler: (texte: string) => void = annoncerBureau): Pick<Services, 'ouvrirAilleurs' | 'ouvrirDansOnglet'> =>
  enApp
    ? { ouvrirAilleurs: (adresse: string, nom?: string) => ouvrirAilleursAvecAvis(adresse, nom, signaler) }
    : { ouvrirDansOnglet: (id: string) => void window.open(`/t/${encodeURIComponent(id)}`, '_blank') }
