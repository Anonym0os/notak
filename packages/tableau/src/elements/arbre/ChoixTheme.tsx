import { type ReactNode, useLayoutEffect, useRef } from 'react'
import { t } from '../../langue'
import { DecorDiapo } from './diapo/decor'
import { Flottant } from './Flottant'
import type { ReglagesPitch } from '../../coeur/tableau'
import { useHabillagesPublies } from '../../habillage/catalogue'
import type { ReglagePitch } from './modele/pitch'
import { type RatioPitch, type ThemePitch, THEME_PITCH_PERSO, THEMES_PITCH, dimensionsDuRatio, reglagePitchDe, themeDuPitch, variablesDeTheme } from './themesPitch'

/**
 * Un popover posé sous (ou au-dessus de) son ancre, hors du panneau qui le lance : le panneau défile et rogne, le
 * popover non. Il reste dans la fenêtre : centré sur l'ancre, ramené contre le bord s'il le dépasse, retourné de l'autre
 * côté si la place manque, borné et défilant sinon (Flottant). Il se ferme au clic dehors et à Échap.
 */
export function PopoverFixe({ ancre, fermer, largeur, vers = 'bas', children, className }: { ancre: HTMLElement | null; fermer(): void; largeur: number; vers?: 'bas' | 'haut'; children: ReactNode; className?: string }) {
  const racine = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const dehors = (e: PointerEvent) => {
      const cible = e.target as Node
      // Un clic dans un autre popover du mode Pitch (le sélecteur de thèmes ouvert depuis les réglages) ne le ferme pas.
      if (!racine.current?.contains(cible) && !ancre?.contains(cible) && !(cible as Element).closest?.('.notak-arbre-pitch-popover')) fermer()
    }
    const echap = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      e.preventDefault()
      fermer()
    }
    document.addEventListener('pointerdown', dehors, true)
    document.addEventListener('keydown', echap, true)
    return () => {
      document.removeEventListener('pointerdown', dehors, true)
      document.removeEventListener('keydown', echap, true)
    }
  }, [ancre, fermer])
  if (!ancre) return null
  return (
    <Flottant
      racine={racine}
      ancre={ancre}
      cote={vers}
      alignement="centre"
      ecart={8}
      largeur={largeur}
      className={className ? `notak-arbre-pitch-popover ${className}` : 'notak-arbre-pitch-popover'}
      role="dialog"
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {children}
    </Flottant>
  )
}

/** La taille d'une vignette selon le rapport : la plus grande dimension à 112. */
const tailleVignette = (r: RatioPitch) => {
  const { l, h } = dimensionsDuRatio(r)
  const k = 112 / Math.max(l, h)
  return { l: Math.round(l * k), h: Math.round(h * k) }
}

const largeurPopover = (r: RatioPitch) => ({ '16:9': 276, '4:3': 276, '3:4': 316, '9:16': 304 })[r]

/**
 * La vignette d'un thème (relevé 12 § 8.7) : « Pitch Mode » dans la police et la couleur du thème, sur le décor de son
 * sujet central, sur l'aplat de la vignette (le clair y est blanc pur).
 */
export function VignetteTheme({ theme: th, ratio, taille }: { theme: ThemePitch; ratio: RatioPitch; taille: { l: number; h: number } }) {
  return (
    <span className="notak-arbre-pitch-vignette-diapo" data-theme={th.id} style={{ ...variablesDeTheme(th), width: taille.l, height: taille.h, background: th.fondVignette ?? th.fond, fontSize: Math.round(Math.min(taille.l, taille.h) * 0.2) }}>
      <DecorDiapo theme={th} ratio={ratio} niveau="central" gabarit="sujet" branche={0} graine={0} />
      <span className="notak-arbre-pitch-vignette-titre">{t('arbre.pitch.theme.vignette')}</span>
    </span>
  )
}

/**
 * Le sélecteur de thèmes : une vignette par thème, deux par ligne, ceux de Notak puis ceux des habillages disponibles.
 * Le choix ne ferme pas la fenêtre.
 */
export function ChoixTheme({ ancre, pitch, ratio, choisir, fermer, vers }: { ancre: HTMLElement | null; pitch: ReglagesPitch | undefined; ratio: RatioPitch; choisir(reglage: ReglagePitch): void; fermer(): void; vers?: 'bas' | 'haut' }) {
  const taille = tailleVignette(ratio)
  const habillages = useHabillagesPublies()
  const courant = themeDuPitch(pitch).id
  const choix = [
    ...THEMES_PITCH.map((th) => ({ cle: th.id, th, reglage: { theme: th.id, perso: null } as ReglagePitch, actif: th.id === courant })),
    ...habillages.flatMap((h) => {
      if (!h.pitch) return []
      const reglage = reglagePitchDe({ ...h, pitch: h.pitch })
      return [{ cle: `habillage:${h.id}`, th: themeDuPitch(reglage), reglage, actif: courant === THEME_PITCH_PERSO && pitch?.perso?.id === h.id }]
    }),
  ]
  return (
    <PopoverFixe ancre={ancre} fermer={fermer} largeur={largeurPopover(ratio)} {...(vers ? { vers } : {})} className="notak-arbre-pitch-themes">
      {choix.map(({ cle, th, reglage, actif }) => (
        <button key={cle} type="button" className="notak-arbre-pitch-vignette" aria-pressed={actif} onClick={() => choisir(reglage)}>
          <span className="notak-arbre-pitch-vignette-cadre">
            <VignetteTheme theme={th} ratio={ratio} taille={taille} />
          </span>
          <span className="notak-arbre-pitch-legende">{t(th.nom)}</span>
        </button>
      ))}
    </PopoverFixe>
  )
}
