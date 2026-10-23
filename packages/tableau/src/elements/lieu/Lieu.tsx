import { useEffect, useRef } from 'react'
import type { Lieu } from '../../coeur/tableau'
import type { PropsOutils, PropsRendu } from '../types'
import { avecPosition, positionValable, requete, urlCarte, urlCarteIntegree } from './adresse'

/** Le lien et les champs de la carte ne lancent pas de glisser. */
const garder = (e: React.PointerEvent) => e.stopPropagation()

const Epingle = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
    <path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
  </svg>
)

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
  useLocalisation(element, contexte, !enEdition)
  const position = positionValable(c)
  return (
    <div className="notak-lieu">
      {position && !enEdition ? (
        // Le cadre ne laisse passer le pointeur que lorsque le lieu est choisi : sinon il avalerait le glisser.
        <iframe
          className="notak-lieu-carte"
          title={`Carte : ${requete(c)}`}
          src={urlCarteIntegree(position)}
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin"
          data-actif={choisie || undefined}
        />
      ) : (
        <div className="notak-lieu-plan">
          <Epingle />
        </div>
      )}
      {enEdition ? (
        <Saisie contenu={c} ecrire={brouillon} finir={contexte.finirEdition} />
      ) : (
        <div className="notak-lieu-infos">
          {c.nom && <strong className="notak-lieu-nom">{c.nom}</strong>}
          {c.adresse ? <p className="notak-lieu-adresse">{c.adresse}</p> : !c.nom && <p className="notak-lieu-vide">Adresse du lieu…</p>}
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" onPointerDown={garder} onDoubleClick={(e) => e.stopPropagation()}>
              Voir sur la carte
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
        aria-label="Nom du lieu"
        placeholder="Nom (facultatif)"
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
        aria-label="Adresse du lieu"
        placeholder="Adresse du lieu…"
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
        <a className="notak-lieu-outil" href={url} target="_blank" rel="noopener noreferrer" title="Ouvrir la carte dans un nouvel onglet">
          Voir sur la carte
        </a>
      )}
      {elements.length === 1 && !contexte.services.lectureSeule && (
        <button type="button" title="Modifier l’adresse" onClick={() => contexte.commencerEdition(elements[0]!.id)}>
          Modifier
        </button>
      )}
    </>
  )
}
