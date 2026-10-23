import { useState } from 'react'

/**
 * Le point d'activité non vue d'un élément : un disque de 7 px au coin haut droit. Il reçoit la souris (sa zone fait
 * 19 px) et son infobulle paraît tout de suite, sans le délai des autres : qui a touché, et il y a combien de temps.
 */
export function PointActivite({ gauche, haut, texte }: { gauche: number; haut: number; texte: string }) {
  const [survol, setSurvol] = useState(false)
  return (
    <span
      className="notak-activite"
      style={{ left: gauche, top: haut }}
      onPointerEnter={() => setSurvol(true)}
      onPointerLeave={() => setSurvol(false)}
      // Le point n'est ni un élément ni le vide : un appui dessus ne lance ni lasso ni glisser.
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      aria-label={texte}
    >
      {survol && (
        <span className="notak-activite-bulle" role="tooltip">
          {texte}
        </span>
      )}
    </span>
  )
}
