import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Fichier } from '../../coeur/tableau'
import { Icone } from '../../icones'
import { t } from '../../langue'
import { ICONE_DU_GENRE, genreDe, lisible, seLitEnLigne, tailleLisible } from './genre'
import { LecteurSon, LecteurVideo } from './lecteur'
import { ouvrirFenetreFichier } from './ouverture'

/**
 * Le fichier en grand, sur un voile à 70 %. Un PDF ou un texte se lit dans le lecteur du navigateur (80 % de la largeur,
 * 90 % de la hauteur) ; une image, un son ou une vidéo se montrent en grand ; le reste est une carte agrandie.
 * Échap ou un clic sur le fond la ferme.
 */
export function ModaleFichier({ contenu: c, adresse }: { contenu: Fichier; adresse: string }) {
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      ouvrirFenetreFichier(null)
    }
    document.addEventListener('keydown', touche, true)
    return () => document.removeEventListener('keydown', touche, true)
  }, [])
  const genre = genreDe(c.nom, c.typeMime)
  const lecteur = lisible(c.typeMime)
  const titre = c.titre ?? c.nom
  const corps = seLitEnLigne(c.nom, c.typeMime) ? (
    // Un texte se lit dans un cadre bac à sable : rien de ce qu'il contient ne s'y exécute. Le lecteur PDF du
    // navigateur, lui, refuse le bac à sable.
    <iframe className="notak-fenetre-lecteur" title={titre} src={adresse} data-garder {...(c.typeMime.toLowerCase() === 'application/pdf' || /\.pdf$/i.test(c.nom) ? {} : { sandbox: '' })} />
  ) : genre === 'image' ? (
    <img className="notak-fenetre-image" data-garder src={adresse} alt={titre} draggable={false} />
  ) : (
    <div className="notak-fenetre-carte" data-garder>
      {lecteur === 'video' ? (
        <LecteurVideo adresse={adresse} boucle={!!c.boucle} auto={!!c.lectureAuto} />
      ) : (
        <>
          <span className="notak-fenetre-icone" aria-hidden>
            <Icone nom={ICONE_DU_GENRE[genre]} taille={64} trait={1.25} />
          </span>
          {lecteur === 'son' && <LecteurSon adresse={adresse} boucle={!!c.boucle} auto={!!c.lectureAuto} />}
        </>
      )}
      <div className="notak-fenetre-meta">
        <span className="notak-fenetre-titre">{titre}</span>
        <span className="notak-fenetre-details">
          <a href={adresse} download={c.nom}>
            {t('fichier.telecharger')}
          </a>
          {' - '}
          {tailleLisible(c.taille)}
        </span>
        {c.legende && <p className="notak-fenetre-legende">{c.legende}</p>}
      </div>
    </div>
  )
  return createPortal(
    <div
      className="notak-fenetre"
      role="dialog"
      aria-label={titre}
      onPointerDown={(e) => {
        if (!(e.target instanceof HTMLElement && e.target.closest('[data-garder]'))) ouvrirFenetreFichier(null)
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {corps}
    </div>,
    document.body,
  )
}
