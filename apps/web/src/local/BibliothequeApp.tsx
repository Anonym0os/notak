import { FeuilleBas, type FenetresNotak, HoteNotak, type Id } from '@notak/tableau'
import { type ReactNode, useMemo, useState } from 'react'
import { PageBibliotheque, allerAEntree } from '../Bibliotheque'
import { useAuTelephone } from '../bibliotheque/AuDoigt'
import { peutJoindreUnServeur } from '../bureau'
import { CompteEtServeur, RondCompte } from '../bureau/CompteEtServeur'
import type { BilanImport } from '../importation'
import { t } from '../langue'
import { sourceLocale } from './bibliotheque'
import { BibliothequeLocale } from './BibliothequeLocale'
import type { EspaceLocal } from './espace'

/**
 * L'écran où l'app s'ouvre, partout : la bibliothèque des toiles de l'appareil. Au téléphone, celle qu'on parcourt au
 * doigt (`BibliothequeLocale`) ; sur un iPad ou un ordinateur, celle qui range (`PageBibliotheque`, la même qu'un
 * serveur), avec en haut à droite la pastille « Où sont mes toiles ? » et, dans l'app, le rond du compte. Elle prend le
 * thème, les réglages et l'aide de Notak sans toile montée (`HoteNotak`), comme celle d'un serveur.
 */
export function BibliothequeApp(proprietes: {
  el: EspaceLocal
  importer(fichiers: File[], dans: Id): Promise<BilanImport>
  /** La pastille du stockage (`Rangement`). */
  rangement: ReactNode
}) {
  return <HoteNotak className="biblio-hote">{(fenetres) => <Contenu {...proprietes} fenetres={fenetres} />}</HoteNotak>
}

function Contenu({ el, importer, rangement, fenetres }: Parameters<typeof BibliothequeApp>[0] & { fenetres: FenetresNotak }) {
  const telephone = useAuTelephone()
  const source = useMemo(() => sourceLocale(el, { importer }), [el, importer])
  const [compte, setCompte] = useState(false)
  if (telephone) return <BibliothequeLocale el={el} ouvrir={(tableau, element = null) => allerAEntree({ tableau, element })} reglages={fenetres.reglages} />
  return (
    <>
      <PageBibliotheque
        {...source}
        espace={el.espace}
        partages={false}
        fenetres={fenetres}
        compte={
          <>
            {rangement}
            {peutJoindreUnServeur() && (
              <button type="button" className="notak-ilot-bouton biblio-app-compte" aria-label={t('compteServeur.titre')} aria-haspopup="dialog" onClick={() => setCompte(true)}>
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
    </>
  )
}
