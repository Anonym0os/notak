import type { Lien } from '../../coeur/tableau'
import type { PropsOutils } from '../types'
import { adresseAEditer } from './Lien'
import { type Partie, affichage, avecPartie } from './affichage'
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
    <BoutonOutil icone={icone} secondaire titre={titre} libelle={libelle} actif={elements.every((e) => affichage(e.contenu)[p])} onClick={() => montrer(p)} />
  )
  const reglage = (champ: Reglage, libelle: string, titre: string, icone: NomIcone) => (
    <BoutonOutil icone={icone} secondaire titre={titre} libelle={libelle} actif={elements.every((e) => e.contenu[champ])} onClick={() => basculer(champ)} />
  )
  return (
    <>
      {urls.length === 1 && (
        <BoutonOutil icone="ouvrir" titre={t('menu.ouvrirOnglet')} libelle={t('commun.ouvrir')} onClick={() => window.open(urls[0], '_blank', 'noopener,noreferrer')} />
      )}
      {elements.length === 1 && !contexte.services.lectureSeule && (
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
      {!contexte.services.lectureSeule && (
        <>
          {partie('apercu', t('lien.apercu'), t('lien.apercu.titre'), 'image')}
          {partie('infos', t('lien.infos'), t('lien.infos.titre'), 'infos')}
          {partie('legende', t('note.legende'), t('lien.legende.titre'), 'legende')}
        </>
      )}
      {lectureReglable && reglage('lectureAuto', t('lien.lectureAuto'), t('lien.lectureAuto.titre'), 'lecture')}
      {lectureReglable && reglage('boucle', t('lien.boucle'), t('lien.boucle.titre'), 'boucle')}
      <BoutonOutil icone="copie" secondaire titre={t('lien.copierAdresse')} libelle={t('commun.copier')} onClick={() => void navigator.clipboard.writeText(urls.join('\n'))} />
    </>
  )
}
