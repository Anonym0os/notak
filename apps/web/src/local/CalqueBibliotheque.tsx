import { FeuilleBas, type Id, demanderAide, demanderReglages } from '@notak/tableau'
import { type ReactNode, useMemo, useState, useSyncExternalStore } from 'react'
import { PageBibliotheque } from '../Bibliotheque'
import { peutJoindreUnServeur } from '../bureau'
import { CompteEtServeur, RondCompte } from '../bureau/CompteEtServeur'
import type { BilanImport } from '../importation'
import { t } from '../langue'
import { sourceLocale } from './bibliotheque'
import type { EspaceLocal } from './espace'

/**
 * La bibliothèque de l'app sur un iPad ou un ordinateur : celle d'un serveur (une colonne de rubriques, le tri, le
 * choix, le glisser, les dossiers, les menus), sur les toiles de cet appareil (`local/bibliotheque.ts`). Elle se pose
 * sur la toile ouverte, comme celle du téléphone ; en haut à droite, la pastille « Où sont mes toiles ? » et, dans
 * l'app, le rond du compte, d'où l'on rejoint un serveur Notak.
 */
export function CalqueBibliotheque({
  el,
  importer,
  rangement,
}: {
  el: EspaceLocal
  importer(fichiers: File[], dans: Id): Promise<BilanImport>
  /** La pastille du stockage (`Rangement`), celle de l'en-tête de la toile. */
  rangement: ReactNode
}) {
  const theme = useThemeDeLaToile()
  const source = useMemo(() => sourceLocale(el, { importer }), [el, importer])
  const [compte, setCompte] = useState(false)
  return (
    <div className="notak-espace biblio-calque" data-theme={theme}>
      <PageBibliotheque
        {...source}
        espace={el.espace}
        partages={false}
        fenetres={{ reglages: demanderReglages, aide: demanderAide }}
        compte={
          <>
            {rangement}
            {peutJoindreUnServeur() && (
              <button type="button" className="notak-ilot-bouton biblio-calque-compte" aria-label={t('compteServeur.titre')} aria-haspopup="dialog" onClick={() => setCompte(true)}>
                <RondCompte taille={24} />
              </button>
            )}
          </>
        }
      />
      {compte && (
        <FeuilleBas titre={t('compteServeur.titre')} fermer={() => setCompte(false)} className="compte-serveur-feuille">
          <CompteEtServeur />
        </FeuilleBas>
      )}
    </div>
  )
}

/** Le thème de la toile (`data-theme` de la page, posé par elle) : la bibliothèque prend le même. */
function useThemeDeLaToile(): string | undefined {
  return useSyncExternalStore(
    (f) => {
      const obs = new MutationObserver(f)
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
      return () => obs.disconnect()
    },
    () => document.documentElement.dataset.theme,
  )
}
