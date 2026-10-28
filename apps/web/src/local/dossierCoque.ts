import { type Dossier, type EntreeDossier, ErreurDossier } from '@notak/tableau'
import { invoquer, octetsDe } from '../bureau'

/**
 * Un `Dossier` sur le dossier Notak d'iCloud Drive, par la coque (`apps/bureau/src-tauri/src/nuage.rs`) : sur un Mac,
 * un iPhone ou un iPad, l'app y synchronise les toiles sans rien demander. La coque refuse tout chemin qui sortirait
 * de ce dossier ; ici, on ne fait que traduire ses réponses dans la langue du moteur.
 */

/** Ce que la coque répond à `nuage_ouvrir`. */
export type OuvertureNuage = { etat: 'pret'; nom: string } | { etat: 'eteint' } | { etat: 'absent' }

type CodeNuage = 'absent' | 'fantome' | 'lecture-seule' | 'plein' | 'indisponible' | 'illisible' | 'interdit'
const code = (e: unknown): CodeNuage | undefined =>
  typeof e === 'object' && e !== null && typeof (e as { code?: unknown }).code === 'string' ? ((e as { code: CodeNuage }).code) : undefined

function traduire(e: unknown): unknown {
  switch (code(e)) {
    case 'lecture-seule':
      return new ErreurDossier('le dossier refuse qu’on y écrive', 'lecture-seule')
    case 'plein':
      return new ErreurDossier('plus de place', 'plein')
    case 'indisponible':
    case 'absent':
      return new ErreurDossier('dossier introuvable', 'indisponible')
    default:
      return e
  }
}

export const ouvrirNuage = () => invoquer<OuvertureNuage>('nuage_ouvrir')

export function dossierCoque(): Dossier {
  return {
    lister: (chemin) => invoquer<EntreeDossier[]>('nuage_lister', { chemin }).catch((e: unknown) => Promise.reject(traduire(e))),

    async lire(chemin) {
      try {
        return octetsDe(await invoquer<unknown>('nuage_lire', { chemin }))
      } catch (e) {
        const c = code(e)
        if (c === 'absent' || c === 'fantome') return c
        throw traduire(e)
      }
    },

    ecrireAtomique: (chemin, octets) =>
      invoquer<void>('nuage_ecrire', octets, { headers: { 'x-notak-chemin': encodeURIComponent(chemin) } }).catch((e: unknown) =>
        Promise.reject(traduire(e)),
      ),

    supprimer: (chemin) => invoquer<void>('nuage_supprimer', { chemin }).catch((e: unknown) => Promise.reject(traduire(e))),

    telecharger: (chemin) => invoquer<void>('nuage_telecharger', { chemin }).catch(() => {}),
  }
}
