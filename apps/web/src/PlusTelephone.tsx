import { useCallback, useState, useSyncExternalStore } from 'react'
import { BoutonIlot, type DepotFichiers, type EntreeMenu, type EspaceNavigable, FeuilleBas, FeuilleMenu, type Id } from '@notak/tableau'
import type { EvenementActivite, Moi } from './api'
import { ListeActivite, useActivite } from './Activite'
import { exporterTableau } from './Export'
import { useFavori } from './Favori'
import { TYPES_IMPORT, useImport } from './Importer'
import { PartageEnFenetre } from './Partage'
import { ouvrirSignaler } from './signaler/Signaler'
import { t } from './langue'

/** Ce que la feuille ouvre : elle-même, puis ce qu'une de ses lignes appelle. */
type Ouverte = 'menu' | 'activite' | 'partage' | 'protection' | null

/**
 * « ••• », dans la barre d'un téléphone (édition serveur) : ce que le bureau met en boutons à droite de la barre
 * (partager, exporter, favori, activité, importer, mot de passe, signaler, réglages) monte en feuille du bas, rangé en
 * cartes comme les réglages d'iOS. Chaque ligne reprend l'action du bouton du bureau ; l'activité et l'import restent
 * vivants ici, feuille fermée (l'activité met en valeur ce que les autres viennent de faire).
 */
export function PlusTelephone({
  espace,
  tableau,
  moi,
  ouvrir,
  fichiers,
  reglages,
  surNouveaux,
}: {
  espace: EspaceNavigable
  tableau: Id
  moi: Moi
  ouvrir(id: Id): void
  fichiers: DepotFichiers
  /** Les réglages de la toile, que le bureau ouvre de sa roue. */
  reglages(): void
  surNouveaux?(tableau: string, evenements: EvenementActivite[], moi: string): void
}) {
  const [ouverte, setOuverte] = useState<Ouverte>(null)
  // La feuille se ferme après une ligne, sauf si cette ligne vient d'en ouvrir une autre.
  const fermerMenu = useCallback(() => setOuverte((o) => (o === 'menu' ? null : o)), [])
  const fermer = useCallback(() => setOuverte(null), [])
  const titre = useSyncExternalStore(espace.ecouter, () => espace.tableau(tableau)?.titre ?? '')
  const { favori, sansObjet, bascule } = useFavori(tableau, moi.racine)
  const { activite, erreur } = useActivite(tableau, moi.id, surNouveaux)
  const importer = useImport({ espace, tableau, ouvrir, fichiers })

  const entrees: EntreeMenu[] = [
    { libelle: t('partage.titre'), icone: 'partager', faire: () => setOuverte('partage') },
    { libelle: t('plus.exporter'), icone: 'exporter', faire: () => exporterTableau(tableau, titre) },
    null,
    ...(sansObjet
      ? []
      : [{ libelle: favori ? t('favori.retirer') : t('favori.mettre'), icone: favori ? ('favoriPlein' as const) : ('favori' as const), desactive: favori === null, faire: bascule }]),
    { libelle: t('activite.titre'), icone: 'activite', faire: () => setOuverte('activite') },
    ...(importer.possible
      ? [
          {
            libelle: importer.libelle,
            icone: 'importer' as const,
            desactive: importer.enCours,
            sous: [
              { libelle: t('importer.notak'), icone: 'tableau' as const, faire: () => importer.choisir(TYPES_IMPORT.notak) },
              { libelle: t('importer.milanote'), icone: 'fichierArchive' as const, faire: () => importer.choisir(TYPES_IMPORT.milanote) },
            ],
            faire: () => {},
          },
        ]
      : []),
    { libelle: t('partage.mdpTableau'), icone: 'verrou', faire: () => setOuverte('protection') },
    null,
    { libelle: t('signaler.titre'), icone: 'bug', faire: ouvrirSignaler },
    { libelle: t('reglages.titre'), icone: 'reglages', faire: reglages },
  ]

  return (
    <>
      <BoutonIlot icone="plus" libelle={t('plus.actions')} actif={ouverte === 'menu'} onClick={() => setOuverte('menu')} />
      {ouverte === 'menu' && <FeuilleMenu titre={titre || t('commun.sansTitre')} entrees={entrees} fermer={fermerMenu} />}
      {ouverte === 'activite' && (
        <FeuilleBas titre={t('activite.titre')} fermer={fermer} className="activite-feuille">
          <ListeActivite activite={activite} erreur={erreur} moi={moi.id} />
        </FeuilleBas>
      )}
      {(ouverte === 'partage' || ouverte === 'protection') && <PartageEnFenetre tableau={tableau} moi={moi} fermer={fermer} protection={ouverte === 'protection'} />}
      {importer.champ}
      {importer.statut}
    </>
  )
}
