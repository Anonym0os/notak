import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Id } from '../../coeur/tableau'
import { type Ctx, sujetDEntete } from './diapo/commun'
import { DecorDiapo } from './diapo/decor'
import { type FormesDiapo, formesDe } from './diapo/formes'
import { GABARITS } from './diapo/gabarits'
import { mesurer, oublierMesures, police } from './diapo/mesure'
import type { Diapo as DiapoDonnee } from './modele/diapositives'
import { TAILLES_DE_BASE, dimensions, socle, unites } from './modele/dimensions'
import type { Lecture } from './modele/sujets'
import { type RatioPitch, type ThemePitch, variablesDeTheme } from './themesPitch'

/**
 * Une diapositive du mode Pitch (docs/XMIND.md § 12, relevés 11 et 12 § 8.1). Elle se dessine à la taille de base de son
 * rapport (1600 × 900, 1200 × 900, 900 × 1600, 900 × 1200), en pixels réels, puis une seule mise à l'échelle la réduit à
 * son cadre : la même diapositive sert en plein écran, dans l'aperçu de l'onglet Pitch et dans les vignettes. Deux
 * couches : le décor du thème dessous, le contenu du gabarit dessus.
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
  /** Le mélange des décors, tiré une fois par présentation (0 dans l'aperçu). */
  graine?: number
  /** La vue du présentateur : les éléments à venir se devinent (0,3 au lieu de 0). */
  presentateur?: boolean
  /** Des formes à la place de celles du thème. */
  formes?: Partial<FormesDiapo>
  className?: string
}

/** L'échelle d'une diapositive dans son cadre, arrondie à quatre décimales (relevé 12 § 8.1). */
export const echelleDe = (ratio: RatioPitch, taille: { l: number; h: number }): number => {
  const b = TAILLES_DE_BASE[ratio]
  return Math.round(Math.min(taille.l / b.l, taille.h / b.h) * 10000) / 10000
}

/** Les polices chargent après le premier dessin : on remesure quand elles arrivent. */
function usePolicesChargees(): number {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined
    if (!fonts?.addEventListener) return
    let vivant = true
    const relire = () => {
      if (!vivant) return
      oublierMesures()
      setVersion((v) => v + 1)
    }
    fonts.addEventListener('loadingdone', relire)
    void fonts.ready?.then(() => fonts.status === 'loaded' && relire())
    return () => {
      vivant = false
      fonts.removeEventListener('loadingdone', relire)
    }
  }, [])
  return version
}

/** Le cadre : le rapport demandé, de la taille donnée ou de toute la largeur de son parent ; dedans, la diapositive à sa taille de base. */
export function CadreDiapo({ ratio, theme, taille, className, presentateur, decor, attributs, children }: { ratio: RatioPitch; theme: ThemePitch; taille?: { l: number; h: number } | undefined; className?: string | undefined; presentateur?: boolean | undefined; decor?: ReactNode; attributs?: Record<string, string | undefined>; children: ReactNode }) {
  const base = TAILLES_DE_BASE[ratio]
  const cadre = useRef<HTMLDivElement>(null)
  const [largeur, setLargeur] = useState<number | null>(null)
  // Sans taille donnée, le cadre suit la largeur de son parent : on la mesure.
  useLayoutEffect(() => {
    if (taille) return
    const el = cadre.current
    if (!el) return
    const lire = () => setLargeur(el.getBoundingClientRect().width || null)
    lire()
    if (typeof ResizeObserver === 'undefined') return
    const o = new ResizeObserver(lire)
    o.observe(el)
    return () => o.disconnect()
  }, [taille])
  const echelle = taille ? echelleDe(ratio, taille) : largeur ? Math.round((largeur / base.l) * 10000) / 10000 : 0
  const style: CSSProperties = { ...variablesDeTheme(theme), aspectRatio: `${base.l} / ${base.h}`, ...(taille ? { width: taille.l, height: taille.h } : { width: '100%' }) }
  return (
    <div ref={cadre} className={className ? `notak-arbre-diapo-cadre ${className}` : 'notak-arbre-diapo-cadre'} style={style} data-ratio={ratio} data-theme={theme.id} data-presentateur={presentateur ? '' : undefined}>
      <div className="notak-arbre-diapo" style={{ width: base.l, height: base.h, transform: `scale(${echelle})` }} {...attributs}>
        <div className="notak-arbre-diapo-decor">{decor}</div>
        <div className="notak-arbre-diapo-contenu">{children}</div>
      </div>
    </div>
  )
}

/** L'indice de la branche principale d'un sujet parmi les enfants du central (0 pour le central lui-même). */
function brancheDe(l: Lecture, id: Id): number {
  const principal = sujetDEntete(l, id) ?? id
  const i = (l.enfants.get(l.central) ?? []).indexOf(principal)
  return i >= 0 ? i : 0
}

export function Diapositive({ lecture: l, diapo, theme, ratio, adresse, taille, graine = 0, presentateur, formes, className }: Props) {
  usePolicesChargees()
  const c: Ctx = {
    l,
    ratio,
    u: unites(ratio),
    s: socle(ratio),
    d: dimensions(ratio),
    mesurer,
    polices: {
      texte: police(theme.police, theme.graisse),
      titre: police(theme.policeTitre, theme.graisseTitre),
      gras: police(theme.police, 700),
      italique: police(theme.police, theme.graisse, true),
    },
    formes: formesDe({ ...theme.formes, ...formes }),
    adresse,
    releve: { sousSujets: [] },
  }
  // Le gabarit se pose d'abord : il relève la place de son titre et de ses sous-sujets, que le décor suit.
  const Gabarit = diapo.type === 'fin' ? GABARITS.fin : GABARITS[diapo.gabarit]
  const contenu = Gabarit({ c, diapo } as never)
  const niveau = diapo.type === 'fin' ? 'epilogue' : diapo.niveau
  return (
    <CadreDiapo
      ratio={ratio}
      theme={theme}
      taille={taille}
      className={className}
      presentateur={presentateur}
      attributs={{ 'data-gabarit': diapo.gabarit, 'data-type': diapo.type, 'data-sujet': diapo.sujet, ...(diapo.type === 'resume' ? { 'data-moment': diapo.moment } : {}) }}
      decor={<DecorDiapo theme={theme} ratio={ratio} niveau={niveau} gabarit={diapo.gabarit} branche={brancheDe(l, diapo.sujet)} graine={graine} titre={c.releve.titre} sousSujets={c.releve.sousSujets.length ? c.releve.sousSujets : undefined} />}
    >
      {contenu}
    </CadreDiapo>
  )
}
