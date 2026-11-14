import type { Element, Fichier } from '../../coeur/tableau'
import { Dialogue } from '../../communs'
import { Icone } from '../../icones'
import { t } from '../../langue'
import type { ContexteToile } from '../types'
import { ICONE_DU_GENRE, genreDe, lisible, seLitEnLigne, tailleLisible } from './genre'
import { LecteurSon, LecteurVideo } from './lecteur'
import { ouvrirFenetreFichier } from './ouverture'
import { VisionneusePdf } from './pdf/VisionneusePdf'

/**
 * Le fichier en grand, sur un voile à 70 %. Un PDF s'ouvre dans la visionneuse de Notak (`pdf/VisionneusePdf`), un
 * texte dans le lecteur du navigateur (80 % de la largeur, 90 % de la hauteur) ; une image, un son ou une vidéo se
 * montrent en grand ; le reste est une carte agrandie. C'est un dialogue (communs/Dialogue), sans boîte : Échap ou un
 * clic sur le fond la ferme. La bibliothèque s'en sert aussi, hors de toute toile, pour ce que range un dossier
 * (`fermer` : à elle de la retirer ; sans `element` ni `contexte`, le PDF se lit sans rien de la toile).
 */
export function ModaleFichier({
  contenu: c,
  adresse,
  fermer = () => ouvrirFenetreFichier(null),
  element,
  contexte,
}: {
  contenu: Fichier
  adresse: string
  fermer?: () => void
  element?: Element<Fichier>
  contexte?: ContexteToile
}) {
  const genre = genreDe(c.nom, c.typeMime)
  const lecteur = lisible(c.typeMime)
  const titre = c.titre ?? c.nom
  if (genre === 'pdf') return <VisionneusePdf contenu={c} adresse={adresse} fermer={fermer} {...(element ? { element } : {})} {...(contexte ? { contexte } : {})} />
  const corps = seLitEnLigne(c.nom, c.typeMime) ? (
    // Un texte se lit dans un cadre bac à sable : rien de ce qu'il contient ne s'y exécute.
    <iframe className="notak-fenetre-lecteur" title={titre} src={adresse} data-garder sandbox="" />
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
  return (
    <Dialogue nu className="notak-fenetre" etiquette={titre} voile="sombre" fermer={fermer} hote={document.body}>
      {corps}
    </Dialogue>
  )
}
