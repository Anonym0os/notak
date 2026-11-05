import { FeuilleBas, type FenetresNotak, HoteNotak, type Id } from '@notak/tableau'
import { type ReactNode, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { type Bienvenue, PageBibliotheque } from '../Bibliotheque'
import { peutJoindreUnServeur } from '../bureau'
import { CompteEtServeur, RondCompte } from '../bureau/CompteEtServeur'
import type { BilanImport } from '../importation'
import { t } from '../langue'
import { sourceLocale } from './bibliotheque'
import { type EspaceLocal, poserLeGuide, rechercherLocalement } from './espace'
import { ecouterSynchro, lireEtatSynchro } from './synchro'

/** La carte de bienvenue de l'app au téléphone, fermée une fois pour toutes. */
export const CLE_BIENVENUE = 'notak:local:bienvenue'

/** Au-delà, on n'attend plus iCloud pour montrer le premier écran (un dossier très lent, une synchro arrêtée). */
const ATTENTE_NUAGE_MAX = 20_000

/**
 * La première lecture d'iCloud n'est pas finie : un appareil neuf qui rejoint ses toiles doit les trouver là, plutôt
 * qu'on lui propose d'en créer (sa toile neuve, posée sur son accueil, ferait de lui un second accueil qu'il faudrait
 * ranger). Une fois lue, ou après un temps, ou si elle bute, le premier écran vient.
 */
function useAttenteNuage(): boolean {
  const etat = useSyncExternalStore(ecouterSynchro, lireEtatSynchro)
  const [passee, setPassee] = useState(false)
  useEffect(() => {
    const m = setTimeout(() => setPassee(true), ATTENTE_NUAGE_MAX)
    return () => clearTimeout(m)
  }, [])
  return !passee && etat.mode === 'active' && etat.nuage === true && etat.derniere === undefined && !etat.erreur
}

/**
 * L'écran où l'app s'ouvre, partout : la bibliothèque des toiles de l'appareil, la même qu'un serveur
 * (`PageBibliotheque`). Sur un iPad ou un ordinateur, en haut à droite, la pastille « Où sont mes toiles ? » et, dans
 * l'app, le rond du compte ; au téléphone, le rond seul, à côté de la roue et du « + », et la carte de bienvenue du
 * premier passage. Elle cherche aussi dans le contenu des toiles de l'appareil. Elle prend le thème, les réglages et
 * l'aide de Notak sans toile montée (`HoteNotak`), comme celle d'un serveur.
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
  const source = useMemo(() => sourceLocale(el, { importer }), [el, importer])
  const [compte, setCompte] = useState(false)
  const attente = useAttenteNuage()
  const decouvrir = () => poserLeGuide(el)
  const chercherContenu = useMemo(() => (requete: string) => rechercherLocalement(el, requete), [el])
  const avecCompte = peutJoindreUnServeur()
  const bienvenue: Bienvenue = {
    cle: CLE_BIENVENUE,
    titre: t('biblio.bienvenue.titre'),
    lignes: [
      { icone: 'maison', texte: t('biblio.bienvenue.accueil') },
      { icone: 'ajouter', texte: t('biblio.bienvenue.creer') },
      avecCompte ? { icone: 'compte', texte: t('biblio.bienvenue.compte') } : { icone: 'reglages', texte: t('biblio.bienvenue.reglages') },
    ],
  }
  return (
    <>
      <PageBibliotheque
        {...source}
        espace={el.espace}
        partages={false}
        fenetres={fenetres}
        decouvrir={decouvrir}
        attente={attente}
        bienvenue={bienvenue}
        chercherContenu={chercherContenu}
        {...(avecCompte
          ? {
              avatar: (
                <button type="button" className="biblio-locale-compte-bouton" aria-label={t('compteServeur.titre')} aria-haspopup="dialog" onClick={() => setCompte(true)}>
                  <RondCompte taille={34} />
                </button>
              ),
            }
          : {})}
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
