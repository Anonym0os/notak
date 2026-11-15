import { type ApplicationOuverture, type Services, telechargerFichier } from '@notak/tableau'
import { applicationParDefaut, estErreurCoque, ouvrirAilleurs } from '../bureau'
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

/** Une seule fonction par façon d'ouvrir : la toile garde ses réponses par fonction (`ouvrirAvec.ts`). */
const demanderAuSysteme = (nom: string): Promise<ApplicationOuverture> => applicationParDefaut(nom)
const parLaFeuilleDePartage = async (): Promise<ApplicationOuverture> => ({ sorte: 'partage' })

/**
 * Dans l'app d'un ordinateur : un fichier s'ouvre dans l'application du système, que le bouton nomme (« Ouvrir dans
 * Aperçu », la coque la dit) ; un échec se dit par `signaler`.
 */
export const ouvrirSurLOrdinateur = (signaler: (texte: string) => void): Pick<Services, 'ouvrirAilleurs' | 'applicationPour'> => ({
  ouvrirAilleurs: (adresse: string, nom?: string) => ouvrirAilleursAvecAvis(adresse, nom, signaler),
  applicationPour: demanderAuSysteme,
})

/**
 * Dans l'app d'un iPhone ou d'un iPad, sans application « par défaut » ni nouvel onglet (la webview ignore
 * `window.open`) : « Ouvrir dans… », la feuille de partage, où l'on choisit l'app. Le même chemin que « Télécharger »
 * (`telechargements.ts`), qui y mène aussi ; un échec s'annonce de même.
 */
export const ouvrirParLePartage = (): Pick<Services, 'ouvrirAilleurs' | 'applicationPour'> => ({
  ouvrirAilleurs: (adresse: string, nom?: string) => void telechargerFichier(adresse, nom ?? ''),
  applicationPour: parLaFeuilleDePartage,
})
