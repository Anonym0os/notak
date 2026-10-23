import { useEffect, useState } from 'react'
import type { Lien } from '../../coeur/tableau'
import { BAC_A_SABLE, type Lecteur, PERMISSIONS, adresseDeLecture, demarreSeul, formeDe } from './lecteurs'
import { t } from '../../langue'
import { Icone } from '../../icones'

/** Au plus ce temps après le clic, le lecteur prend la place de l'aperçu, qu'il ait dit « prêt » ou non. */
const DELAI_LECTEUR = 2000

interface Props {
  lecteur: Lecteur | null
  image?: string
  titre: string
  lien: Lien
  /** La carte est choisie seule : sinon un voile transparent couvre le lecteur, et le clic va à la carte. */
  actif: boolean
  /** Le bouton de lecture est là (pas en « média seul »). */
  bouton: boolean
}

/**
 * Le haut de la carte : le lecteur intégré (une vidéo, un morceau, une carte) ou l'image d'aperçu.
 * Un lecteur a la forme de son genre — ses proportions, ou la hauteur fixe d'un morceau. Une vidéo ne se charge qu'au
 * clic (une roue tourne sur l'aperçu jusqu'à ce que le lecteur soit prêt) ; une carte ou une maquette est incrustée d'emblée.
 */
export function Media({ lecteur, image, titre, lien, actif, bouton }: Props) {
  const [clic, setClic] = useState(false)
  const [pret, setPret] = useState(false)
  const [illisible, setIllisible] = useState(false)
  const [cassee, setCassee] = useState(false)
  const seul = !!lecteur && demarreSeul(lecteur, lien)
  const monte = clic || seul
  useEffect(() => {
    if (!monte || pret) return
    const minuteur = setTimeout(() => setPret(true), DELAI_LECTEUR)
    return () => clearTimeout(minuteur)
  }, [monte, pret])

  if (!lecteur) {
    if (!image) return null
    return (
      <div className="notak-lien-media">
        {cassee ? (
          <div className="notak-lien-cassee">
            <Icone nom="image" taille={24} />
          </div>
        ) : (
          <img src={image} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => setCassee(true)} />
        )}
      </div>
    )
  }
  const apercu = image && (!monte || (!pret && !seul))
  return (
    <div
      className="notak-lien-media"
      data-genre={lecteur.genre}
      data-clic={!monte && bouton ? '' : undefined}
      style={formeDe(lecteur)}
      onClick={!monte && bouton ? () => setClic(true) : undefined}
    >
      {apercu && <img src={image} alt="" draggable={false} referrerPolicy="no-referrer" />}
      {monte && (
        <iframe
          src={adresseDeLecture(lecteur, lien, clic)}
          title={titre}
          allow={PERMISSIONS[lecteur.genre]}
          sandbox={BAC_A_SABLE}
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          data-pret={pret || seul ? '' : undefined}
          onLoad={() => setPret(true)}
          onError={() => setIllisible(true)}
        />
      )}
      {!monte && bouton && (
        <button className="notak-lien-lecture" title={t('lien.lire')} aria-label={t('lien.lire')}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" />
          </svg>
        </button>
      )}
      {monte && !pret && !seul && <span className="notak-lien-attente" role="status" aria-label={t('lien.chargement')} />}
      {/* Tant que la carte n'est pas choisie seule, un clic sur le lecteur la choisit au lieu d'agir dedans. */}
      {monte && !actif && <div className="notak-lien-voile" />}
      {illisible && (
        <div className="notak-lien-illisible" role="alert">
          <Icone nom="attention" taille={16} />
          <span>{t('lien.illisible')}</span>
        </div>
      )}
    </div>
  )
}
