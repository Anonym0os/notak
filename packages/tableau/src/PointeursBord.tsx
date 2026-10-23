import { useEffect, useMemo, useRef, useState } from 'react'
import type { Camera, Vue } from './coeur/camera'
import { type CibleBord, pointeursDeBord } from './coeur/pointeurs'
import type { Point } from './coeur/geometrie'
import { t } from './langue'

/** Après un changement d'échelle, la couche reste effacée ce temps-là, en millisecondes. */
const ZOOM_REPOS = 250
/** La barre de gauche cache les 72 premiers pixels de la vue. */
const BARRE = 72

/**
 * Les pointeurs de bord de vue : une personne dont le curseur est sorti de l'écran, ou une activité récente qu'on ne
 * voit pas, se signale par un disque contre le bord, flèche tournée vers elle. Un clic y emmène la vue. La couche
 * s'efface pendant un zoom.
 */
export function PointeursBord({ cibles, camera, vue, aller }: { cibles: readonly CibleBord[]; camera: Camera; vue: Vue; aller(ou: Point): void }) {
  const [zoom, setZoom] = useState(false)
  const echelle = useRef(camera.echelle)
  useEffect(() => {
    if (echelle.current === camera.echelle) return
    echelle.current = camera.echelle
    setZoom(true)
    const fin = setTimeout(() => setZoom(false), ZOOM_REPOS)
    return () => clearTimeout(fin)
  }, [camera.echelle])
  const pointeurs = useMemo(() => pointeursDeBord(cibles, camera, vue, BARRE), [cibles, camera, vue])
  if (zoom || pointeurs.length === 0) return null
  return (
    <div className="notak-pointeurs" aria-hidden={false}>
      {pointeurs.map((p) => (
        <button
          key={p.cle}
          type="button"
          className="notak-pointeur"
          data-genre={p.genre}
          style={{ left: p.x, top: p.y, ...(p.couleur ? { ['--notak-autre' as string]: p.couleur } : {}) }}
          title={p.genre === 'personne' ? t('pointeur.personne', { nom: p.nom }) : t('pointeur.activite')}
          aria-label={p.genre === 'personne' ? t('pointeur.personne', { nom: p.nom }) : t('pointeur.activite')}
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={() => aller(p.vers)}
        >
          <span className="notak-pointeur-fleche" style={{ transform: `rotate(${p.angle}deg)` }} />
          <span className="notak-pointeur-texte">{p.genre === 'activite' ? p.nombre : p.nom.trim().charAt(0).toUpperCase()}</span>
        </button>
      ))}
    </div>
  )
}
