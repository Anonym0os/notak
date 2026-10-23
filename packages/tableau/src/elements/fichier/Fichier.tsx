import { useEffect, useRef, useState } from 'react'
import type { Fichier } from '../../coeur/tableau'
import { useFichier } from '../envois'
import type { PropsOutils, PropsRendu } from '../types'
import { extensionDe, genreDe, lisible, tailleLisible } from './genre'

const sansTitre = ({ titre: _, ...reste }: Fichier): Fichier => reste
/** Les liens et les lecteurs de la carte ne lancent pas de glisser. */
const garder = (e: React.PointerEvent) => e.stopPropagation()

export function RenduFichier({ element, enEdition, contexte, brouillon }: PropsRendu<Fichier>) {
  const c = element.contenu
  const { adresse, enRoute } = useFichier(element, contexte)
  const genre = genreDe(c.nom, c.typeMime)
  const extension = extensionDe(c.nom)
  const lecteur = lisible(c.typeMime)
  return (
    <div className="notak-fichier" data-genre={genre}>
      {lecteur === 'video' && adresse && (
        <video className="notak-fichier-video" src={adresse} controls preload="metadata" onPointerDown={garder} onDoubleClick={(e) => e.stopPropagation()} />
      )}
      <div className="notak-fichier-tete">
        <span className="notak-fichier-badge" aria-hidden>
          {extension ? extension.slice(0, 4).toUpperCase() : 'FICHIER'}
        </span>
        <div className="notak-fichier-infos">
          {enEdition ? (
            <Nom contenu={c} ecrire={brouillon} finir={contexte.finirEdition} />
          ) : (
            <span className="notak-fichier-nom" title={c.nom}>
              {c.titre ?? c.nom}
            </span>
          )}
          <span className="notak-fichier-details">
            {tailleLisible(c.taille)}
            {enRoute && (
              <>
                {' · '}
                <span className="notak-roue" aria-hidden /> Envoi…
              </>
            )}
            {adresse && !enRoute && (
              <>
                {' · '}
                <a href={adresse} download={c.nom} onPointerDown={garder}>
                  Télécharger
                </a>
                {' · '}
                <a href={adresse} target="_blank" rel="noopener noreferrer" onPointerDown={garder}>
                  Ouvrir
                </a>
              </>
            )}
            {adresse === null && ' · introuvable'}
          </span>
        </div>
      </div>
      {lecteur === 'son' && adresse && (
        <audio className="notak-fichier-son" src={adresse} controls preload="metadata" onPointerDown={garder} />
      )}
    </div>
  )
}

/** Le nom en cours d'écriture, tout choisi ; vidé, le fichier reprend son nom d'origine. */
function Nom({ contenu, ecrire, finir }: { contenu: Fichier; ecrire(c: Fichier): void; finir(): void }) {
  const [texte, setTexte] = useState(contenu.titre ?? contenu.nom)
  const champ = useRef<HTMLInputElement>(null)
  useEffect(() => {
    champ.current?.focus()
    champ.current?.select()
  }, [])
  return (
    <input
      ref={champ}
      className="notak-fichier-nom notak-fichier-champ"
      value={texte}
      maxLength={500}
      placeholder={contenu.nom}
      spellCheck={false}
      onPointerDown={garder}
      onChange={(e) => {
        setTexte(e.target.value)
        const v = e.target.value.trim()
        ecrire(v === '' || v === contenu.nom ? sansTitre(contenu) : { ...contenu, titre: v })
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          finir()
        }
      }}
    />
  )
}

export function OutilsFichier({ elements, contexte }: PropsOutils<Fichier>) {
  if (elements.length !== 1) return null
  const el = elements[0]!
  return (
    <>
      {!contexte.services.lectureSeule && (
        <button type="button" title="Renommer le fichier" onClick={() => contexte.commencerEdition(el.id)}>
          Renommer
        </button>
      )}
      <button type="button" title="Ouvrir dans un nouvel onglet" onClick={() => void ouvrirFichier(el.contenu, contexte)}>
        Ouvrir
      </button>
    </>
  )
}

export async function ouvrirFichier(c: Fichier, contexte: PropsOutils['contexte']) {
  const a = await contexte.services.fichiers?.adresse(c.fichier)
  if (a) window.open(a, '_blank', 'noopener,noreferrer')
}
