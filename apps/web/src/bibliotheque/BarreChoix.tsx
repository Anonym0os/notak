import { BoutonIlot, FiletIlot, Ilot } from '@notak/tableau'
import type { EntreeBibliotheque } from '../api'
import { t, tn } from '../langue'

/**
 * La barre du choix, à la place du titre : combien de tuiles sont choisies, et ce qu'on en fait d'un geste (les
 * déplacer, les mettre en favori, les copier, les jeter). Au doigt, en « Sélectionner », elle reste là même vide, et
 * « OK » en sort ; à la souris, elle paraît dès deux tuiles choisies.
 */
export function BarreChoix({
  choisies,
  ecrit,
  deplacer,
  favori,
  dupliquer,
  jeter,
  fermer,
  auDoigt,
}: {
  choisies: readonly EntreeBibliotheque[]
  /** On peut ranger (un espace est là) : sinon, seuls le compte et la sortie restent. */
  ecrit: boolean
  deplacer(): void
  favori(oui: boolean): void
  dupliquer(): void
  jeter(): void
  fermer(): void
  /** En « Sélectionner » : « OK » au lieu de la croix. */
  auDoigt: boolean
}) {
  const n = choisies.length
  const compte = n === 0 ? t('biblio.choisir.aide') : tn('biblio.selection', n)
  // Seules les toiles se mettent en favori (pour l'instant) : le bouton suit celles du choix.
  const toiles = choisies.filter((e) => e.element === null)
  const tousFavoris = toiles.length > 0 && toiles.every((e) => e.favori)
  return (
    <Ilot className="biblio-barre-choix" etiquette={compte}>
      <span className="biblio-barre-compte">{compte}</span>
      {ecrit && <BoutonIlot icone="dossier" libelle={t('biblio.menu.deplacer')} inactif={n === 0} onClick={deplacer} />}
      {toiles.length > 0 && <BoutonIlot icone={tousFavoris ? 'favoriPlein' : 'favori'} libelle={t(tousFavoris ? 'biblio.menu.plusFavori' : 'biblio.menu.favori')} onClick={() => favori(!tousFavoris)} />}
      {ecrit && <BoutonIlot icone="menuDupliquer" libelle={t('biblio.menu.dupliquer')} raccourci="⌘D" inactif={n === 0} onClick={dupliquer} />}
      {ecrit && <BoutonIlot icone="corbeille" libelle={t('biblio.menu.corbeille')} raccourci="⌫" inactif={n === 0} onClick={jeter} />}
      <FiletIlot />
      {auDoigt ? (
        <button type="button" className="biblio-choisir-bouton" onClick={fermer}>
          {t('biblio.choisir.fini')}
        </button>
      ) : (
        <BoutonIlot icone="fermer" libelle={t('biblio.deselectionner')} raccourci="Échap" onClick={fermer} />
      )}
    </Ilot>
  )
}
