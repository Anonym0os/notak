import type { Services } from '@notak/tableau'
import { estErreurCoque, estPageServeur, ouvrirAilleurs } from '../bureau'
import { t } from '../langue'
import { annoncerBureau } from './annonces'

/** Ce qu'on dit quand la coque n'a pas pu ouvrir un fichier : trop d'ouvertures d'un coup (`trop_vite`), ou le reste. */
export const messageOuverture = (e: unknown): string => (estErreurCoque(e) && e.code === 'trop_vite' ? t('serveur.ouvrir.tropVite') : t('serveur.ouvrir.impossible'))

/**
 * `Services.ouvrirAilleurs` de l'app de bureau : un fichier de la toile (PDF, document, image…) s'ouvre dans l'application
 * que le système lui associe, ou se propose à l'enregistrement. Un refus de la coque se dit, au lieu de se taire.
 */
export const ouvrirAilleursDeBureau =
  (annoncer: (texte: string) => void = annoncerBureau) =>
  (adresse: string, nom?: string): void => {
    ouvrirAilleurs(adresse, nom).catch((e: unknown) => annoncer(messageOuverture(e)))
  }

/**
 * Ce que la fenêtre donne à la toile pour ouvrir quelque chose ailleurs. Dans un navigateur : un nouvel onglet pour une
 * toile. Dans l'app de bureau, qui n'a qu'une fenêtre et n'en ouvre pas d'autre (`apps/bureau/src-tauri/src/navigation.rs`) :
 * pas d'onglet (« Ouvrir dans un onglet » disparaît du menu), mais un fichier qui s'ouvre dans l'application du système.
 */
export const servicesDeLaFenetre = (enApp: boolean = estPageServeur()): Pick<Services, 'ouvrirAilleurs' | 'ouvrirDansOnglet'> =>
  enApp ? { ouvrirAilleurs: ouvrirAilleursDeBureau() } : { ouvrirDansOnglet: (id: string) => void window.open(`/t/${encodeURIComponent(id)}`, '_blank') }
