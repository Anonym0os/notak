import type { CSSProperties, ReactNode } from 'react'
import type { Id } from '../../coeur/tableau'
import { type Diapo as DiapoDonnee, type DiapoListe, type ItemListe, placeImageDe } from './modele/diapositives'
import type { Lecture } from './modele/sujets'
import { type RatioPitch, type ThemePitch, dimensionsDuRatio } from './themesPitch'

/**
 * Une diapositive du mode Pitch (docs/XMIND.md § 9), dessinée en HTML : elle remplit son cadre, dont toutes les
 * tailles se comptent en `cqw` (un centième de la largeur du cadre), pour que la même diapositive serve en plein
 * écran, dans l'aperçu de l'onglet Pitch et dans les vignettes du sélecteur de thèmes.
 */

export const variablesDeTheme = (th: ThemePitch): CSSProperties =>
  ({ '--d-fond': th.fond, '--d-texte': th.texte, '--d-accent': th.accent, '--d-police': th.police, '--d-motif': th.motif, '--d-rayon': th.rayon }) as CSSProperties

interface Props {
  lecture: Lecture
  diapo: DiapoDonnee
  /** L'étape montrée (à partir de 1) : les éléments d'une liste qui arrivent plus tard restent cachés. */
  etape: number
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
    <div className={className ? `notak-diapo-cadre ${className}` : 'notak-diapo-cadre'} style={style} data-ratio={ratio}>
      <div className="notak-diapo">{children}</div>
    </div>
  )
}

export function Diapositive({ lecture: l, diapo, etape, theme, ratio, adresse, anime = true, taille, className }: Props) {
  return (
    <CadreDiapo ratio={ratio} theme={theme} taille={taille} className={className}>
      {diapo.type === 'sujet' ? <DiapoDeSujet l={l} id={diapo.sujet} adresse={adresse} /> : <DiapoDeListe l={l} diapo={diapo} etape={etape} anime={anime} />}
    </CadreDiapo>
  )
}

/** La diapositive d'un sujet : son titre, et son image à la place que les réglages disent. */
function DiapoDeSujet({ l, id, adresse }: { l: Lecture; id: Id; adresse: Props['adresse'] }) {
  const s = l.sujets.get(id)
  if (!s) return null
  const src = s.image ? adresse?.(s.image.fichier) : undefined
  const place = placeImageDe(l, id).valeur
  const central = id === l.central
  return (
    <div className="notak-diapo-sujet" data-central={central ? '' : undefined} data-image={src ? place : undefined}>
      {src && <img src={src} alt="" draggable={false} />}
      <h1>{aplatir(s.titre)}</h1>
    </div>
  )
}

/** Les groupes d'une liste : chaque sous-sujet direct avec ce qui descend de lui. */
function groupes(items: readonly ItemListe[]): ItemListe[][] {
  const sortie: ItemListe[][] = []
  for (const i of items) {
    if (i.niveau === 0) sortie.push([i])
    else sortie.at(-1)?.push(i)
  }
  return sortie
}

function DiapoDeListe({ l, diapo, etape, anime }: { l: Lecture; diapo: DiapoListe; etape: number; anime: boolean }) {
  const titre = aplatir(l.sujets.get(diapo.sujet)?.titre ?? '')
  const texte = (id: Id) => aplatir(l.sujets.get(id)?.titre ?? '')
  const etat = (i: ItemListe) => (i.etape > etape ? 'cache' : i.etape === etape ? 'courant' : 'passe')
  const items = (liste: readonly ItemListe[]) =>
    liste.map((i) => (
      <li key={i.id} data-niveau={Math.min(i.niveau, 3)} data-etat={etat(i)} data-anime={anime ? '' : undefined}>
        <span>{texte(i.id)}</span>
      </li>
    ))
  const gs = groupes(diapo.items)
  return (
    <div className="notak-diapo-liste" data-mise={diapo.miseEnPage}>
      {diapo.miseEnPage === 'accolade' && (
        <>
          <h2>{titre}</h2>
          <svg className="notak-diapo-accolade" viewBox="0 0 20 100" preserveAspectRatio="none" aria-hidden>
            <path d="M18 2 C8 2 10 10 10 22 L10 38 C10 46 6 50 2 50 C6 50 10 54 10 62 L10 78 C10 90 8 98 18 98" />
          </svg>
          <ul>{items(diapo.items)}</ul>
        </>
      )}
      {(diapo.miseEnPage === 'puces' || diapo.miseEnPage === 'paroles') && (
        <>
          <h2>{titre}</h2>
          <ul>{items(diapo.items)}</ul>
        </>
      )}
      {(diapo.miseEnPage === 'arete' || diapo.miseEnPage === 'chronologie') && (
        <>
          <h2>{titre}</h2>
          <div className="notak-diapo-axe">
            <div className="notak-diapo-trait" />
            {gs.map((g, rang) => (
              <div key={g[0]!.id} className="notak-diapo-etape" data-cote={rang % 2 === 0 ? 'haut' : 'bas'} data-etat={etat(g[0]!)} data-anime={anime ? '' : undefined}>
                <span className="notak-diapo-point" />
                <div className="notak-diapo-etiquette">
                  <strong>{texte(g[0]!.id)}</strong>
                  {g.slice(1).map((i) => (
                    <em key={i.id}>{texte(i.id)}</em>
                  ))}
                </div>
              </div>
            ))}
            {diapo.miseEnPage === 'arete' && <div className="notak-diapo-tete">{titre}</div>}
          </div>
        </>
      )}
    </div>
  )
}
