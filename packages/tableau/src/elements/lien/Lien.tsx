import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Apercu, Id, Lien } from '../../coeur/tableau'
import type { PropsRendu } from '../types'
import { domaineDe, lireAdresse } from './adresse'
import { lecteurDe } from './lecteurs'
import { Media } from './Media'

const DELAI_APERCU = 15_000
const REL = 'noopener noreferrer nofollow'

/** Les liens dont la prochaine édition porte sur l'adresse, pas sur le titre (outil « Adresse »). */
export const adresseAEditer = new Set<Id>()

export function RenduLien(props: PropsRendu<Lien>) {
  useChargementApercu(props)
  useSuppressionSiVide(props)
  const { element, enEdition } = props
  const saisie = enEdition && (!element.contenu.url || adresseAEditer.has(element.id))
  useEffect(() => {
    if (!enEdition) adresseAEditer.delete(element.id)
  }, [enEdition, element.id])
  return saisie ? <Saisie {...props} /> : <Carte {...props} />
}

/** Le titre affiché : celui qu'on a donné, sinon celui de l'aperçu, sinon l'adresse si l'aperçu a échoué. */
export const titreDuLien = (c: Lien) => c.titre ?? (c.statut === 'echec' ? c.url : c.apercu?.titre)

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
      contexte.magasin.corriger([{ type: 'contenu', id, avant: actuel, apres }])
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
    adresseAEditer.delete(element.id)
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

function Carte({ element, choisie, enEdition, contexte, brouillon }: PropsRendu<Lien>) {
  const { contenu } = element
  const { url, statut, apercu } = contenu
  const domaine = domaineDe(url)
  const lecteur = lecteurDe(url)
  const image = statut === 'pret' ? apercu?.image : undefined
  const titre = titreDuLien(contenu)
  const legende = contenu.legende ?? (statut === 'pret' && !lecteur ? apercu?.description : undefined)
  // Entré en édition par un clic sur la légende, on l'écrit ; sinon on renomme. Le choix se fait une fois
  // par édition (le mode strict rejoue l'effet, et le point d'édition ne se lit qu'une fois).
  const [partie, setPartie] = useState<'titre' | 'legende' | null>(null)
  const choix = useRef<'titre' | 'legende' | null>(null)
  useLayoutEffect(() => {
    if (!enEdition) {
      choix.current = null
      return setPartie(null)
    }
    if (choix.current) return
    const ou = contexte.prendrePointEdition()
    const sous = ou && document.elementFromPoint(ou.x, ou.y)
    choix.current = sous?.closest('.notak-lien-description') ? 'legende' : 'titre'
    setPartie(choix.current)
  }, [enEdition, contexte])
  const ecrire = (champ: 'titre' | 'legende', v: string) => brouillon({ ...contenu, [champ]: v })

  // Le domaine ouvre toujours le lien ; le titre seulement tant que le lien n'est pas choisi (sinon, on le renomme).
  const lien = (children: React.ReactNode, classe: string, toujours: boolean) => (
    <a
      className={classe}
      href={url}
      target="_blank"
      rel={REL}
      onPointerDown={(e) => (toujours || !choisie) && e.stopPropagation()}
      onClick={(e) => !toujours && choisie && e.preventDefault()}
    >
      {children}
    </a>
  )

  return (
    <div className="notak-lien">
      <Media lecteur={lecteur} image={image} titre={titre ?? domaine} lien={contenu} />
      <div className="notak-lien-texte">
        {lien(
          <>
            {apercu?.favicon && statut === 'pret' && (
              <img className="notak-lien-favicon" src={apercu.favicon} alt="" draggable={false} referrerPolicy="no-referrer" />
            )}
            <span>{domaine}</span>
          </>,
          'notak-lien-domaine',
          true,
        )}
        {statut === 'attente' ? (
          <span className="notak-lien-chargement" role="status" aria-label="Chargement" />
        ) : (
          <>
            {partie === 'titre' ? (
              <Champ classe="notak-lien-titre" valeur={titre ?? ''} max={500} toutChoisir ligne ecrire={(v) => ecrire('titre', v)} finir={contexte.finirEdition} />
            ) : (
              titre && lien(titre, 'notak-lien-titre', false)
            )}
            {partie === 'legende' ? (
              <Champ classe="notak-lien-description" valeur={legende ?? ''} ecrire={(v) => ecrire('legende', v)} finir={contexte.finirEdition} />
            ) : (
              legende && <div className="notak-lien-description">{legende}</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** Un champ de texte posé à la place du titre ou de la légende, à sa taille, écrit à chaque frappe. */
function Champ(props: { classe: string; valeur: string; max?: number; toutChoisir?: boolean; ligne?: boolean; ecrire(v: string): void; finir(): void }) {
  const { classe, valeur, max, toutChoisir, ligne, ecrire, finir } = props
  const [texte, setTexte] = useState(valeur)
  const champ = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const c = champ.current
    if (!c) return
    c.focus()
    if (toutChoisir) c.select()
    else c.setSelectionRange(c.value.length, c.value.length)
  }, [toutChoisir])
  return (
    <textarea
      ref={champ}
      className={`${classe} notak-lien-edition`}
      value={texte}
      maxLength={max}
      rows={1}
      spellCheck={false}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        const v = ligne ? e.target.value.replace(/\n/g, ' ') : e.target.value
        setTexte(v)
        ecrire(v)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (ligne || e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          finir()
        }
      }}
    />
  )
}
