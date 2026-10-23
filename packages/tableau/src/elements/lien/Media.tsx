import { useState } from 'react'
import type { Lien } from '../../coeur/tableau'
import { BAC_A_SABLE, type Lecteur, PERMISSIONS, adresseDeLecture, demarreSeul, formeDe } from './lecteurs'
import { t } from '../../langue'
import { Icone } from '../../icones'

/**
 * Le haut de la carte : le lecteur intégré (une vidéo, un morceau, une carte) ou l'image d'aperçu.
 * Un lecteur a la forme de son genre — ses proportions, ou la hauteur fixe d'un morceau — et ne se charge qu'au clic,
 * sauf une carte ou une vidéo réglée en lecture automatique.
 */
export function Media({ lecteur, image, titre, lien }: { lecteur: Lecteur | null; image?: string; titre: string; lien: Lien }) {
  const [clic, setClic] = useState(false)
  if (!lecteur) {
    return image ? (
      <div className="notak-lien-media">
        <img src={image} alt="" draggable={false} referrerPolicy="no-referrer" />
      </div>
    ) : null
  }
  const seul = demarreSeul(lecteur, lien)
  const forme = formeDe(lecteur)
  return (
    <div className="notak-lien-media" data-genre={lecteur.genre} style={forme}>
      {clic || seul ? (
        <iframe
          src={adresseDeLecture(lecteur, lien, clic)}
          title={titre}
          allow={PERMISSIONS[lecteur.genre]}
          sandbox={BAC_A_SABLE}
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : (
        <>
          {image && <img src={image} alt="" draggable={false} referrerPolicy="no-referrer" />}
          <button className="notak-lien-lecture" title={t('lien.lire')} onClick={() => setClic(true)}>
            <Icone nom="lecture" taille={20} />
          </button>
        </>
      )}
    </div>
  )
}
