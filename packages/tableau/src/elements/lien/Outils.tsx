import type { Lien } from '../../coeur/tableau'
import type { PropsOutils } from '../types'
import { adresseAEditer, legendeAEditer } from './Lien'
import { LARGEUR_MEDIA_SEUL, type Partie, affichage, aUnMedia, avecPartie, mediaSeul, mediaVisible } from './affichage'
import { aDesReglagesDeLecture, lecteurDe } from './lecteurs'
import { t } from '../../langue'
import { BoutonOutil } from '../../BoutonOutil'
import type { NomIcone } from '../../icones'

type Reglage = 'lectureAuto' | 'boucle'

export function OutilsLien({ elements, contexte }: PropsOutils<Lien>) {
  const urls = elements.map((e) => e.contenu.url).filter(Boolean)
  if (urls.length === 0) return null
  const lectureReglable = !contexte.services.lectureSeule && elements.every((e) => {
    const l = lecteurDe(e.contenu.url)
    return l && aDesReglagesDeLecture(l)
  })
  // Un seul pas d'historique pour toute la sélection : tous allumés si l'un est éteint, sinon tous éteints.
  const basculer = (champ: Reglage) => {
    const allumer = !elements.every((e) => e.contenu[champ])
    contexte.magasin.faire(
      elements.map((e) => {
        const { [champ]: _, ...reste } = e.contenu
        return { type: 'contenu', id: e.id, avant: e.contenu, apres: allumer ? { ...reste, [champ]: true } : reste }
      }),
    )
  }
  // Montrer ou cacher une partie de la carte : tout est montré si l'une des cartes la cache, sinon tout est caché.
  const montrer = (partie: Partie) => {
    const visible = !elements.every((e) => affichage(e.contenu)[partie])
    contexte.magasin.faire(
      elements.map((e) => ({ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: avecPartie(e.contenu, partie, visible) })),
    )
  }
  const partie = (p: Partie, libelle: string, titre: string, icone: NomIcone) => (
    <BoutonOutil icone={icone} titre={titre} libelle={libelle} actif={elements.every((e) => affichage(e.contenu)[p])} onClick={() => montrer(p)} />
  )
  const reglage = (champ: Reglage, libelle: string, titre: string, icone: NomIcone) => (
    <BoutonOutil icone={icone} secondaire titre={titre} libelle={libelle} actif={elements.every((e) => e.contenu[champ])} onClick={() => basculer(champ)} />
  )
  // Les parties n'ont de sens qu'avec un média : « Aperçu » et « Infos du lien » ne sont proposés que s'il y en a un,
  // et en « média seul » (le texte caché) il ne reste que « Infos du lien » pour revenir.
  const modifiable = !contexte.services.lectureSeule
  const avecMedia = elements.every((e) => aUnMedia(e.contenu))
  const montreMedia = elements.every((e) => mediaVisible(e.contenu))
  const aucunSeul = elements.every((e) => !e.contenu.sansInfos || !mediaVisible(e.contenu))
  const infosPossible = montreMedia && elements.every((e) => e.largeur >= LARGEUR_MEDIA_SEUL)
  const texteVisible = elements.every((e) => !mediaSeul(e.contenu))
  const legende = () => {
    // Allumer la légende y met le curseur : on édite la carte, par la légende.
    const allumer = !elements.every((e) => affichage(e.contenu).legende)
    montrer('legende')
    if (allumer && elements.length === 1) {
      legendeAEditer.add(elements[0]!.id)
      contexte.commencerEdition(elements[0]!.id)
    }
  }
  // Après les étiquettes, réactions et commentaire : Aperçu, Infos du lien, Renommer, Légende. Ouvrir et Copier l'adresse sont au menu « ••• ».
  return (
    <>
      {modifiable && avecMedia && aucunSeul && partie('apercu', t('lien.apercu'), t('lien.apercu.titre'), 'image')}
      {modifiable && infosPossible && (
        <BoutonOutil icone="infos" titre={t('lien.infos.titre')} libelle={t('lien.infos')} actif={elements.every((e) => affichage(e.contenu, e.largeur).infos)} onClick={() => montrer('infos')} />
      )}
      {elements.length === 1 && modifiable && texteVisible && (
        <BoutonOutil
          icone="modifier"
          titre={t('lien.renommer.titre')}
          libelle={t('lien.renommer')}
          onClick={() => {
            adresseAEditer.delete(elements[0]!.id)
            legendeAEditer.delete(elements[0]!.id)
            contexte.commencerEdition(elements[0]!.id)
          }}
        />
      )}
      {modifiable && texteVisible && (
        <BoutonOutil icone="legende" titre={t('lien.legende.titre')} libelle={t('note.legende')} actif={elements.every((e) => affichage(e.contenu).legende)} onClick={legende} />
      )}
      {elements.length === 1 && modifiable && texteVisible && (
        <BoutonOutil
          icone="lien"
          titre={t('lien.changerAdresse')}
          libelle={t('lien.adresse')}
          onClick={() => {
            adresseAEditer.add(elements[0]!.id)
            contexte.commencerEdition(elements[0]!.id)
          }}
        />
      )}
      {lectureReglable && reglage('lectureAuto', t('lien.lectureAuto'), t('lien.lectureAuto.titre'), 'lecture')}
      {lectureReglable && reglage('boucle', t('lien.boucle'), t('lien.boucle.titre'), 'boucle')}
    </>
  )
}
