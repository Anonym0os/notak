import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Element, Image, Trait } from '../../coeur/tableau'
import { useFichier } from '../envois'
import type { ContexteToile, PropsOutils, PropsRendu } from '../types'
import { PX_PAR_UG } from '../../coeur/camera'
import { aUneOmbre, avecLegende, hauteurCalee, miseEnPage, pivoter, proportionsAffichees } from './geometrie'
import { Recadreur, recadrer, useRecadrageOuvert } from './Recadreur'
import { Annotateur, Traits } from './Annotateur'
import { annoter, choisirCouleur, choisirOutil, useAnnotation } from './modeAnnotation'
import { COULEURS_TRAIT, avecTraits } from './annotation'
import { adresseALargeur, finesse, largeurCadrePx, largeurEntiereAffichee, palierPour } from './tailles'
import { Visionneuse, useImageOuverte } from './visionneuse'

/**
 * L'adresse du fichier à la taille que l'affichage demande : le plus petit palier net pour la largeur à l'écran,
 * au zoom et à la densité d'ici. On ne revient jamais à plus petit en reculant : la copie plus grande est déjà là.
 */
function useAdresseALargeur(element: Element<Image>, contexte: ContexteToile, adresse: string | null | undefined) {
  const garde = useRef({ fichier: '', palier: 0 as number | null })
  const { contenu } = element
  if (garde.current.fichier !== contenu.fichier) garde.current = { fichier: contenu.fichier, palier: 0 }
  if (!adresse) return adresse
  const cadre = largeurCadrePx(element.largeur, element.parent !== undefined, PX_PAR_UG, contexte.camera.echelle)
  const palier = palierPour(contenu, largeurEntiereAffichee(contenu, cadre), window.devicePixelRatio || 1)
  if (finesse(palier) > finesse(garde.current.palier)) garde.current.palier = palier
  return adresseALargeur(adresse, garde.current.palier)
}

export function RenduImage({ element, choisie, enEdition, contexte, brouillon }: PropsRendu<Image>) {
  const { contenu } = element
  const { adresse: adresseOrigine, enRoute } = useFichier(element, contexte)
  const adresse = useAdresseALargeur(element, contexte, adresseOrigine)
  const proportions = proportionsAffichees(contenu)
  const page = miseEnPage(contenu)
  // Sur la toile, la hauteur tombe sur la grille ; dans une colonne, dont la largeur n'est pas la nôtre, elle suit les proportions.
  const forme = element.parent === undefined
    ? { height: hauteurCalee(element.largeur, proportions) * PX_PAR_UG }
    : { aspectRatio: String(proportions) }
  const enGrand = useImageOuverte() === element.id
  const enRecadrage = useRecadrageOuvert() === element.id
  const enDessin = useAnnotation().id === element.id && !contexte.services.lectureSeule && !enRecadrage
  // Les traits tels qu'ils seront à la fin du geste en cours (tracé, gomme) ; `null` : ceux du tableau.
  const [enCours, setEnCours] = useState<Trait[] | null>(null)
  const traits = enCours ?? contenu.traits
  // On ne règle que l'image qu'on a sous la main : choisir autre chose referme le réglage.
  useEffect(() => {
    if (enRecadrage && !choisie) recadrer(null)
  }, [enRecadrage, choisie])
  // Même chose pour le dessin : on ne dessine que sur l'image qu'on a sous la main.
  const dessine = useAnnotation().id === element.id
  useEffect(() => {
    if (dessine && (!choisie || enRecadrage || enEdition)) annoter(null)
  }, [dessine, choisie, enRecadrage, enEdition])
  if (enRecadrage && adresseOrigine) return <Recadreur id={element.id} contenu={contenu} adresse={adresseOrigine} contexte={contexte} />
  return (
    <>
      {enRoute && (
        <span className="notak-envoi" role="status" aria-label="Envoi en cours">
          <span className="notak-roue" />
        </span>
      )}
      {enGrand && adresseOrigine && <Visionneuse adresse={adresseOrigine} {...(contenu.legende ? { legende: contenu.legende } : {})} />}
      <div className="notak-image-cadre" data-ombre={aUneOmbre(contenu.typeMime, contenu.transparente) || undefined} style={forme}>
        {adresse ? (
          <div className="notak-image-plan" style={page.plan}>
            <img
              className="notak-image"
              data-en-route={enRoute || undefined}
              src={adresse}
              alt={contenu.legende ?? ''}
              draggable={false}
              style={page.image}
            />
            {traits && traits.length > 0 && <Traits contenu={contenu} traits={traits} style={page.image} />}
          </div>
        ) : (
          <div className="notak-image notak-image-vide">{adresse === null && <span>Image introuvable</span>}</div>
        )}
        {enDessin && adresse && <Annotateur element={element} contexte={contexte} brouillon={setEnCours} />}
      </div>
      {enEdition ? (
        <Legende
          texte={contenu.legende ?? ''}
          surChangement={(t) => brouillon(avecLegende(contenu, t))}
          valider={contexte.finirEdition}
        />
      ) : (
        // Une image choisie s'écrit sous le doigt : un clic sur sa légende, ou sur l'invite quand elle n'en a pas.
        (contenu.legende || (choisie && !contexte.services.lectureSeule)) && (
          <p
            className="notak-legende"
            data-vide={contenu.legende ? undefined : ''}
            onPointerDown={(e) => choisie && e.stopPropagation()}
            onClick={() => choisie && !contexte.services.lectureSeule && contexte.commencerEdition(element.id)}
          >
            {contenu.legende || 'Légende'}
          </p>
        )
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
  const pivoterTout = () =>
    contexte.magasin.faire(elements.map((e) => ({ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: pivoter(e.contenu) })))
  const el = elements[0]!
  const dessin = useAnnotation()
  const enDessin = elements.length === 1 && dessin.id === el.id && !contexte.services.lectureSeule
  return (
    <>
      {!contexte.services.lectureSeule && (
        <button type="button" title="Tourner d’un quart de tour vers la droite" onClick={pivoterTout}>
          Pivoter
        </button>
      )}
      {elements.length === 1 && !contexte.services.lectureSeule && (
        <button type="button" title="Garder une partie de l’image" aria-pressed={!!el.contenu.recadrage} onClick={() => recadrer(el.id)}>
          Recadrer
        </button>
      )}
      {elements.length === 1 && !contexte.services.lectureSeule && (
        <button
          type="button"
          title="Dessiner sur l’image (Maj+D)"
          aria-pressed={enDessin}
          onClick={() => annoter(enDessin ? null : el.id)}
        >
          Dessiner
        </button>
      )}
      {enDessin && (
        <>
          <button type="button" aria-pressed={dessin.outil === 'crayon'} onClick={() => choisirOutil('crayon')}>
            Crayon
          </button>
          <button type="button" aria-pressed={dessin.outil === 'gomme'} title="Effacer le trait qu’on touche" onClick={() => choisirOutil('gomme')}>
            Gomme
          </button>
          {COULEURS_TRAIT.map((c) => (
            <button
              key={c}
              type="button"
              className="notak-pastille-trait"
              style={{ background: c }}
              aria-label={`Couleur ${c}`}
              aria-pressed={dessin.outil === 'crayon' && dessin.couleur === c}
              onClick={() => choisirCouleur(c)}
            />
          ))}
          {!!el.contenu.traits?.length && (
            <button
              type="button"
              title="Effacer tous les traits"
              onClick={() => contexte.magasin.faire([{ type: 'contenu', id: el.id, avant: el.contenu, apres: avecTraits(el.contenu, []) }])}
            >
              Tout effacer
            </button>
          )}
        </>
      )}
      {elements.length === 1 && (
        <button
          type="button"
          title="Ajouter une légende"
          aria-pressed={!!el.contenu.legende}
          onClick={() => contexte.commencerEdition(el.id)}
        >
          Légende
        </button>
      )}
    </>
  )
}
