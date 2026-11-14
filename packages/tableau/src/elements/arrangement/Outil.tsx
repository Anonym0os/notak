import {
  type AxeRepartition,
  MIN_ALIGNER,
  MIN_REPARTIR,
  type SensAlignement,
  aligner,
  axesRepartissables,
  repartir,
} from '../../coeur/arrangement'
import type { OutilCommun } from '../types'
import { disposables } from './disposables'
import { entreeRelier } from '../ligne/raccourci'
import { enOperations } from './raccourcis'
import { t } from '../../langue'
import { BoutonOutil, OutilAvecMenu } from '../../BoutonOutil'
import { MenuEntrees } from '../../communs/Menu'
import { type NomIcone, Icone } from '../../icones'
import { useMenu } from '../../menuUnique'

const SENS: { sens: SensAlignement; libelle: string; icone: NomIcone }[] = [
  { sens: 'gauche', get libelle() { return t('arrangement.gauche') }, icone: 'alignerGauche' },
  { sens: 'centre-horizontal', get libelle() { return t('arrangement.centre') }, icone: 'alignerCentreH' },
  { sens: 'droite', get libelle() { return t('arrangement.droite') }, icone: 'alignerDroite' },
  { sens: 'haut', get libelle() { return t('arrangement.haut') }, icone: 'alignerHaut' },
  { sens: 'centre-vertical', get libelle() { return t('arrangement.milieu') }, icone: 'alignerCentreV' },
  { sens: 'bas', get libelle() { return t('arrangement.bas') }, icone: 'alignerBas' },
]

const AXES: Record<AxeRepartition, { libelle: string; icone: NomIcone; raccourci: string }> = {
  horizontal: { get libelle() { return t('arrangement.horizontal') }, icone: 'repartirH', raccourci: '⌥⇧⌘H' },
  vertical: { get libelle() { return t('arrangement.vertical') }, icone: 'repartirV', raccourci: '⌥⇧⌘V' },
}

export const OutilArrangement: OutilCommun = ({ elements, contexte }) => {
  // Deux menus, un seul ouvert à la fois, et aucun quand un autre outil ouvre le sien.
  const aligner_ = useMenu<HTMLDivElement>()
  const [repartirOuvert, ouvrirRepartir, ancreRepartir] = useMenu<HTMLDivElement>()
  const items = disposables(elements, contexte)
  const peutAligner = items.length >= MIN_ALIGNER
  const peutRepartir = items.length >= MIN_REPARTIR
  // Les axes où répartir fait quelque chose : une rangée ne se répartit qu'en largeur, une colonne qu'en hauteur.
  const axes = peutRepartir ? axesRepartissables(items) : []
  const seul = axes.length === 1 ? axes[0] : undefined

  const appliquer = (pas: ReturnType<typeof enOperations>) => {
    if (pas.length > 0) contexte.magasin.faire(pas)
    aligner_[1](false)
    ouvrirRepartir(false)
  }
  const repartirSur = (axe: AxeRepartition) => appliquer(enOperations(repartir(items, axe), contexte.magasin.lire().elements))

  return (
    <>
      {peutAligner && (
        <OutilAvecMenu menu={aligner_} classeAncre="notak-arrangement" icone="alignerGauche" libelle={t('arrangement.aligner')}>
          <span className="notak-arrangement-menu" role="menu">
            {SENS.map((s) => (
              <button key={s.sens} type="button" role="menuitem" title={s.libelle} aria-label={s.libelle} onClick={() => appliquer(enOperations(aligner(items, s.sens), contexte.magasin.lire().elements))}>
                <Icone nom={s.icone} />
              </button>
            ))}
          </span>
        </OutilAvecMenu>
      )}
      {peutRepartir && (
        // Une rangée ou une colonne n'a qu'un axe à répartir : un clic suffit, comme « Tidy up » de Figma lit la
        // disposition. Une grille ou une diagonale en a deux : le menu les nomme en toutes lettres, avec leurs
        // raccourcis. Des éléments empilés n'en ont aucun : l'outil se grise et dit pourquoi.
        <OutilAvecMenu
          menu={[repartirOuvert, (ouvrir) => (ouvrir && seul ? repartirSur(seul) : ouvrirRepartir(ouvrir)), ancreRepartir]}
          classeAncre="notak-arrangement"
          icone={AXES[seul ?? 'horizontal'].icone}
          libelle={t('arrangement.repartir')}
          titre={seul ? AXES[seul].libelle : axes.length === 0 ? t('arrangement.rienARepartir') : undefined}
          desactive={axes.length === 0}
        >
          <MenuEntrees
            className="notak-arrangement-axes"
            entrees={axes.map((a) => ({ libelle: AXES[a].libelle, icone: AXES[a].icone, raccourci: AXES[a].raccourci, faire: () => repartirSur(a) }))}
            fermer={() => ouvrirRepartir(false)}
          />
        </OutilAvecMenu>
      )}
      {entreeRelier.visible(elements, contexte) && (
        <BoutonOutil icone="relier" titre={t('menu.relier')} libelle={t('arrangement.relier')} onClick={() => entreeRelier.faire(elements, contexte)} />
      )}
    </>
  )
}
