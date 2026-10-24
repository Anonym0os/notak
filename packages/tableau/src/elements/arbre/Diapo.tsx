import type { CSSProperties, ReactNode } from 'react'
import type { Id } from '../../coeur/tableau'
import { t } from '../../langue'
import type { Diapo as DiapoDonnee, DiapoListe, DiapoResume, ItemListe, PlaceImage } from './modele/diapositives'
import type { Lecture } from './modele/sujets'
import { type RatioPitch, type ThemePitch, dimensionsDuRatio, variablesDeTheme } from './themesPitch'

/**
 * Une diapositive du mode Pitch (docs/XMIND.md § 12), dessinée en HTML : elle remplit son cadre, dont toutes les
 * tailles se comptent en `cqw` (un centième de la largeur du cadre), pour que la même diapositive serve en plein
 * écran, dans l'aperçu de l'onglet Pitch et dans les vignettes du sélecteur de thèmes.
 */

interface Props {
  lecture: Lecture
  /** La diapositive : son gabarit, son sujet, et pour une liste l'état de chaque enfant à cette étape. */
  diapo: DiapoDonnee
  theme: ThemePitch
  ratio: RatioPitch
  adresse?: ((fichier: Id) => string | undefined) | undefined
  /** Sans animation, tout paraît d'un coup. */
  anime?: boolean
  /** Le cadre prend toute la largeur du parent (l'aperçu) ou la taille donnée en px (la scène). */
  taille?: { l: number; h: number } | undefined
  className?: string
}

const aplatir = (s: string) => s.replace(/\n/g, ' ')

/** Le cadre : le rapport demandé, de la taille donnée ou de toute la largeur de son parent. */
export function CadreDiapo({ ratio, theme, taille, className, children }: { ratio: RatioPitch; theme: ThemePitch; taille?: { l: number; h: number } | undefined; className?: string | undefined; children: ReactNode }) {
  const { l, h } = dimensionsDuRatio(ratio)
  const style: CSSProperties = { ...variablesDeTheme(theme), aspectRatio: `${l} / ${h}`, ...(taille ? { width: taille.l, height: taille.h } : { width: '100%' }) }
  return (
    <div className={className ? `notak-arbre-diapo-cadre ${className}` : 'notak-arbre-diapo-cadre'} style={style} data-ratio={ratio}>
      <div className="notak-arbre-diapo">{children}</div>
    </div>
  )
}

/**
 * Le dessin se contente pour l'instant des rendus existants : chaque gabarit retombe sur le plus proche (le dessin
 * fidèle de chaque gabarit viendra ensuite) ; `data-gabarit` dit lequel la diapositive demande.
 */
export function Diapositive({ lecture: l, diapo, theme, ratio, adresse, anime = true, taille, className }: Props) {
  return (
    <CadreDiapo ratio={ratio} theme={theme} taille={taille} className={className}>
      {diapo.type === 'sujet' ? (
        <DiapoDeSujet l={l} id={diapo.sujet} place={diapo.placeImage} adresse={adresse} />
      ) : diapo.type === 'fin' ? (
        <div className="notak-arbre-diapo-sujet" data-central="" data-gabarit={diapo.gabarit}>
          <h1>{t('arbre.pitch.merci')}</h1>
        </div>
      ) : diapo.type === 'resume' ? (
        <DiapoDeResume l={l} diapo={diapo} />
      ) : (
        <DiapoDeListe l={l} diapo={diapo} anime={anime} />
      )}
    </CadreDiapo>
  )
}

/** La diapositive d'un sujet : son titre, et son image à la place que les réglages (ou Auto) disent. */
function DiapoDeSujet({ l, id, place, adresse }: { l: Lecture; id: Id; place: PlaceImage | undefined; adresse: Props['adresse'] }) {
  const s = l.sujets.get(id)
  if (!s) return null
  const src = s.image ? adresse?.(s.image.fichier) : undefined
  const central = id === l.central
  return (
    <div className="notak-arbre-diapo-sujet" data-central={central ? '' : undefined} data-image={src ? (place ?? 'gauche') : undefined}>
      {src && <img src={src} alt="" draggable={false} />}
      <h1>{aplatir(s.titre)}</h1>
    </div>
  )
}

/** Le rendu de repli de chaque disposition de liste. */
const RENDU: Record<DiapoListe['disposition'], 'accolade' | 'puces' | 'paroles' | 'arete' | 'chronologie'> = {
  accolade: 'accolade',
  puces: 'puces',
  paroles: 'paroles',
  arete: 'arete',
  chronologie: 'chronologie',
  'tete-arete': 'puces',
  'tete-chronologie': 'puces',
}

function DiapoDeListe({ l, diapo, anime }: { l: Lecture; diapo: DiapoListe; anime: boolean }) {
  const titre = aplatir(l.sujets.get(diapo.sujet)?.titre ?? '')
  const texte = (id: Id) => aplatir(l.sujets.get(id)?.titre ?? '')
  const mise = RENDU[diapo.disposition]
  const items = (liste: readonly ItemListe[]) =>
    liste.map((i) => (
      <li key={i.id} data-niveau={0} data-etat={i.etat} data-anime={anime ? '' : undefined}>
        <span>{texte(i.id)}</span>
      </li>
    ))
  return (
    <div className="notak-arbre-diapo-liste" data-mise={mise} data-gabarit={diapo.gabarit}>
      {mise === 'accolade' && (
        <>
          <h2>{titre}</h2>
          <svg className="notak-arbre-diapo-accolade" viewBox="0 0 20 100" preserveAspectRatio="none" aria-hidden>
            <path d="M18 2 C8 2 10 10 10 22 L10 38 C10 46 6 50 2 50 C6 50 10 54 10 62 L10 78 C10 90 8 98 18 98" />
          </svg>
          <ul>{items(diapo.items)}</ul>
        </>
      )}
      {(mise === 'puces' || mise === 'paroles') && (
        <>
          <h2>{titre}</h2>
          <ul>{items(diapo.items)}</ul>
        </>
      )}
      {(mise === 'arete' || mise === 'chronologie') && (
        <>
          <h2>{titre}</h2>
          <div className="notak-arbre-diapo-axe">
            <div className="notak-arbre-diapo-trait" />
            {diapo.items.map((i, rang) => (
              <div key={i.id} className="notak-arbre-diapo-etape" data-cote={rang % 2 === 0 ? 'haut' : 'bas'} data-etat={i.etat} data-anime={anime ? '' : undefined}>
                <span className="notak-arbre-diapo-point" />
                <div className="notak-arbre-diapo-etiquette">
                  <strong>{texte(i.id)}</strong>
                </div>
              </div>
            ))}
            {mise === 'arete' && <div className="notak-arbre-diapo-tete">{titre}</div>}
          </div>
        </>
      )}
    </div>
  )
}

/** Une diapositive de résumé, en repli : le résumé en titre, la plage résumée en dessous. */
function DiapoDeResume({ l, diapo }: { l: Lecture; diapo: DiapoResume }) {
  const texte = (id: Id) => aplatir(l.sujets.get(id)?.titre ?? '')
  return (
    <div className="notak-arbre-diapo-liste" data-mise="accolade" data-gabarit={diapo.gabarit}>
      <h2>{texte(diapo.sujet)}</h2>
      <svg className="notak-arbre-diapo-accolade" viewBox="0 0 20 100" preserveAspectRatio="none" aria-hidden>
        <path d="M18 2 C8 2 10 10 10 22 L10 38 C10 46 6 50 2 50 C6 50 10 54 10 62 L10 78 C10 90 8 98 18 98" />
      </svg>
      <ul>
        {diapo.plage.map((id) => (
          <li key={id} data-niveau={0} data-etat="visible">
            <span>{texte(id)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
