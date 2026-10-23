import { COULEURS_NOTE, type CouleurNote } from '../../coeur/tableau'
import { FOND_NOTE, LIBELLES_COULEUR, teinteDe } from './couleurs'
import { PanneauCouleur } from './PanneauCouleur'
import { OutilAvecMenu } from '../../BoutonOutil'
import { t } from '../../langue'
import { useMenu } from '../../menuUnique'

/**
 * « Couleur » : la palette des notes, en menu (la grille de cinq colonnes de la note, sans onglets). Partagée par
 * tout ce qui se colore comme une note. `transparent` ajoute le choix sans fond, qui n'a de sens que pour une note.
 */
export function MenuCouleur({ actuelle, choisir, transparent = false, secondaire }: { actuelle: CouleurNote | undefined; choisir(c: CouleurNote | undefined): void; transparent?: boolean; secondaire?: boolean }) {
  const menu = useMenu()
  return (
    <OutilAvecMenu menu={menu} icone="palette" titre={t('couleur.titre')} libelle={t('couleur.titre')} pastille={teinteDe(actuelle)} secondaire={secondaire}>
      <PanneauCouleur
        onglets={[
          {
            cle: 'couleur',
            libelle: t('couleur.titre'),
            icone: 'palette',
            pastilles: [
              { cle: 'aucune', libelle: t('couleur.aucune'), genre: 'aucune', actif: actuelle === undefined, choisir: () => choisir(undefined) },
              ...COULEURS_NOTE.map((c) => ({ cle: c, libelle: LIBELLES_COULEUR[c], teinte: FOND_NOTE[c], actif: actuelle === c, choisir: () => choisir(c) })),
              ...(transparent ? [{ cle: 'transparent', libelle: t('couleur.transparent'), genre: 'transparente' as const, actif: actuelle === 'transparent', choisir: () => choisir('transparent' as const) }] : []),
            ],
          },
        ]}
      />
    </OutilAvecMenu>
  )
}
