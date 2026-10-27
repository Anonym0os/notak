import { useEffect, useRef, useState } from 'react'
import type { Lien } from '../../coeur/tableau'
import { BAC_A_SABLE, type Lecteur, PERMISSIONS, adresseDeLecture, demarreSeul, formeDe } from './lecteurs'
import { ecouterFin } from './fin'
import { t } from '../../langue'
import { Icone, type NomIcone } from '../../icones'
import { ContenuAttendu } from '../ContenuAttendu'

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
  /** La largeur de la carte en UG, quand elle est la sienne (pas dans une colonne) : l'image tombe alors sur la grille. */
  largeur?: number
  /** La taille de l'image d'aperçu en pixels, quand on la connaît : la place est réservée avant son chargement. */
  dimensions: { largeur: number; hauteur: number } | null
  /** Pas de lecteur en présentation : l'aperçu seul, ou un cadre gris pour une carte ou une maquette. */
  presentation: boolean
  /** L'image vient de se charger sans qu'on en connaisse la taille : à garder avec le lien. */
  surDimensions(largeur: number, hauteur: number): void
  /**
   * Toile venue d'une copie reçue : ce que la carte chargerait d'un autre site (le lecteur, l'image d'aperçu) attend
   * l'accord. Une place dit d'où cela viendrait ; `afficher` le permet, pour cette carte seule.
   */
  attente?: { hotes: readonly string[]; afficher(): void } | null
}

const ICONE_LECTEUR: Record<Lecteur['genre'], NomIcone> = { video: 'lecture', audio: 'audio', carte: 'carte', riche: 'lien' }

/** La hauteur d'une image d'aperçu sur la grille : en UG entières, 10 px chacune. */
export const hauteurSurGrille = (largeurUG: number, proportions: number) => Math.max(1, Math.round(largeurUG / proportions)) * 10

/**
 * Le haut de la carte : le lecteur intégré (une vidéo, un morceau, une carte) ou l'image d'aperçu.
 * Un lecteur a la forme de son genre — ses proportions, ou la hauteur fixe d'un morceau. Une vidéo ne se charge qu'au
 * clic (une roue tourne sur l'aperçu jusqu'à ce que le lecteur soit prêt, et l'aperçu revient quand la lecture finit) ;
 * une carte ou une maquette est incrustée d'emblée.
 */
export function Media({ lecteur, image, titre, lien, actif, bouton, largeur, dimensions, presentation, surDimensions, attente }: Props) {
  const [clic, setClic] = useState(false)
  const [pret, setPret] = useState(false)
  const [fini, setFini] = useState(false)
  const [illisible, setIllisible] = useState(false)
  const [cassee, setCassee] = useState(false)
  const arreter = useRef<(() => void) | null>(null)
  // Tant que la carte attend l'accord, aucun lecteur ne se monte, même déjà lancé : le cadre part avec lui.
  const seul = !presentation && !attente && !fini && !!lecteur && demarreSeul(lecteur, lien)
  const monte = !presentation && !attente && !fini && (clic || seul)
  useEffect(() => {
    if (!monte || pret) return
    const minuteur = setTimeout(() => setPret(true), DELAI_LECTEUR)
    return () => clearTimeout(minuteur)
  }, [monte, pret])
  // Le lecteur démonté (fin de lecture, carte supprimée), on n'écoute plus.
  useEffect(() => () => arreter.current?.(), [monte])
  useEffect(() => setCassee(false), [image])

  if (!lecteur) {
    if (!image && !attente) return null
    const proportions = dimensions ? dimensions.largeur / dimensions.hauteur : undefined
    const forme = proportions ? (largeur ? { height: hauteurSurGrille(largeur, proportions) } : { aspectRatio: String(proportions) }) : undefined
    return (
      <div className="notak-lien-media" data-calee={proportions ? '' : undefined} data-attente={attente ? '' : undefined} style={forme}>
        {attente ? (
          <ContenuAttendu icone="image" {...attente} />
        ) : cassee ? (
          <div className="notak-lien-cassee">
            <Icone nom="image" taille={24} />
          </div>
        ) : (
          <img
            src={image}
            alt=""
            draggable={false}
            referrerPolicy="no-referrer"
            onLoad={dimensions ? undefined : (e) => surDimensions(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
            onError={() => setCassee(true)}
          />
        )}
      </div>
    )
  }
  const peutLire = bouton && !presentation && !attente
  return (
    <div
      className="notak-lien-media"
      data-genre={lecteur.genre}
      data-clic={!monte && peutLire ? '' : undefined}
      data-fige={presentation && lecteur.genre !== 'video' ? '' : undefined}
      style={formeDe(lecteur)}
      onClick={
        !monte && peutLire
          ? () => {
              setFini(false)
              setPret(false)
              setClic(true)
            }
          : undefined
      }
    >
      {image && <img src={image} alt="" draggable={false} referrerPolicy="no-referrer" />}
      {attente && <ContenuAttendu icone={ICONE_LECTEUR[lecteur.genre]} {...attente} />}
      {monte && (
        <iframe
          src={adresseDeLecture(lecteur, lien, clic)}
          title={titre}
          allow={PERMISSIONS[lecteur.genre]}
          sandbox={BAC_A_SABLE}
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          data-pret={pret || seul ? '' : undefined}
          onLoad={(e) => {
            setPret(true)
            arreter.current?.()
            arreter.current = ecouterFin(e.currentTarget, lecteur.fournisseur, () => {
              // La lecture est finie : le lecteur s'en va, l'aperçu et son bouton reviennent.
              setFini(true)
              setClic(false)
              setPret(false)
            })
          }}
          onError={() => setIllisible(true)}
        />
      )}
      {!monte && peutLire && (
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
