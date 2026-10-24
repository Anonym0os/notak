import { useEffect, useRef, useState } from 'react'
import type { Lieu } from '../../coeur/tableau'
import type { PropsOutils, PropsRendu } from '../types'
import { avecPosition, positionValable, requete, urlCarte, urlCarteIntegree } from './adresse'
import { adresseSure } from '../lien/adresse'
import { t } from '../../langue'
import { Icone } from '../../icones'
import { BoutonOutil } from '../../BoutonOutil'

/** Le lien et les champs de la carte ne lancent pas de glisser. */
const garder = (e: React.PointerEvent) => e.stopPropagation()

/**
 * Trouve la position de l'adresse quand le service existe et qu'elle a changé. Hors historique (`corriger`) :
 * c'est un cache de l'adresse, pas un geste de la personne.
 */
function useLocalisation(element: PropsRendu<Lieu>['element'], contexte: PropsRendu<Lieu>['contexte'], actif: boolean) {
  const c = element.contenu
  const q = requete(c)
  const { localiser, lectureSeule } = contexte.services
  const valable = !!positionValable(c)
  const essayee = useRef<string | null>(null)
  useEffect(() => {
    if (!localiser || lectureSeule || !actif || !q || valable || essayee.current === q) return
    essayee.current = q
    let vivant = true
    localiser(q)
      .then((p) => {
        if (!vivant || !p) return
        const actuel = contexte.magasin.lire().elements.find((x) => x.id === element.id)?.contenu
        if (actuel?.type !== 'lieu' || requete(actuel) !== q) return
        contexte.magasin.corriger([{ type: 'contenu', id: element.id, avant: actuel, apres: avecPosition(actuel, p) }])
      })
      .catch(() => {})
    return () => {
      vivant = false
      // Un essai interrompu (l'élément a bougé) peut recommencer.
      if (essayee.current === q) essayee.current = null
    }
  }, [localiser, lectureSeule, actif, q, valable, contexte, element.id])
}

export function RenduLieu({ element, enEdition, choisie, contexte, brouillon }: PropsRendu<Lieu>) {
  const c = element.contenu
  const url = urlCarte(c)
  // La carte et la recherche de l'adresse interrogent OpenStreetMap depuis l'appareil : seulement quand on le demande.
  const [voir, setVoir] = useState(false)
  useLocalisation(element, contexte, !enEdition && voir)
  const position = positionValable(c)
  return (
    <div className="notak-lieu">
      {voir && position && !enEdition ? (
        // Le cadre ne laisse passer le pointeur que lorsque le lieu est choisi : sinon il avalerait le glisser.
        <iframe
          className="notak-lieu-carte"
          title={t('lieu.carte', { adresse: requete(c) })}
          src={urlCarteIntegree(position)}
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin"
          data-actif={choisie || undefined}
        />
      ) : url && !enEdition && !voir ? (
        <button
          type="button"
          className="notak-lieu-plan"
          title={t('lieu.afficherCarte')}
          aria-label={t('lieu.afficherCarte')}
          onPointerDown={garder}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={() => setVoir(true)}
        >
          <Icone nom="epingle" taille={22} />
        </button>
      ) : (
        <div className="notak-lieu-plan">
          <Icone nom="epingle" taille={22} />
        </div>
      )}
      {enEdition ? (
        <Saisie contenu={c} ecrire={brouillon} finir={contexte.finirEdition} />
      ) : (
        <div className="notak-lieu-infos">
          {c.nom && <strong className="notak-lieu-nom">{c.nom}</strong>}
          {c.adresse ? <p className="notak-lieu-adresse">{c.adresse}</p> : !c.nom && <p className="notak-lieu-vide">{t('lieu.adressePoints')}</p>}
          {url && (
            <a href={adresseSure(url)} target="_blank" rel="noopener noreferrer" onPointerDown={garder} onDoubleClick={(e) => e.stopPropagation()}>
              {t('lieu.voirCarte')}
            </a>
          )}
        </div>
      )}
    </div>
  )
}

/** Le nom, puis l'adresse. Entrée dans le nom passe à l'adresse ; Entrée dans l'adresse ferme (Maj+Entrée : ligne suivante). */
function Saisie({ contenu, ecrire, finir }: { contenu: Lieu; ecrire(c: Lieu): void; finir(): void }) {
  const adresse = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    adresse.current?.focus()
  }, [])
  const sansNom = ({ nom: _, ...reste }: Lieu): Lieu => reste
  return (
    <div className="notak-lieu-infos" data-edition>
      <input
        type="text"
        aria-label={t('lieu.nom')}
        placeholder={t('lieu.nomFacultatif')}
        maxLength={200}
        value={contenu.nom ?? ''}
        onPointerDown={garder}
        onChange={(e) => ecrire(e.target.value ? { ...contenu, nom: e.target.value } : sansNom(contenu))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            adresse.current?.focus()
          }
        }}
      />
      <textarea
        ref={adresse}
        rows={2}
        aria-label={t('lieu.adresse')}
        placeholder={t('lieu.adressePoints')}
        maxLength={500}
        value={contenu.adresse}
        onPointerDown={garder}
        onChange={(e) => ecrire({ ...contenu, adresse: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            finir()
          }
        }}
      />
    </div>
  )
}

export function OutilsLieu({ elements, contexte }: PropsOutils<Lieu>) {
  const url = elements.length === 1 ? urlCarte(elements[0]!.contenu) : null
  return (
    <>
      {url && (
        <BoutonOutil icone="carte" secondaire titre={t('lieu.ouvrirCarte')} libelle={t('lieu.voirCarte')} onClick={() => void window.open(url, '_blank', 'noopener,noreferrer')} />
      )}
      {elements.length === 1 && !contexte.services.lectureSeule && (
        <BoutonOutil icone="modifier" secondaire titre={t('lieu.modifierAdresse')} libelle={t('commun.modifier')} onClick={() => contexte.commencerEdition(elements[0]!.id)} />
      )}
    </>
  )
}
