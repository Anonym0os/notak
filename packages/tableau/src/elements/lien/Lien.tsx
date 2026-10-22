import { useEffect, useRef, useState } from 'react'
import type { Apercu, Lien } from '../../coeur/tableau'
import type { PropsRendu } from '../types'
import { domaineDe, lireAdresse } from './adresse'
import { lecteurDe } from './video'

const DELAI_APERCU = 15_000
const REL = 'noopener noreferrer nofollow'

export function RenduLien(props: PropsRendu<Lien>) {
  useChargementApercu(props)
  useSuppressionSiVide(props)
  return props.enEdition ? <Saisie {...props} /> : <Carte {...props} />
}

/** Va chercher l'aperçu, une seule fois par adresse (React rejoue les effets en mode strict). */
function useChargementApercu({ element, contexte }: PropsRendu<Lien>) {
  const { url, statut } = element.contenu
  const id = element.id
  const marque = useRef<string | null>(null)
  useEffect(() => {
    if (statut !== 'attente' || !url || marque.current === `${id}|${url}`) return
    marque.current = `${id}|${url}`
    const chercheur = contexte.services.apercu
    const terminer = (statutFinal: 'pret' | 'echec', apercu?: Apercu) => {
      const actuel = contexte.magasin.lire().elements.find((e) => e.id === id)?.contenu
      // L'élément a disparu ou changé d'adresse entre-temps : ce résultat ne le concerne plus.
      if (!actuel || actuel.type !== 'lien' || actuel.url !== url || actuel.statut !== 'attente') return
      const apres: Lien = { ...actuel, statut: statutFinal, apercu }
      contexte.magasin.appliquerSeulement([{ type: 'contenu', id, avant: actuel, apres }])
    }
    if (!chercheur) return terminer('echec')
    let minuteur: ReturnType<typeof setTimeout>
    const limite = new Promise<never>((_, rejeter) => {
      minuteur = setTimeout(() => rejeter(new Error('délai')), DELAI_APERCU)
    })
    Promise.race([chercheur(url), limite])
      .then((a) => terminer('pret', a))
      .catch(() => terminer('echec'))
      .finally(() => clearTimeout(minuteur))
  }, [id, url, statut, contexte])
}

/** Un lien resté vide à la sortie de l'édition n'a plus de raison d'être. */
function useSuppressionSiVide({ element, enEdition, contexte }: PropsRendu<Lien>) {
  const etaitEnEdition = useRef(false)
  useEffect(() => {
    if (etaitEnEdition.current && !enEdition) {
      const actuel = contexte.magasin.lire().elements.find((e) => e.id === element.id)
      if (actuel && actuel.contenu.type === 'lien' && actuel.contenu.url === '') {
        contexte.magasin.faire([{ type: 'supprimer', element: actuel }])
      }
    }
    etaitEnEdition.current = enEdition
  }, [enEdition, element.id, contexte])
}

function Saisie({ element, contexte, changer }: PropsRendu<Lien>) {
  const { contenu } = element
  const [texte, setTexte] = useState(contenu.url)
  const [erreur, setErreur] = useState(false)
  useEffect(() => {
    if (!erreur) return
    const t = setTimeout(() => setErreur(false), 2000)
    return () => clearTimeout(t)
  }, [erreur])

  const valider = () => {
    const url = lireAdresse(texte)
    if (!url) return setErreur(true)
    if (url !== contenu.url) changer({ type: 'lien', url, statut: 'attente' })
    contexte.finirEdition()
  }

  return (
    <div className="notak-lien notak-lien-saisie">
      <input
        className="notak-lien-champ"
        type="url"
        autoFocus
        spellCheck={false}
        placeholder="Adresse"
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            valider()
          }
        }}
      />
      {erreur && <div className="notak-lien-erreur">Adresse invalide</div>}
    </div>
  )
}

function Carte({ element }: PropsRendu<Lien>) {
  const { url, statut, apercu } = element.contenu
  const domaine = domaineDe(url)
  const lecteur = lecteurDe(url)
  const [lecture, setLecture] = useState(false)
  const image = statut === 'pret' ? apercu?.image : undefined
  const titre = statut === 'echec' ? url : apercu?.titre

  // Sur le lien seulement, le pointeur ne sélectionne pas l'élément.
  const lien = (children: React.ReactNode, classe: string) => (
    <a className={classe} href={url} target="_blank" rel={REL} onPointerDown={(e) => e.stopPropagation()}>
      {children}
    </a>
  )

  return (
    <div className="notak-lien">
      {lecteur && lecture ? (
        <div className="notak-lien-media">
          <iframe
            src={lecteur.src}
            title={titre ?? domaine}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        (image || lecteur) && (
          <div className="notak-lien-media">
            {image && <img src={image} alt="" draggable={false} referrerPolicy="no-referrer" />}
            {lecteur && (
              <button className="notak-lien-lecture" title="Lire" onClick={() => setLecture(true)}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                  <path d="M8 5v14l11-7z" fill="currentColor" />
                </svg>
              </button>
            )}
          </div>
        )
      )}
      <div className="notak-lien-texte">
        {lien(
          <>
            {apercu?.favicon && statut === 'pret' && (
              <img className="notak-lien-favicon" src={apercu.favicon} alt="" draggable={false} referrerPolicy="no-referrer" />
            )}
            <span>{domaine}</span>
          </>,
          'notak-lien-domaine',
        )}
        {statut === 'attente' ? (
          <span className="notak-lien-chargement" role="status" aria-label="Chargement" />
        ) : (
          <>
            {titre && lien(titre, 'notak-lien-titre')}
            {statut === 'pret' && apercu?.description && <div className="notak-lien-description">{apercu.description}</div>}
          </>
        )}
      </div>
    </div>
  )
}
