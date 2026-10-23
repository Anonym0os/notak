import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Element, Image, TraitImage } from '../../coeur/tableau'
import { useFichier } from '../envois'
import type { ContexteToile, PropsOutils, PropsRendu } from '../types'
import { PX_PAR_UG } from '../../coeur/camera'
import { aUneOmbre, avecLegende, hauteurCalee, miseEnPage, pivoter, proportionsAffichees } from './geometrie'
import { Recadreur, recadrer, useRecadrageOuvert } from './Recadreur'
import { Annotateur, Traits } from './Annotateur'
import { Detoureur, detourerImage, useDetourageOuvert } from './Detoureur'
import { sansDetourage } from './detourage'
import { annoter, choisirCouleur, choisirOutil, useAnnotation } from './modeAnnotation'
import { COULEURS_TRAIT, avecTraits } from './annotation'
import { adresseALargeur, finesse, largeurCadrePx, largeurEntiereAffichee, palierPour } from './tailles'
import { Visionneuse, useImageOuverte } from './visionneuse'
import { t } from '../../langue'
import { BoutonOutil, ContexteOutils, OutilAvecMenu } from '../../BoutonOutil'
import { useMenu } from '../../menuUnique'

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
          <div className="notak-image notak-image-vide">{adresse === null && <span>{t('image.introuvable')}</span>}</div>
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
            {contenu.legende || t('note.legende')}
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
      placeholder={t('note.legende')}
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
  const enDetourage = useDetourageOuvert() === el.id
  const { aGauche } = useContext(ContexteOutils)
  const menuTrait = useMenu()
  const seul = elements.length === 1 && !contexte.services.lectureSeule
  const pastilles = COULEURS_TRAIT.map((c) => (
    <button
      key={c}
      type="button"
      className="notak-pastille-trait"
      style={{ background: c }}
      aria-label={t('image.couleurTrait', { couleur: c })}
      aria-pressed={dessin.outil === 'crayon' && dessin.couleur === c}
      onClick={() => choisirCouleur(c)}
    />
  ))
  return (
    <>
      {!contexte.services.lectureSeule && <BoutonOutil icone="pivoter" titre={t('image.pivoter.titre')} libelle={t('image.pivoter')} onClick={pivoterTout} />}
      {seul && <BoutonOutil icone="recadrer" titre={t('image.recadrer.titre')} libelle={t('image.recadrer')} actif={!!el.contenu.recadrage} onClick={() => recadrer(el.id)} />}
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
      {seul && <BoutonOutil icone="croquis" titre={t('image.dessiner.titre')} libelle={t('croquis.dessiner')} actif={enDessin} onClick={() => annoter(enDessin ? null : el.id)} />}
      {enDessin && (
        <>
          <BoutonOutil icone="croquis" libelle={t('dessin.crayon')} actif={dessin.outil === 'crayon'} onClick={() => choisirOutil('crayon')} />
          <BoutonOutil icone="gomme" titre={t('image.gommeTitre')} libelle={t('dessin.gomme')} actif={dessin.outil === 'gomme'} onClick={() => choisirOutil('gomme')} />
          {aGauche ? (
            <OutilAvecMenu menu={menuTrait} icone="palette" pastille={dessin.couleur} libelle={t('couleur.titre')}>
              <div className="notak-note-palette" role="menu">
                <div className="notak-note-pastilles">{pastilles}</div>
              </div>
            </OutilAvecMenu>
          ) : (
            pastilles
          )}
          {!!el.contenu.traits?.length && (
            <BoutonOutil
              icone="retirer"
              secondaire
              titre={t('image.effacerTraits')}
              libelle={t('dessin.toutEffacer')}
              onClick={() => contexte.magasin.faire([{ type: 'contenu', id: el.id, avant: el.contenu, apres: avecTraits(el.contenu, []) }])}
            />
          )}
        </>
      )}
      {elements.length === 1 && (
        <BoutonOutil icone="legende" secondaire titre={t('image.ajouterLegende')} libelle={t('note.legende')} actif={!!el.contenu.legende} onClick={() => contexte.commencerEdition(el.id)} />
      )}
    </>
  )
}
