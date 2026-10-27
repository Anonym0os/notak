import { estErreurCoque, ouvrirAilleurs } from '../bureau'
import { t } from '../langue'

/**
 * `Services.ouvrirAilleurs` dans l'app de bureau : un fichier (une image, un PDF…) s'ouvre dans l'application que le
 * système lui associe, ou se propose à l'enregistrement. La coque refuse, par exemple, d'ouvrir trop de fichiers d'un
 * coup ; la personne l'apprend, au lieu d'un clic qui ne fait rien.
 */

export function texteOuvrirAilleurs(e: unknown): string {
  if (estErreurCoque(e)) {
    if (e.code === 'trop_vite') return t('bureau.ailleurs.tropVite')
    if (e.code === 'trop_gros') return t('bureau.ailleurs.tropGros')
  }
  return t('bureau.ailleurs.echec')
}

/** Ouvre `adresse` ailleurs ; un échec se dit par `signaler`. Rien à attendre : le service ne rend rien. */
export function ouvrirAilleursAvecAvis(adresse: string, nom: string | undefined, signaler: (texte: string) => void, ouvrir: typeof ouvrirAilleurs = ouvrirAilleurs): void {
  ouvrir(adresse, nom).catch((e: unknown) => signaler(texteOuvrirAilleurs(e)))
}
