import { BoutonIlot, FiletIlot, Ilot } from '@notak/tableau'
import type { EntreeBibliotheque } from '../api'
import { t, tn } from '../langue'
import { immobile, regroupeUnOutil } from './modele'

/**
 * La barre du choix, à la place du titre : combien de tuiles sont choisies, et ce qu'on en fait d'un geste (les
 * déplacer, les mettre en favori, les copier, les jeter). Au doigt, en « Sélectionner », elle reste là même vide, et
 * « OK » en sort ; à la souris, elle paraît dès deux tuiles choisies. Ce qu'un outil a posé ne se déplace pas, et le
 * dossier qui range les siens ne se jette pas : seuls, ils laissent ces boutons éteints.
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
  // Tout se met en favori : les toiles et ce qu'elles portent.
  const tousFavoris = n > 0 && choisies.every((e) => e.favori)
  // Retenus plutôt qu'éteints : leur infobulle dit pourquoi.
  const poses = n > 0 && choisies.every(immobile)
  const gardes = n > 0 && choisies.every(regroupeUnOutil)
  const resteOu = poses ? t('biblio.menu.pose', { outil: choisies[0]!.outil! }) : ''
  return (
    <Ilot className="biblio-barre-choix" etiquette={compte}>
      <span className="biblio-barre-compte">{compte}</span>
      {ecrit && <BoutonIlot icone="dossier" libelle={poses ? resteOu : t('biblio.menu.deplacer')} inactif={n === 0} retenu={poses} onClick={deplacer} />}
      {n > 0 && <BoutonIlot icone={tousFavoris ? 'favoriPlein' : 'favori'} libelle={t(tousFavoris ? 'biblio.menu.plusFavori' : 'biblio.menu.favori')} onClick={() => favori(!tousFavoris)} />}
      {ecrit && <BoutonIlot icone="menuDupliquer" libelle={t('biblio.menu.dupliquer')} raccourci="⌘D" inactif={n === 0} onClick={dupliquer} />}
      {ecrit && <BoutonIlot icone="corbeille" libelle={gardes ? resteOu : t('biblio.menu.corbeille')} raccourci={gardes ? undefined : '⌫'} inactif={n === 0} retenu={gardes} onClick={jeter} />}
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
