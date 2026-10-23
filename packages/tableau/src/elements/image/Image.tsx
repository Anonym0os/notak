import { useLayoutEffect, useRef, useState } from 'react'
import type { Image } from '../../coeur/tableau'
import { useFichier } from '../envois'
import type { PropsOutils, PropsRendu } from '../types'
import { PX_PAR_UG } from '../../coeur/camera'
import { aUneOmbre, avecLegende, hauteurCalee } from './geometrie'
import { Visionneuse, useImageOuverte } from './visionneuse'

export function RenduImage({ element, enEdition, contexte, brouillon }: PropsRendu<Image>) {
  const { contenu } = element
  const { adresse, enRoute } = useFichier(element, contexte)
  const proportions = contenu.largeurOrigine / contenu.hauteurOrigine
  // Sur la toile, la hauteur tombe sur la grille ; dans une colonne, dont la largeur n'est pas la nôtre, elle suit les proportions.
  const forme = element.parent === undefined
    ? { height: hauteurCalee(element.largeur, proportions) * PX_PAR_UG }
    : { aspectRatio: String(proportions) }
  const enGrand = useImageOuverte() === element.id
  return (
    <>
      {enRoute && (
        <span className="notak-envoi" role="status" aria-label="Envoi en cours">
          <span className="notak-roue" />
        </span>
      )}
      {enGrand && adresse && <Visionneuse adresse={adresse} {...(contenu.legende ? { legende: contenu.legende } : {})} />}
      <div className="notak-image-cadre" data-ombre={aUneOmbre(contenu.typeMime, contenu.transparente) || undefined} style={forme}>
        {adresse ? (
          <img
            className="notak-image"
            data-en-route={enRoute || undefined}
            src={adresse}
            alt={contenu.legende ?? ''}
            draggable={false}
          />
        ) : (
          <div className="notak-image notak-image-vide">{adresse === null && <span>Image introuvable</span>}</div>
        )}
      </div>
      {enEdition ? (
        <Legende
          texte={contenu.legende ?? ''}
          surChangement={(t) => brouillon(avecLegende(contenu, t))}
          valider={contexte.finirEdition}
        />
      ) : (
        contenu.legende && <p className="notak-legende">{contenu.legende}</p>
      )}
    </>
  )
}

/** Un `textarea` d'une ligne qui grandit avec son texte. Entrée valide. */
function Legende({ texte, surChangement, valider }: { texte: string; surChangement(t: string): void; valider(): void }) {
  const [valeur, setValeur] = useState(texte)
  const champ = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const c = champ.current!
    c.style.height = 'auto'
    c.style.height = `${c.scrollHeight}px`
  }, [valeur])
  return (
    <textarea
      ref={champ}
      className="notak-legende notak-legende-champ"
      rows={1}
      value={valeur}
      autoFocus
      placeholder="Légende"
      onFocus={(e) => e.currentTarget.setSelectionRange(valeur.length, valeur.length)}
      onChange={(e) => {
        const v = e.target.value.replace(/\n/g, ' ')
        setValeur(v)
        surChangement(v)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter') return
        e.preventDefault()
        e.stopPropagation()
        valider()
      }}
    />
  )
}

export function OutilsImage({ elements, contexte }: PropsOutils<Image>) {
  if (elements.length !== 1) return null
  const el = elements[0]!
  return (
    <button
      type="button"
      title="Ajouter une légende"
      aria-pressed={!!el.contenu.legende}
      onClick={() => contexte.commencerEdition(el.id)}
    >
      Légende
    </button>
  )
}
