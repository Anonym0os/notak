import { type MutableRefObject, useCallback, useLayoutEffect, useRef } from 'react'
import * as cam from './coeur/camera'
import type { Rect } from './coeur/geometrie'
import { t } from './langue'

/** L'écart entre la barre et l'élément, et entre la barre et les bords de la vue. */
const ECART = 10
const BORD = 8

/**
 * Où poser la barre, en pixels de la vue : centrée sur l'élément, au-dessus de lui ; dessous s'il touche le haut ;
 * collée au haut libre de la vue s'il est plus grand qu'elle ; toujours entière dans la largeur. `null` : l'élément
 * est sorti de la vue, la barre se cache.
 */
export function placerActions(
  ecran: Rect,
  taille: { largeur: number; hauteur: number },
  vue: cam.Vue,
  libre: { haut: number; bas: number },
): { x: number; y: number } | null {
  const haut = libre.haut
  const bas = vue.hauteur - libre.bas
  if (ecran.max.y < haut || ecran.min.y > bas || ecran.max.x < 0 || ecran.min.x > vue.largeur) return null
  const milieu = (ecran.min.x + ecran.max.x) / 2
  const xMax = vue.largeur - BORD - taille.largeur
  const x = xMax < BORD ? BORD : Math.min(Math.max(milieu - taille.largeur / 2, BORD), xMax)
  const dessus = ecran.min.y - ECART - taille.hauteur
  const dessous = ecran.max.y + ECART
  const y = dessus >= haut ? dessus : dessous + taille.hauteur <= bas ? dessous : haut
  return { x: Math.round(x), y: Math.round(y) }
}

/**
 * Au doigt et au Pencil, un élément touché montre aussitôt ses gestes les plus courants juste au-dessus de lui, comme
 * le menu d'édition d'iOS : couper, copier, dupliquer, supprimer, et « ••• » pour tout le reste (le menu de l'appui
 * long). Ses outils de mise en forme restent dans la barre de gauche (tablette) ou la capsule du bas (téléphone).
 *
 * La barre suit l'élément image par image : quand le doigt tire ou pince la toile, la caméra du geste ne passe pas par
 * React (Toile.tsx, `poserVite`) ; elle arrive ici par `suivi`, et la barre se replace directement sur le DOM, dans la
 * même image que la toile. Elle se mesure pour rester entière dans la vue.
 */
export function ActionsRapides({
  cadre,
  camera,
  vue,
  libre,
  suivi,
  couper,
  copier,
  dupliquer,
  supprimer,
  plus,
}: {
  /** L'englobant de la sélection, en unités du tableau. */
  cadre: Rect
  /** La caméra du dernier rendu ; `suivi` donne celle du geste en cours. */
  camera: cam.Camera
  vue: cam.Vue
  /** Les bandes du haut et du bas que couvre l'interface, en pixels. */
  libre: { haut: number; bas: number }
  /** Où la toile branche le replacement de la barre pendant un geste. */
  suivi: MutableRefObject<((c: cam.Camera) => void) | null>
  couper(): void
  copier(): void
  dupliquer(): void
  supprimer(): void
  plus(): void
}) {
  const barre = useRef<HTMLDivElement>(null)
  const derniers = useRef({ cadre, vue, libre })
  derniers.current = { cadre, vue, libre }

  const placer = useCallback((c: cam.Camera) => {
    const b = barre.current
    if (!b) return
    const { cadre: r, vue: v, libre: l } = derniers.current
    const ecran = { min: cam.versEcran(c, r.min), max: cam.versEcran(c, r.max) }
    const ou = placerActions(ecran, { largeur: b.offsetWidth, hauteur: b.offsetHeight }, v, l)
    if (!ou) {
      b.style.visibility = 'hidden'
      return
    }
    b.style.visibility = ''
    b.style.transform = `translate3d(${ou.x}px, ${ou.y}px, 0)`
  }, [])

  // Avant d'être peinte, puis à chaque rendu (sélection, vue, caméra posée par React).
  useLayoutEffect(() => placer(camera))
  useLayoutEffect(() => {
    suivi.current = placer
    return () => {
      if (suivi.current === placer) suivi.current = null
    }
  }, [suivi, placer])

  const bouton = (libelle: string, faire: () => void, danger = false) => (
    <button type="button" data-danger={danger || undefined} onClick={faire}>
      {libelle}
    </button>
  )
  return (
    <div
      ref={barre}
      className="notak-gestes-rapides"
      role="toolbar"
      style={{ visibility: 'hidden' }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {bouton(t('toile.couper'), couper)}
      {bouton(t('commun.copier'), copier)}
      {bouton(t('raccourcis.dupliquer'), dupliquer)}
      {bouton(t('menu.supprimer'), supprimer, true)}
      <button type="button" aria-label={t('barre.plusOutils')} onClick={plus}>
        •••
      </button>
    </div>
  )
}
