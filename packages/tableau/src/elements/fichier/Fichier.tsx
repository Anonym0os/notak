import { useEffect, useRef, useState } from 'react'
import type { Fichier } from '../../coeur/tableau'
import { useFichier } from '../envois'
import type { PropsOutils, PropsRendu } from '../types'
import { ICONE_DU_GENRE, adresseApercuPdf, apercuDe, extensionDe, genreDe, lisible, tailleLisible } from './genre'
import { t } from '../../langue'
import { Icone } from '../../icones'
import { BoutonOutil } from '../../BoutonOutil'

const sansTitre = ({ titre: _, ...reste }: Fichier): Fichier => reste
/** Les liens et les lecteurs de la carte ne lancent pas de glisser. */
const garder = (e: React.PointerEvent) => e.stopPropagation()

export function RenduFichier({ element, enEdition, contexte, brouillon }: PropsRendu<Fichier>) {
  const c = element.contenu
  const { adresse, enRoute } = useFichier(element, contexte)
  const genre = genreDe(c.nom, c.typeMime)
  const extension = extensionDe(c.nom)
  const apercu = apercuDe(c.nom, c.typeMime, c.icone)
  const lecteur = c.icone ? null : lisible(c.typeMime)
  return (
    <div className="notak-fichier" data-genre={genre} data-icone={c.icone || undefined}>
      {apercu === 'pdf' && adresse && !enRoute && (
        // La première page seulement ; le cadre n'attrape pas le pointeur, la carte reste glissable.
        <iframe className="notak-fichier-pdf" title={t('fichier.premierePage', { nom: c.titre ?? c.nom })} src={adresseApercuPdf(adresse)} loading="lazy" tabIndex={-1} />
      )}
      {lecteur === 'video' && adresse && (
        <video className="notak-fichier-video" src={adresse} controls preload="metadata" onPointerDown={garder} onDoubleClick={(e) => e.stopPropagation()} />
      )}
      <div className="notak-fichier-tete">
        <span className="notak-fichier-badge" aria-hidden>
          <Icone nom={ICONE_DU_GENRE[genre]} taille={22} trait={1.5} />
          {extension ? extension.slice(0, 4).toUpperCase() : t('type.fichier').toUpperCase()}
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
                <span className="notak-roue" aria-hidden /> {t('fichier.envoi')}
              </>
            )}
            {adresse && !enRoute && (
              <>
                {' · '}
                <a href={adresse} download={c.nom} onPointerDown={garder}>
                  {t('fichier.telecharger')}
                </a>
                {' · '}
                <a href={adresse} target="_blank" rel="noopener noreferrer" onPointerDown={garder}>
                  {t('commun.ouvrir')}
                </a>
              </>
            )}
            {adresse === null && ` · ${t('fichier.introuvable')}`}
          </span>
        </div>
      </div>
      {lecteur === 'son' && adresse && (
        <audio className="notak-fichier-son" src={adresse} controls preload="metadata" onPointerDown={garder} />
      )}
      {enEdition ? (
        <Legende contenu={c} ecrire={brouillon} finir={contexte.finirEdition} />
      ) : (
        c.legende && <div className="notak-fichier-legende">{c.legende}</div>
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

/** La légende sous la carte ; vidée, elle disparaît. Entrée ferme. */
function Legende({ contenu, ecrire, finir }: { contenu: Fichier; ecrire(c: Fichier): void; finir(): void }) {
  return (
    <input
      className="notak-fichier-legende notak-fichier-champ"
      aria-label={t('note.legende')}
      placeholder={t('fichier.legendePoints')}
      maxLength={500}
      defaultValue={contenu.legende ?? ''}
      onPointerDown={garder}
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

export function OutilsFichier({ elements, contexte }: PropsOutils<Fichier>) {
  if (elements.length !== 1) return null
  const el = elements[0]!
  return (
    <>
      {!contexte.services.lectureSeule && (
        <BoutonOutil icone="modifier" secondaire titre={t('fichier.renommer.titre')} libelle={t('menu.renommer')} onClick={() => contexte.commencerEdition(el.id)} />
      )}
      {!contexte.services.lectureSeule && (
        <BoutonOutil
          icone="reduire"
          secondaire
          titre={el.contenu.icone ? t('fichier.montrerApercu') : t('fichier.reduire')}
          libelle={t('tableau.icone')}
          actif={!!el.contenu.icone}
          onClick={() => {
            const { icone: _, ...reste } = el.contenu
            contexte.magasin.faire([{ type: 'contenu', id: el.id, avant: el.contenu, apres: el.contenu.icone ? reste : { ...reste, icone: true } }])
          }}
        />
      )}
      <BoutonOutil icone="ouvrir" titre={t('menu.ouvrirOnglet')} libelle={t('commun.ouvrir')} onClick={() => void ouvrirFichier(el.contenu, contexte)} />
    </>
  )
}

export async function ouvrirFichier(c: Fichier, contexte: PropsOutils['contexte']) {
  const a = await contexte.services.fichiers?.adresse(c.fichier)
  if (a) window.open(a, '_blank', 'noopener,noreferrer')
}
