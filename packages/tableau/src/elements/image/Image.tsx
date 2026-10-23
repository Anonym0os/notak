import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Element, Image, TraitImage } from '../../coeur/tableau'
import { useFichier } from '../envois'
import type { ContexteToile, PropsOutils, PropsRendu } from '../types'
import { PX_PAR_UG } from '../../coeur/camera'
import { aUneCarte, avecLegende, hauteurCartePx, miseEnPage, pivoter, proportionsAffichees } from './geometrie'
import { prendreAmorce } from './legendeAmorce'
import { Recadreur, recadrer, useRecadrageOuvert } from './Recadreur'
import { Annotateur, Traits } from './Annotateur'
import { Detoureur, detourerImage, useDetourageOuvert } from './Detoureur'
import { sansDetourage } from './detourage'
import { annoter, useAnnotation } from './modeAnnotation'
import { adresseALargeur, finesse, largeurCadrePx, largeurEntiereAffichee, palierPour } from './tailles'
import { Visionneuse, useImageOuverte } from './visionneuse'
import { t } from '../../langue'
import { BoutonOutil } from '../../BoutonOutil'
import { Icone } from '../../icones'

/** En dessous de cette largeur (UG), l'image n'est plus qu'un média : sa légende est masquée, comme chez Milanote. */
export const LARGEUR_LEGENDE_MIN = 8

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
  // Sur la toile, la hauteur tombe sur la grille (l'image est rognée, jamais étirée) ; dans une colonne, dont la
  // largeur n'est pas la nôtre, elle suit les proportions.
  const forme = element.parent === undefined
    ? { height: hauteurCartePx(element.largeur, proportions, contenu.proportionsExactes) }
    : { aspectRatio: String(proportions) }
  const legendeVisible = enEdition || (element.largeur >= LARGEUR_LEGENDE_MIN && (!!contenu.legende || !!contenu.legendeAffichee))
  const enGrand = useImageOuverte() === element.id
  const enRecadrage = useRecadrageOuvert() === element.id
  const enDetourage = useDetourageOuvert() === element.id
  const enDessin = useAnnotation().id === element.id && !contexte.services.lectureSeule && !enRecadrage && !enDetourage
  // Les traits tels qu'ils seront à la fin du geste en cours (tracé, gomme) ; `null` : ceux du tableau.
  const [enCours, setEnCours] = useState<TraitImage[] | null>(null)
  const traits = enCours ?? contenu.traits
  // On ne règle que l'image qu'on a sous la main : choisir autre chose referme le réglage.
  useEffect(() => {
    if (enRecadrage && !choisie) recadrer(null)
  }, [enRecadrage, choisie])
  // Même chose pour le dessin : on ne dessine que sur l'image qu'on a sous la main.
  const dessine = useAnnotation().id === element.id
  useEffect(() => {
    if (dessine && (!choisie || enRecadrage || enDetourage || enEdition)) annoter(null)
  }, [dessine, choisie, enRecadrage, enDetourage, enEdition])
  // Et pour le détourage.
  useEffect(() => {
    if (enDetourage && (!choisie || enRecadrage || contexte.services.lectureSeule)) detourerImage(null)
  }, [enDetourage, choisie, enRecadrage, contexte.services.lectureSeule])
  if (enRecadrage && adresseOrigine) return <Recadreur id={element.id} contenu={contenu} adresse={adresseOrigine} contexte={contexte} />
  if (enDetourage && adresseOrigine) return <Detoureur id={element.id} contenu={contenu} adresse={adresseOrigine} contexte={contexte} />
  return (
    <>
      {enRoute && (
        <span className="notak-envoi" role="status" aria-label={t('image.envoiEnCours')}>
          <span className="notak-roue" />
        </span>
      )}
      {enGrand && adresseOrigine && <Visionneuse adresse={adresseOrigine} {...(contenu.legende ? { legende: contenu.legende } : {})} />}
      <div className="notak-image-cadre" style={forme}>
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
          <div className="notak-image notak-image-vide">
            {adresse === null && (
              <span role="img" aria-label={t('image.introuvable')}>
                <Icone nom="imageCassee" taille={forme.height !== undefined && forme.height < 60 ? 20 : 32} trait={1.5} />
              </span>
            )}
          </div>
        )}
        {enDessin && adresse && <Annotateur element={element} contexte={contexte} brouillon={setEnCours} />}
      </div>
      {enEdition && legendeVisible ? (
        <Legende
          texte={contenu.legende ?? ''}
          surChangement={(t) => brouillon(avecLegende(contenu, t))}
          retirer={() => {
            const { legendeAffichee: _, ...reste } = avecLegende(contenu, '')
            brouillon(reste)
            contexte.finirEdition()
          }}
          valider={contexte.finirEdition}
        />
      ) : (
        // Une image choisie s'écrit sous le doigt : un clic sur sa légende, ou sur l'invite quand elle n'en a pas.
        legendeVisible && (
          <p
            className="notak-legende"
            data-vide={contenu.legende ? undefined : ''}
            onPointerDown={(e) => choisie && e.stopPropagation()}
            onClick={() => choisie && !contexte.services.lectureSeule && contexte.commencerEdition(element.id)}
          >
            {contenu.legende || t('note.legende')}
          </p>
        )
      )}
    </>
  )
}

/**
 * Un `textarea` d'une ligne qui grandit avec son texte. Entrée valide ; Retour arrière sur une légende vide la retire.
 * Un caractère tapé sur l'image choisie en est le début (voir `legendeAmorce`).
 */
function Legende({ texte, surChangement, valider, retirer }: { texte: string; surChangement(t: string): void; valider(): void; retirer(): void }) {
  const [valeur, setValeur] = useState(texte)
  const champ = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const c = champ.current!
    c.style.height = 'auto'
    c.style.height = `${c.scrollHeight}px`
  }, [valeur])
  useEffect(() => {
    const debut = prendreAmorce()
    if (!debut) return
    setValeur((v) => v + debut)
    surChangement(texte + debut)
    // Une fois, à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <textarea
      ref={champ}
      className="notak-legende notak-legende-champ"
      rows={1}
      value={valeur}
      autoFocus
      placeholder={t('note.legende')}
      onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
      onChange={(e) => {
        const v = e.target.value.replace(/\n/g, ' ')
        setValeur(v)
        surChangement(v)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Backspace' && valeur === '') {
          e.preventDefault()
          e.stopPropagation()
          return retirer()
        }
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
  const enDetourage = useDetourageOuvert() === el.id
  const seul = elements.length === 1 && !contexte.services.lectureSeule
  // L'outil « Transparent » ne vaut que pour une image à canal alpha : il cache ou rend sa carte blanche.
  const transparentes = elements.filter((e) => !aUneCarte({ ...e.contenu, fondBlanc: false }))
  const fondRendu = transparentes.length > 0 && transparentes.every((e) => e.contenu.fondBlanc)
  const basculerFond = () =>
    contexte.magasin.faire(
      transparentes.map((e) => {
        const { fondBlanc: _, ...reste } = e.contenu
        return { type: 'contenu' as const, id: e.id, avant: e.contenu, apres: fondRendu ? reste : { ...reste, fondBlanc: true } }
      }),
    )
  return (
    <>
      {/* L'ordre de Milanote : Transparent, Dessiner dessus ; la légende vient après l'arrangement (`OutilsFinImage`). Pivoter, Recadrer et Détourer n'ont pas d'équivalent dans sa barre : « ••• ». */}
      {transparentes.length > 0 && !contexte.services.lectureSeule && (
        <BoutonOutil icone="fondBlanc" titre={t('image.transparent.titre')} libelle={t('image.transparent')} actif={!fondRendu} onClick={basculerFond} />
      )}
      {seul && (
        <BoutonOutil
          icone="croquis"
          titre={t('image.dessiner.titre')}
          libelle={el.contenu.traits?.length ? t('image.modifierDessin') : t('image.dessinerDessus')}
          actif={enDessin}
          onClick={() => annoter(enDessin ? null : el.id)}
        />
      )}
      {!contexte.services.lectureSeule && <BoutonOutil icone="pivoterGauche" secondaire titre={t('image.pivoter.titre')} libelle={t('image.pivoter')} onClick={pivoterTout} />}
      {seul && <BoutonOutil icone="recadrer" secondaire titre={t('image.recadrer.titre')} libelle={t('image.recadrer')} actif={!!el.contenu.recadrage} onClick={() => recadrer(el.id)} />}
      {seul && !!contexte.services.fichiers && (
        <BoutonOutil
          icone="detourer"
          secondaire
          titre={t('image.detourer.titre')}
          libelle={t('image.detourer')}
          actif={enDetourage || !!el.contenu.original}
          onClick={() => detourerImage(enDetourage ? null : el.id)}
        />
      )}
      {seul && !!el.contenu.original && (
        <BoutonOutil
          icone="original"
          secondaire
          titre={t('image.retablir.titre')}
          libelle={t('image.retablir')}
          onClick={() => contexte.magasin.faire([{ type: 'contenu', id: el.id, avant: el.contenu, apres: sansDetourage(el.contenu) }])}
        />
      )}
    </>
  )
}

/**
 * La légende : la dernière tuile, après l'arrangement. Elle l'affiche pour toutes les images choisies ; pour une
 * seule, elle entre aussi dans son écriture. Grisée sous 8 UG de large, où l'image n'est plus qu'un média.
 */
export function OutilsFinImage({ elements, contexte }: PropsOutils<Image>) {
  if (contexte.services.lectureSeule) return null
  const afficher = () => {
    const sans = elements.filter((e) => !e.contenu.legende && !e.contenu.legendeAffichee)
    if (sans.length > 0) contexte.magasin.faire(sans.map((e) => ({ type: 'contenu' as const, id: e.id, avant: e.contenu, apres: { ...e.contenu, legendeAffichee: true } })))
    if (elements.length === 1) contexte.commencerEdition(elements[0]!.id)
  }
  const etroites = elements.every((e) => e.largeur < LARGEUR_LEGENDE_MIN)
  return (
    <BoutonOutil
      icone="legende"
      titre={t('image.ajouterLegende')}
      libelle={t('note.legende')}
      actif={elements.some((e) => !!e.contenu.legende || !!e.contenu.legendeAffichee)}
      desactive={etroites}
      onClick={afficher}
    />
  )
}
