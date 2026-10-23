import { useEffect, useMemo, useRef, useState } from 'react'
import type { Fichier } from '../../coeur/tableau'
import { useFichier } from '../envois'
import type { PropsOutils, PropsRendu } from '../types'
import { ICONE_DU_GENRE, aApercuAbsent, adresseApercuPdf, apercuDe, genreDe, lisible, seLitEnLigne, tailleLisible } from './genre'
import { t } from '../../langue'
import { annoncer } from '../../avis'
import { Icone } from '../../icones'
import { BoutonOutil } from '../../BoutonOutil'
import { LecteurSon, LecteurVideo } from './lecteur'
import { ModaleFichier } from './ModaleFichier'
import { ouvrirFenetreFichier, prendreAmorce, prendreCible, useFichierOuvert, viserEdition } from './ouverture'

/** La largeur d'un fichier en icône (une feuille et son nom) et d'une carte détaillée, en UG. */
export const LARGEUR_ICONE = 10
export const LARGEUR_CARTE = 34

const sansTitre = ({ titre: _, ...reste }: Fichier): Fichier => reste
/** Les liens et les lecteurs de la carte ne lancent pas de glisser. */
const garder = (e: React.PointerEvent) => e.stopPropagation()

/** Une feuille de papier au coin plié ; le pictogramme de la famille du fichier y tient. `grande` : celle du mode icône. */
function Feuille({ genre, grande }: { genre: keyof typeof ICONE_DU_GENRE; grande?: boolean }) {
  const [l, h, pli] = grande ? [56, 72, 16] : [32, 40, 10]
  return (
    <span className={grande ? 'notak-feuille notak-feuille-grande' : 'notak-feuille'} aria-hidden>
      <svg className="notak-feuille-dessin" width={l} height={h} viewBox={`0 0 ${l} ${h}`}>
        {/* Le contour de sélection suit le papier, coin plié compris : un trait de 4 px sous la feuille, dont 2 dépassent. */}
        {grande && <path className="notak-feuille-contour" d={`M0 0H${l - pli}L${l} ${pli}V${h}H0Z`} />}
        <path className="notak-feuille-papier" d={`M${grande ? 0 : 0.75} ${grande ? 0 : 0.75}H${l - pli}L${grande ? l : l - 0.75} ${pli}V${grande ? h : h - 0.75}H${grande ? 0 : 0.75}Z`} />
        <path className="notak-feuille-pli" d={`M${l - pli} ${grande ? 0 : 0.75}V${pli}H${grande ? l : l - 0.75}`} />
      </svg>
      <Icone nom={ICONE_DU_GENRE[genre]} taille={grande ? 30 : 16} trait={grande ? 1.5 : 1.75} />
    </span>
  )
}

export function RenduFichier({ element, enEdition, contexte, brouillon }: PropsRendu<Fichier>) {
  const c = element.contenu
  const { adresse, enRoute } = useFichier(element, contexte)
  const genre = genreDe(c.nom, c.typeMime)
  const enGrand = useFichierOuvert() === element.id
  const dansColonne = element.parent !== undefined
  // La carte détaillée montre l'aperçu et le lecteur, sauf si on les a masqués ; l'icône n'a ni l'un ni l'autre.
  const apercu = c.sansApercu ? null : apercuDe(c.nom, c.typeMime, c.icone)
  const lecteur = c.icone || c.sansApercu ? null : lisible(c.typeMime)
  const sansApercuDispo = !c.icone && !c.sansApercu && !apercu && !lecteur && aApercuAbsent(c.nom, c.typeMime)
  const ouvrable = seLitEnLigne(c.nom, c.typeMime)
  // « Renommer » et « Légende » ouvrent la même édition ; la cible dit où poser le curseur.
  const cible = useMemo(() => (enEdition ? prendreCible() : 'nom'), [enEdition])

  const tailleEtat = (
    <>
      {enRoute && (
        <>
          <span className="notak-roue" aria-hidden /> {t('fichier.envoi')}
          {' - '}
        </>
      )}
      {tailleLisible(c.taille)}
    </>
  )
  const titre = enEdition ? (
    <Nom contenu={c} ecrire={brouillon} finir={contexte.finirEdition} focus={cible === 'nom'} />
  ) : (
    <span className="notak-fichier-nom" title={c.nom}>
      {c.titre ?? c.nom}
    </span>
  )

  return (
    <div className="notak-fichier" data-genre={genre} data-feuille={c.icone || undefined} data-colonne={dansColonne || undefined}>
      {enGrand && adresse && <ModaleFichier contenu={c} adresse={adresse} />}
      {c.icone ? (
        <>
          <Feuille genre={genre} grande />
          <div className="notak-fichier-texte">
            {titre}
            <span className="notak-fichier-details">
              {tailleEtat}
              {adresse === null && ` - ${t('fichier.introuvable')}`}
            </span>
          </div>
        </>
      ) : (
        <>
          {apercu === 'pdf' && adresse && !enRoute && (
            // La première page seulement ; le cadre n'attrape pas le pointeur, la carte reste glissable.
            <iframe className="notak-fichier-pdf" title={t('fichier.premierePage', { nom: c.titre ?? c.nom })} src={adresseApercuPdf(adresse)} loading="lazy" tabIndex={-1} />
          )}
          {apercu === 'image' && adresse && <img className="notak-fichier-image" src={adresse} alt="" draggable={false} />}
          {apercu === 'video' && lecteur !== 'video' && adresse && <video className="notak-fichier-video" src={adresse} preload="metadata" />}
          {lecteur === 'video' && adresse && <LecteurVideo adresse={adresse} boucle={!!c.boucle} auto={!!c.lectureAuto} />}
          {sansApercuDispo && (
            <div className="notak-fichier-sans-apercu">
              <Icone nom={ICONE_DU_GENRE[genre]} taille={64} trait={1} />
              <span>{t('fichier.aucunApercu')}</span>
            </div>
          )}
          {lecteur === 'son' && adresse && <LecteurSon adresse={adresse} boucle={!!c.boucle} auto={!!c.lectureAuto} />}
          {!c.sansInfos && (
            <div className="notak-fichier-meta" data-apercu={apercu || lecteur || sansApercuDispo || undefined}>
              <Feuille genre={genre} />
              <div className="notak-fichier-infos">
                {titre}
                <span className="notak-fichier-details">
                  {adresse && !enRoute && (
                    <>
                      <a href={adresse} download={c.nom} onPointerDown={garder}>
                        {t('fichier.telecharger')}
                      </a>
                      {' - '}
                      {ouvrable && (
                        <>
                          <button type="button" className="notak-fichier-lien" onPointerDown={garder} onClick={() => ouvrirFenetreFichier(element.id)}>
                            {t('commun.ouvrir')}
                          </button>
                          {' - '}
                        </>
                      )}
                    </>
                  )}
                  {tailleEtat}
                  {adresse === null && ` - ${t('fichier.introuvable')}`}
                </span>
              </div>
            </div>
          )}
          {!c.sansInfos &&
            (enEdition ? (
              <Legende contenu={c} ecrire={brouillon} finir={contexte.finirEdition} focus={cible === 'legende'} />
            ) : (
              c.legende && <div className="notak-fichier-legende">{c.legende}</div>
            ))}
        </>
      )}
    </div>
  )
}

/** Le nom en cours d'écriture, tout choisi ; vidé, le fichier reprend son nom d'origine. */
function Nom({ contenu, ecrire, finir, focus }: { contenu: Fichier; ecrire(c: Fichier): void; finir(): void; focus: boolean }) {
  const [texte, setTexte] = useState(contenu.titre ?? contenu.nom)
  const champ = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!focus) return
    champ.current?.focus()
    champ.current?.select()
  }, [focus])
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

/** La légende sous la carte ; vidée, elle disparaît. Entrée ferme. */
function Legende({ contenu, ecrire, finir, focus }: { contenu: Fichier; ecrire(c: Fichier): void; finir(): void; focus: boolean }) {
  // Un caractère tapé sur la carte choisie en est le début.
  const debut = useRef(focus ? prendreAmorce() : '')
  useEffect(() => {
    if (!debut.current) return
    const { legende: _, ...reste } = contenu
    ecrire({ ...reste, legende: `${contenu.legende ?? ''}${debut.current}`.trim() })
    // Une fois, à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <input
      autoFocus={focus}
      className="notak-fichier-legende notak-fichier-champ"
      aria-label={t('note.legende')}
      placeholder={t('fichier.legendePoints')}
      maxLength={500}
      defaultValue={`${contenu.legende ?? ''}${debut.current}`}
      onPointerDown={garder}
      onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
      onChange={(e) => {
        const { legende: _, ...reste } = contenu
        const v = e.target.value.trim()
        ecrire(v ? { ...reste, legende: v } : reste)
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

/**
 * Les outils d'un fichier, dans l'ordre de Milanote : Mode d'affichage (icône ou carte), Aperçu, Renommer, Légende,
 * Infos du fichier, puis Boucle et Lecture auto pour le son et la vidéo. Renommer et Légende n'ont pas de sens en icône
 * ni sans les infos. Plusieurs fichiers : le mode seulement, qui vaut pour tous.
 */
export function OutilsFichier({ elements, contexte }: PropsOutils<Fichier>) {
  if (contexte.services.lectureSeule) return null
  const el = elements[0]!
  const c = el.contenu
  const seul = elements.length === 1
  const toutIcone = elements.every((e) => e.contenu.icone)
  // Passer d'un mode à l'autre change aussi la largeur : 10 UG pour une feuille, 34 pour une carte.
  const basculerMode = () =>
    contexte.magasin.faire(
      elements.flatMap((e) => {
        const { icone: _, ...reste } = e.contenu
        const vers = toutIcone ? LARGEUR_CARTE : LARGEUR_ICONE
        return [
          { type: 'contenu' as const, id: e.id, avant: e.contenu, apres: toutIcone ? reste : { ...reste, icone: true } },
          ...(e.largeur !== vers ? [{ type: 'redimensionner' as const, id: e.id, de: e.largeur, vers }] : []),
        ]
      }),
    )
  const bascule = (cle: 'sansApercu' | 'sansInfos' | 'boucle' | 'lectureAuto') => () =>
    contexte.magasin.faire(
      elements.map((e) => {
        const { [cle]: valeur, ...reste } = e.contenu
        return { type: 'contenu' as const, id: e.id, avant: e.contenu, apres: valeur ? reste : { ...reste, [cle]: true } }
      }),
    )
  const carte = seul && !c.icone
  const aApercu = carte && (apercuDe(c.nom, c.typeMime, false) !== null || lisible(c.typeMime) !== null)
  const media = carte && lisible(c.typeMime) !== null
  const modifier = (cible: 'nom' | 'legende') => () => {
    viserEdition(cible)
    contexte.commencerEdition(el.id)
  }
  return (
    <>
      <BoutonOutil icone={toutIcone ? 'fichier' : 'reduire'} titre={toutIcone ? t('fichier.montrerApercu') : t('fichier.reduire')} libelle={toutIcone ? t('fichier.vueCarte') : t('tableau.icone')} onClick={basculerMode} />
      {aApercu && <BoutonOutil icone="oeil" titre={t('fichier.apercu.titre')} libelle={t('fichier.apercu')} actif={!c.sansApercu} onClick={bascule('sansApercu')} />}
      {carte && !c.sansInfos && <BoutonOutil icone="modifier" titre={t('fichier.renommer.titre')} libelle={t('menu.renommer')} onClick={modifier('nom')} />}
      {carte && !c.sansInfos && <BoutonOutil icone="legende" titre={t('image.ajouterLegende')} libelle={t('note.legende')} actif={!!c.legende} onClick={modifier('legende')} />}
      {carte && <BoutonOutil icone="infos" titre={t('fichier.infos.titre')} libelle={t('fichier.infos')} actif={!c.sansInfos} onClick={bascule('sansInfos')} />}
      {media && !c.sansApercu && <BoutonOutil icone="boucle" titre={t('fichier.boucle.titre')} libelle={t('fichier.boucle')} actif={!!c.boucle} onClick={bascule('boucle')} />}
      {media && !c.sansApercu && <BoutonOutil icone="lecture" titre={t('fichier.lectureAuto.titre')} libelle={t('fichier.lectureAuto')} actif={!!c.lectureAuto} onClick={bascule('lectureAuto')} />}
    </>
  )
}

export async function ouvrirFichier(c: Fichier, contexte: PropsOutils['contexte']) {
  const a = await contexte.services.fichiers?.adresse(c.fichier)
  if (a) window.open(a, '_blank', 'noopener,noreferrer')
}

/** L'adresse du fichier, absolue, au presse-papiers ; sans presse-papiers, on ouvre le fichier. */
export async function copierLienFichier(c: Fichier, contexte: PropsOutils['contexte']) {
  const a = await contexte.services.fichiers?.adresse(c.fichier)
  if (!a) return
  try {
    await navigator.clipboard.writeText(new URL(a, window.location.href).href)
    annoncer({ texte: t('fichier.lienCopie') })
  } catch {
    window.open(a, '_blank', 'noopener,noreferrer')
  }
}
